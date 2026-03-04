import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

interface Participant {
  id: string;
  participant_type: "player" | "monster" | "npc";
  display_name: string;
  hp_current: number;
  hp_max: number;
  armor_class: number;
  initiative: number;
  is_active: boolean;
  character_id: string | null;
}

interface Combat {
  id: string;
  name: string;
  status: "active" | "ended";
  current_turn_index: number | null;
}

interface Props {
  campaignId: string;
}

export default function PlayerCombatView({ campaignId }: Props) {
  const { user } = useAuth();
  const [combat, setCombat] = useState<Combat | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [myCharId, setMyCharId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from("characters").select("id").eq("campaign_id", campaignId).eq("user_id", user.id).single().then(({ data }) => {
        if (data) setMyCharId(data.id);
      });
    }
  }, [campaignId, user]);

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
    const ch = supabase.channel("combat-player-" + campaignId)
      .on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: "campaign_id=eq." + campaignId }, () => fetchCombat())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, fetchCombat]);

  useEffect(() => {
    if (!combat) return;
    const ch = supabase.channel("combat-parts-" + combat.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_participants", filter: "combat_id=eq." + combat.id }, () => fetchParticipants(combat.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "combats", filter: "id=eq." + combat.id }, (p: any) => {
        setCombat(prev => prev ? { ...prev, ...p.new } : null);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [combat?.id, fetchParticipants]);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Chargement...</p>;

  if (!combat) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Aucun combat en cours</p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>Le MJ lancera le combat quand il sera pret.</p>
      </div>
    );
  }

  const active = participants.filter(p => p.is_active && p.hp_current > 0);
  const currentTurnParticipant = active[combat.current_turn_index ?? 0];
  const isMyTurn = currentTurnParticipant?.character_id === myCharId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h2 style={{ fontSize: "1.25rem", color: "var(--color-error)" }}>{combat.name}</h2>

      {/* Current turn banner */}
      <div className={"card" + (isMyTurn ? " animate-pulse-turn" : "")} style={{ textAlign: "center", padding: "0.75rem", backgroundColor: isMyTurn ? "rgba(201,168,76,0.15)" : undefined, border: isMyTurn ? "2px solid var(--color-accent)" : undefined }}>
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Tour actuel</p>
        <p style={{ fontSize: "1.25rem", fontWeight: 600, color: isMyTurn ? "var(--color-accent)" : "var(--color-text)" }}>
          {currentTurnParticipant?.display_name || "En attente"}
        </p>
        {isMyTurn && <p style={{ fontSize: "0.875rem", color: "var(--color-accent)", marginTop: "0.25rem" }}>C est ton tour !</p>}
      </div>

      {/* Initiative order */}
      {active.map((p, idx) => {
        const hpPercent = p.hp_max > 0 ? (p.hp_current / p.hp_max) * 100 : 0;
        const hpColor = hpPercent > 50 ? "var(--color-success)" : hpPercent > 25 ? "var(--color-warning)" : "var(--color-error)";
        const isCurrent = idx === (combat.current_turn_index ?? 0);
        const isMe = p.character_id === myCharId;
        const typeColor = p.participant_type === "player" ? "var(--color-player-color)" : p.participant_type === "npc" ? "var(--color-npc-color)" : "var(--color-error)";

        // For monsters, players only see approximate HP
        const showExactHp = p.participant_type === "player" || p.participant_type === "npc";

        return (
          <div key={p.id} className="card" style={{ borderLeft: "3px solid " + typeColor, opacity: isCurrent ? 1 : 0.75 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "1rem", fontWeight: 700, color: "var(--color-accent)", minWidth: "1.5rem", textAlign: "center" }}>{p.initiative || "?"}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{p.display_name}</span>
                  {isMe && <span className="badge badge--player" style={{ marginLeft: "0.375rem", fontSize: "0.5rem" }}>Toi</span>}
                  <span className={p.participant_type === "monster" ? "badge badge--negative" : p.participant_type === "npc" ? "badge badge--npc" : "badge badge--player"} style={{ marginLeft: "0.25rem", fontSize: "0.5rem" }}>
                    {p.participant_type === "player" ? "PJ" : p.participant_type === "npc" ? "PNJ" : "Monstre"}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.5625rem", color: "var(--color-text-muted)" }}>CA</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{p.participant_type === "monster" ? "?" : p.armor_class}</div>
              </div>
            </div>

            <div style={{ marginTop: "0.375rem" }}>
              {showExactHp ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", marginBottom: "0.125rem" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>PV</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: hpColor }}>{p.hp_current}/{p.hp_max}</span>
                  </div>
                  <div className="hp-bar">
                    <div className="hp-bar__fill" style={{ width: hpPercent + "%", backgroundColor: hpColor }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", marginBottom: "0.125rem" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Etat</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: hpColor }}>
                      {hpPercent > 75 ? "En forme" : hpPercent > 50 ? "Blesse" : hpPercent > 25 ? "Mal en point" : hpPercent > 0 ? "Critique" : "A terre"}
                    </span>
                  </div>
                  <div className="hp-bar">
                    <div className="hp-bar__fill" style={{ width: hpPercent + "%", backgroundColor: hpColor }} />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Downed */}
      {participants.filter(p => !p.is_active || p.hp_current <= 0).length > 0 && (
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: "0.5rem" }}>
          Hors combat: {participants.filter(p => !p.is_active || p.hp_current <= 0).map(p => p.display_name).join(", ")}
        </p>
      )}
    </div>
  );
}
