import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import MonsterLibrary from "../gm/MonsterLibrary";

interface Participant {
  id: string;
  combat_id: string;
  participant_type: "player" | "monster" | "npc";
  character_id: string | null;
  npc_id: string | null;
  monster_id: string | null;
  display_name: string;
  hp_current: number;
  hp_max: number;
  armor_class: number;
  initiative: number;
  is_active: boolean;
}

interface Combat {
  id: string;
  campaign_id: string;
  name: string;
  status: "active" | "ended";
  current_turn_index: number | null;
  created_at: string;
}

interface Props {
  campaignId: string;
}

export default function CombatTracker({ campaignId }: Props) {
  const { user } = useAuth();
  const [combat, setCombat] = useState<Combat | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [combatName, setCombatName] = useState("Combat");
  const [showMonsters, setShowMonsters] = useState(false);
  const [hpInputs, setHpInputs] = useState<Record<string, string>>({});
  const [initInputs, setInitInputs] = useState<Record<string, string>>({});
  const [addManual, setAddManual] = useState(false);
  const [manualEntry, setManualEntry] = useState({ name: "", hp: 20, ac: 12, type: "monster" as "monster" | "npc" });

  const fetchCombat = useCallback(async () => {
    const { data } = await supabase
      .from("combats")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) {
      setCombat(data as Combat);
      fetchParticipants(data.id);
    } else {
      setCombat(null);
      setParticipants([]);
    }
    setLoading(false);
  }, [campaignId]);

  const fetchParticipants = useCallback(async (combatId: string) => {
    const { data } = await supabase
      .from("combat_participants")
      .select("*")
      .eq("combat_id", combatId)
      .order("initiative", { ascending: false })
      .order("display_name");
    if (data) setParticipants(data as Participant[]);
  }, []);

  useEffect(() => { fetchCombat(); }, [fetchCombat]);

  useEffect(() => {
    if (!combat) return;
    const ch = supabase.channel("combat-gm-" + combat.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_participants", filter: "combat_id=eq." + combat.id }, () => fetchParticipants(combat.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "combats", filter: "id=eq." + combat.id }, (p: any) => {
        setCombat(prev => prev ? { ...prev, ...p.new } : null);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [combat?.id, fetchParticipants]);

  async function startCombat() {
    if (!user) return;
    const { data } = await supabase
      .from("combats")
      .insert({ campaign_id: campaignId, name: combatName || "Combat" })
      .select()
      .single();
    if (!data) return;
    const newCombat = data as Combat;

    // Auto-add all player characters
    const { data: chars } = await supabase
      .from("characters")
      .select("id, name, hp_current, hp_max, armor_class, dex")
      .eq("campaign_id", campaignId);
    if (chars) {
      const inserts = chars.map((c: any) => ({
        combat_id: newCombat.id,
        participant_type: "player" as const,
        character_id: c.id,
        display_name: c.name,
        hp_current: c.hp_current,
        hp_max: c.hp_max,
        armor_class: c.armor_class,
        initiative: 0,
      }));
      if (inserts.length > 0) await supabase.from("combat_participants").insert(inserts);
    }

    // Auto-add active NPCs
    const { data: npcs } = await supabase
      .from("npcs")
      .select("id, name, hp_current, hp_max, armor_class")
      .eq("campaign_id", campaignId)
      .eq("is_active", true);
    if (npcs) {
      const npcInserts = npcs.map((n: any) => ({
        combat_id: newCombat.id,
        participant_type: "npc" as const,
        npc_id: n.id,
        display_name: n.name,
        hp_current: n.hp_current,
        hp_max: n.hp_max,
        armor_class: n.armor_class,
        initiative: 0,
      }));
      if (npcInserts.length > 0) await supabase.from("combat_participants").insert(npcInserts);
    }

    // Switch campaign to combat mode
    await supabase.from("campaigns").update({ mode: "combat", active_combat_id: newCombat.id }).eq("id", campaignId);
    setCombat(newCombat);
    fetchParticipants(newCombat.id);
  }

  async function endCombat() {
    if (!combat) return;
    await supabase.from("combats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", combat.id);

    // Sync HP back to characters
    for (const p of participants) {
      if (p.participant_type === "player" && p.character_id) {
        await supabase.from("characters").update({ hp_current: p.hp_current }).eq("id", p.character_id);
      }
      if (p.participant_type === "npc" && p.npc_id) {
        await supabase.from("npcs").update({ hp_current: p.hp_current }).eq("id", p.npc_id);
      }
    }

    await supabase.from("campaigns").update({ mode: "exploration", active_combat_id: null }).eq("id", campaignId);
    setCombat(null);
    setParticipants([]);
  }

  async function updateInitiative(pId: string, init: number) {
    await supabase.from("combat_participants").update({ initiative: init }).eq("id", pId);
    setInitInputs(ii => ({ ...ii, [pId]: "" }));
  }

  async function applyHp(pId: string, delta: number) {
    const p = participants.find(x => x.id === pId);
    if (!p) return;
    const newHp = Math.max(0, Math.min(p.hp_max, p.hp_current + delta));
    await supabase.from("combat_participants").update({ hp_current: newHp }).eq("id", pId);
    setHpInputs(h => ({ ...h, [pId]: "" }));
  }

  async function toggleActive(pId: string) {
    const p = participants.find(x => x.id === pId);
    if (!p) return;
    await supabase.from("combat_participants").update({ is_active: !p.is_active }).eq("id", pId);
  }

  async function removeParticipant(pId: string) {
    await supabase.from("combat_participants").delete().eq("id", pId);
  }

  async function nextTurn() {
    if (!combat || participants.length === 0) return;
    const active = participants.filter(p => p.is_active && p.hp_current > 0);
    if (active.length === 0) return;
    const currentIdx = combat.current_turn_index ?? -1;
    const nextIdx = (currentIdx + 1) % active.length;
    await supabase.from("combats").update({ current_turn_index: nextIdx }).eq("id", combat.id);
  }

  async function prevTurn() {
    if (!combat || participants.length === 0) return;
    const active = participants.filter(p => p.is_active && p.hp_current > 0);
    if (active.length === 0) return;
    const currentIdx = combat.current_turn_index ?? 0;
    const prevIdx = (currentIdx - 1 + active.length) % active.length;
    await supabase.from("combats").update({ current_turn_index: prevIdx }).eq("id", combat.id);
  }

  function handleSpawnMonster(monster: any, count: number) {
    if (!combat) return;
    const inserts = [];
    for (let i = 0; i < count; i++) {
      inserts.push({
        combat_id: combat.id,
        participant_type: "monster" as const,
        monster_id: monster.id,
        display_name: count > 1 ? monster.name + " " + (i + 1) : monster.name,
        hp_current: monster.hp_default,
        hp_max: monster.hp_default,
        armor_class: monster.armor_class,
        initiative: 0,
      });
    }
    supabase.from("combat_participants").insert(inserts).then(() => {
      setShowMonsters(false);
      if (combat) fetchParticipants(combat.id);
    });
  }

  async function addManualEntry() {
    if (!combat || !manualEntry.name.trim()) return;
    await supabase.from("combat_participants").insert({
      combat_id: combat.id,
      participant_type: manualEntry.type,
      display_name: manualEntry.name,
      hp_current: manualEntry.hp,
      hp_max: manualEntry.hp,
      armor_class: manualEntry.ac,
      initiative: 0,
    });
    setManualEntry({ name: "", hp: 20, ac: 12, type: "monster" });
    setAddManual(false);
    fetchParticipants(combat.id);
  }

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Chargement...</p>;

  // No active combat - show start screen
  if (!combat) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>Combat</h2>
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "1rem" }}>Aucun combat en cours</p>
          <input className="input" placeholder="Nom du combat" value={combatName} onChange={e => setCombatName(e.target.value)} style={{ marginBottom: "0.75rem", textAlign: "center" }} />
          <button className="btn btn--danger" onClick={startCombat} style={{ width: "100%" }}>Lancer le combat</button>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>Tous les joueurs et PNJ actifs seront ajoutes automatiquement.</p>
        </div>
      </div>
    );
  }

  const activeParticipants = participants.filter(p => p.is_active && p.hp_current > 0);
  const downedParticipants = participants.filter(p => !p.is_active || p.hp_current <= 0);
  const currentTurnId = activeParticipants[combat.current_turn_index ?? 0]?.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Combat header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1.25rem", color: "var(--color-error)" }}>{combat.name}</h2>
        <button className="btn btn--ghost" onClick={endCombat} style={{ fontSize: "0.75rem", color: "var(--color-error)" }}>Fin du combat</button>
      </div>

      {/* Turn controls */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem" }}>
        <button className="btn btn--ghost" onClick={prevTurn} style={{ fontSize: "1.25rem", padding: "0.25rem 0.5rem" }}>&lt;</button>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Tour actuel</p>
          <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-accent)" }}>
            {activeParticipants[combat.current_turn_index ?? 0]?.display_name || "—"}
          </p>
        </div>
        <button className="btn btn--primary" onClick={nextTurn} style={{ fontSize: "1.25rem", padding: "0.25rem 0.5rem" }}>&gt;</button>
      </div>

      {/* Add buttons */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn btn--ghost" onClick={() => { setShowMonsters(!showMonsters); setAddManual(false); }} style={{ flex: 1, fontSize: "0.75rem" }}>{showMonsters ? "Fermer bestiaire" : "+ Monstre"}</button>
        <button className="btn btn--ghost" onClick={() => { setAddManual(!addManual); setShowMonsters(false); }} style={{ flex: 1, fontSize: "0.75rem" }}>{addManual ? "Annuler" : "+ Manuel"}</button>
      </div>

      {showMonsters && (
        <div className="animate-fade-in">
          <MonsterLibrary onSpawnMonster={handleSpawnMonster} selectionMode={true} />
        </div>
      )}

      {addManual && (
        <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input className="input" placeholder="Nom" value={manualEntry.name} onChange={e => setManualEntry({ ...manualEntry, name: e.target.value })} autoFocus />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>PV</label><input className="input" type="number" value={manualEntry.hp} onChange={e => setManualEntry({ ...manualEntry, hp: parseInt(e.target.value) || 1 })} style={{ fontFamily: "var(--font-mono)" }} /></div>
            <div style={{ flex: 1 }}><label style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>CA</label><input className="input" type="number" value={manualEntry.ac} onChange={e => setManualEntry({ ...manualEntry, ac: parseInt(e.target.value) || 10 })} style={{ fontFamily: "var(--font-mono)" }} /></div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>Type</label>
              <button className={manualEntry.type === "monster" ? "btn btn--danger" : "btn btn--secondary"} style={{ width: "100%", fontSize: "0.6875rem" }} onClick={() => setManualEntry({ ...manualEntry, type: manualEntry.type === "monster" ? "npc" : "monster" })}>
                {manualEntry.type === "monster" ? "Monstre" : "PNJ"}
              </button>
            </div>
          </div>
          <button className="btn btn--primary" onClick={addManualEntry} disabled={!manualEntry.name.trim()}>Ajouter</button>
        </div>
      )}

      {/* Initiative order */}
      {activeParticipants.map(p => {
        const hpPercent = p.hp_max > 0 ? (p.hp_current / p.hp_max) * 100 : 0;
        const hpColor = hpPercent > 50 ? "var(--color-success)" : hpPercent > 25 ? "var(--color-warning)" : "var(--color-error)";
        const isCurrent = p.id === currentTurnId;
        const hpVal = hpInputs[p.id] || "";
        const initVal = initInputs[p.id] || "";
        const typeColor = p.participant_type === "player" ? "var(--color-player-color)" : p.participant_type === "npc" ? "var(--color-npc-color)" : "var(--color-error)";

        return (
          <div key={p.id} className={"card" + (isCurrent ? " animate-pulse-turn" : "")} style={{ borderLeft: "3px solid " + typeColor, backgroundColor: isCurrent ? "rgba(201,168,76,0.08)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {/* Initiative */}
                <div style={{ textAlign: "center", minWidth: "2rem" }}>
                  {initVal !== "" || p.initiative === 0 ? (
                    <input className="input" type="number" value={initVal || (p.initiative || "")} onChange={e => setInitInputs(ii => ({ ...ii, [p.id]: e.target.value }))} onBlur={() => { if (initVal) updateInitiative(p.id, parseInt(initVal) || 0); }} onKeyDown={e => { if (e.key === "Enter" && initVal) updateInitiative(p.id, parseInt(initVal) || 0); }} style={{ width: "2.5rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "1rem", fontWeight: 700, padding: "0.125rem", backgroundColor: "transparent", border: "1px dashed var(--color-border)" }} />
                  ) : (
                    <span onClick={() => setInitInputs(ii => ({ ...ii, [p.id]: String(p.initiative) }))} style={{ fontFamily: "var(--font-mono)", fontSize: "1.25rem", fontWeight: 700, color: "var(--color-accent)", cursor: "pointer" }}>{p.initiative}</span>
                  )}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>{p.display_name}</span>
                  <span className={p.participant_type === "player" ? "badge badge--player" : p.participant_type === "npc" ? "badge badge--npc" : "badge badge--negative"} style={{ marginLeft: "0.375rem", fontSize: "0.5rem" }}>
                    {p.participant_type === "player" ? "PJ" : p.participant_type === "npc" ? "PNJ" : "Monstre"}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.5625rem", color: "var(--color-text-muted)" }}>CA</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.armor_class}</div>
              </div>
            </div>

            <div style={{ marginTop: "0.375rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", marginBottom: "0.125rem" }}>
                <span style={{ color: "var(--color-text-muted)" }}>PV</span>
                <span style={{ fontFamily: "var(--font-mono)", color: hpColor }}>{p.hp_current}/{p.hp_max}</span>
              </div>
              <div className="hp-bar">
                <div className="hp-bar__fill" style={{ width: hpPercent + "%", backgroundColor: hpColor }} />
              </div>
              <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.375rem", alignItems: "center" }}>
                <button className="btn btn--danger" style={{ padding: "0.25rem 0.375rem", fontSize: "0.6875rem" }} onClick={() => applyHp(p.id, -(parseInt(hpVal) || 1))}>-</button>
                <input className="input" type="number" value={hpVal} onChange={e => setHpInputs(h => ({ ...h, [p.id]: e.target.value }))} placeholder="Val" style={{ width: "3rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.75rem", padding: "0.25rem" }} />
                <button className="btn" style={{ padding: "0.25rem 0.375rem", fontSize: "0.6875rem", backgroundColor: "var(--color-healing)", color: "#fff" }} onClick={() => applyHp(p.id, parseInt(hpVal) || 1)}>+</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn--ghost" onClick={() => toggleActive(p.id)} style={{ fontSize: "0.5625rem", padding: "0.125rem 0.25rem" }}>KO</button>
                <button className="btn btn--ghost" onClick={() => removeParticipant(p.id)} style={{ fontSize: "0.5625rem", padding: "0.125rem 0.25rem", color: "var(--color-error)" }}>x</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Downed */}
      {downedParticipants.length > 0 && (
        <>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: "0.5rem" }}>Hors combat ({downedParticipants.length})</p>
          {downedParticipants.map(p => (
            <div key={p.id} className="card" style={{ opacity: 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{p.display_name} <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-error)" }}>{p.hp_current}/{p.hp_max}</span></span>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button className="btn btn--ghost" onClick={() => toggleActive(p.id)} style={{ fontSize: "0.6875rem", color: "var(--color-success)" }}>Relever</button>
                  <button className="btn btn--ghost" onClick={() => removeParticipant(p.id)} style={{ fontSize: "0.6875rem", color: "var(--color-error)" }}>x</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
