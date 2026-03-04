import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import CharacterSheet from "../components/character/CharacterSheet";
import SkillsList from "../components/character/SkillsList";
import Inventory from "../components/character/Inventory";
import TeamView from "../components/team/TeamView";
import GmPlayersPanel from "../components/gm/GmPlayersPanel";
import NpcManager from "../components/gm/NpcManager";
import MonsterLibrary from "../components/gm/MonsterLibrary";
import CombatTracker from "../components/combat/CombatTracker";
import PlayerCombatView from "../components/combat/PlayerCombatView";
import { GiCharacter, GiSkills, GiBackpack, GiBroadsword, GiWolfHead, GiCog, GiCrownedSkull, GiCrossedSwords, GiCompass, GiScrollUnfurled, GiKey, GiEyeTarget, GiTrophy, GiDeathSkull, GiTrashCan } from 'react-icons/gi';
import { FaPlus } from 'react-icons/fa';

interface CampaignPageProps { campaignId: string; role: "gm" | "player"; onBack: () => void; }
type PlayerTab = "perso" | "skills" | "inventory" | "team" | "combat";
type GmTab = "players" | "npcs" | "combat" | "monsters" | "campaign";

export default function CampaignPage({ campaignId, role, onBack }: CampaignPageProps) {
  const { user } = useAuth();
  const { setMode } = useTheme();
  const [campaignName, setCampaignName] = useState("");
  const [campaignMode, setCampaignMode] = useState<"exploration" | "combat">("exploration");
  const [playerTab, setPlayerTab] = useState<PlayerTab>("perso");
  const [gmTab, setGmTab] = useState<GmTab>("players");
  const [charId, setCharId] = useState<string | null>(null);
  const [gmSeeHidden, setGmSeeHidden] = useState(false);

  useEffect(() => {
    supabase.from("campaigns").select("name, mode, gm_see_hidden").eq("id", campaignId).single().then(({ data }) => {
      if (data) { setCampaignName(data.name); setCampaignMode(data.mode); setMode(data.mode); setGmSeeHidden(data.gm_see_hidden); }
    });
    if (user) {
      supabase.from("characters").select("id").eq("campaign_id", campaignId).eq("user_id", user.id).single().then(({ data }) => {
        if (data) setCharId(data.id);
      });
    }
    const channel = supabase.channel("camp-" + campaignId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns", filter: "id=eq." + campaignId }, (payload: any) => {
        setCampaignMode(payload.new.mode); setMode(payload.new.mode);
        if (payload.new.name) setCampaignName(payload.new.name);
        if (payload.new.gm_see_hidden !== undefined) setGmSeeHidden(payload.new.gm_see_hidden);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, setMode, user]);

  useEffect(() => {
    if (!charId && user) {
      const ch = supabase.channel("new-char-" + campaignId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "characters", filter: "campaign_id=eq." + campaignId }, (p: any) => {
          if (p.new.user_id === user.id) setCharId(p.new.id);
        }).subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [charId, campaignId, user]);

  const playerTabs = [
    { key: "perso" as PlayerTab, label: "Perso", icon: <GiCharacter size={18} /> },
    { key: "skills" as PlayerTab, label: "Comp.", icon: <GiSkills size={18} /> },
    { key: "inventory" as PlayerTab, label: "Sac", icon: <GiBackpack size={18} /> },
    { key: "team" as PlayerTab, label: "Equipe", icon: <GiCrossedSwords size={18} /> },
    { key: "combat" as PlayerTab, label: "Combat", icon: <GiBroadsword size={18} /> },
  ];
  const gmTabsArr = [
    { key: "players" as GmTab, label: "Joueurs", icon: <GiCrossedSwords size={18} /> },
    { key: "npcs" as GmTab, label: "PNJ", icon: <GiWolfHead size={18} /> },
    { key: "combat" as GmTab, label: "Combat", icon: <GiCrossedSwords size={18} /> },
    { key: "monsters" as GmTab, label: "Monstres", icon: <GiWolfHead size={18} /> },
    { key: "campaign" as GmTab, label: "Config", icon: <GiCog size={18} /> },
  ];

  function renderPlayerContent() {
    switch (playerTab) {
      case "perso": return <CharacterSheet campaignId={campaignId} />;
      case "skills": return charId ? <SkillsList characterId={charId} canEdit={true} /> : <p style={{ color: "var(--color-text-muted)" }}>Cree d'abord ton personnage dans l'onglet Perso</p>;
      case "inventory": return charId ? <Inventory characterId={charId} canEdit={true} /> : <p style={{ color: "var(--color-text-muted)" }}>Cree d'abord ton personnage</p>;
      case "team": return <TeamView campaignId={campaignId} />;
      case "combat": return <PlayerCombatView campaignId={campaignId} />;
      default: return null;
    }
  }

  function renderGmContent() {
    switch (gmTab) {
      case "players": return <GmPlayersPanel campaignId={campaignId} gmSeeHidden={gmSeeHidden} />;
      case "npcs": return <NpcManager campaignId={campaignId} />;
      case "combat": return <CombatTracker campaignId={campaignId} />;
      case "monsters": return <MonsterLibrary />;
      case "campaign": return <CampaignConfig campaignId={campaignId} campaignMode={campaignMode} onBack={onBack} />;
      default: return null;
    }
  }

  return (
    <div className="app-shell">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border)" }}>
        <button className="btn btn--ghost" onClick={onBack} style={{ padding: "0.25rem 0.5rem", fontSize: "1.125rem" }}>&#8592;</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "1rem", lineHeight: 1.2 }}>{campaignName}</h2>
          <span style={{ fontSize: "0.6875rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", color: campaignMode === "combat" ? "var(--color-error)" : "var(--color-success)" }}>
            {campaignMode === "combat" ? <><GiCrossedSwords size={10} /> En combat</> : <><GiCompass size={10} /> Exploration</>}
          </span>
        </div>
        <span className={role === "gm" ? "badge badge--npc" : "badge badge--player"}>{role === "gm" ? "MJ" : "Joueur"}</span>
      </div>
      <div className="app-content">
        {role === "player" ? renderPlayerContent() : renderGmContent()}
      </div>
      <nav className="bottom-nav">
        {(role === "player" ? playerTabs : gmTabsArr).map((t) => (
          <button key={t.key} className={"bottom-nav__item" + ((role === "player" ? playerTab : gmTab) === t.key ? " bottom-nav__item--active" : "")}
            onClick={() => role === "player" ? setPlayerTab(t.key as PlayerTab) : setGmTab(t.key as GmTab)}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function CampaignConfig({ campaignId, campaignMode, onBack }: { campaignId: string; campaignMode: string; onBack: () => void }) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [gmSeeHidden, setGmSeeHidden] = useState(false);
  const [members, setMembers] = useState<Array<{ id: string; user_id: string; role: string; profile?: { display_name: string } }>>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: 'kick' | 'delete' | 'end'; userId?: string; userName?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("campaigns").select("invite_code, gm_see_hidden").eq("id", campaignId).single().then(({ data }) => {
      if (data) { setInviteCode(data.invite_code); setGmSeeHidden(data.gm_see_hidden); }
    });
    fetchMembers();
  }, [campaignId]);

  async function fetchMembers() {
    const { data } = await supabase.from("campaign_members").select("id, user_id, role, profiles(display_name)").eq("campaign_id", campaignId);
    if (data) setMembers(data.map((m: any) => ({ ...m, profile: m.profiles })));
  }

  async function toggleMode() {
    const nm = campaignMode === "exploration" ? "combat" : "exploration";
    await supabase.from("campaigns").update({ mode: nm }).eq("id", campaignId);
  }

  async function toggleGmVision() {
    const nv = !gmSeeHidden;
    await supabase.from("campaigns").update({ gm_see_hidden: nv }).eq("id", campaignId);
    setGmSeeHidden(nv);
  }

  async function kickPlayer(userId: string) {
    setBusy(true);
    const { data: char } = await supabase.from("characters").select("id").eq("campaign_id", campaignId).eq("user_id", userId).single();
    if (char) {
      await supabase.from("effects").delete().eq("character_id", char.id);
      await supabase.from("skills").delete().eq("character_id", char.id);
      await supabase.from("inventory_items").delete().eq("character_id", char.id);
      await supabase.from("characters").delete().eq("id", char.id);
    }
    await supabase.from("campaign_members").delete().eq("campaign_id", campaignId).eq("user_id", userId);
    setConfirmAction(null); setBusy(false); fetchMembers();
  }

  async function deleteCampaign() {
    setBusy(true);
    await supabase.from("combat_participants").delete().in("combat_id", (await supabase.from("combats").select("id").eq("campaign_id", campaignId)).data?.map((c: any) => c.id) || []);
    await supabase.from("combats").delete().eq("campaign_id", campaignId);
    const { data: chars } = await supabase.from("characters").select("id").eq("campaign_id", campaignId);
    for (const c of chars || []) { await supabase.from("effects").delete().eq("character_id", c.id); await supabase.from("skills").delete().eq("character_id", c.id); await supabase.from("inventory_items").delete().eq("character_id", c.id); }
    await supabase.from("characters").delete().eq("campaign_id", campaignId);
    await supabase.from("npcs").delete().eq("campaign_id", campaignId);
    await supabase.from("campaign_members").delete().eq("campaign_id", campaignId);
    await supabase.from("campaigns").delete().eq("id", campaignId);
    setBusy(false); onBack();
  }

  async function endCampaign(outcome: string) {
    setBusy(true);
    await supabase.from("campaigns").update({ status: outcome, ended_at: new Date().toISOString(), mode: "exploration" }).eq("id", campaignId);
    setBusy(false); onBack();
  }

  const players = members.filter(m => m.role === 'player');

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 style={{ fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}><GiCog /> Configuration</h2>

      <div className="card">
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiKey size={16} /> Code d'invitation</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", letterSpacing: "0.2em", color: "var(--color-accent)" }}>{inviteCode}</span>
          <button className="btn btn--ghost" onClick={() => navigator.clipboard.writeText(inviteCode)} style={{ fontSize: "0.75rem" }}><GiScrollUnfurled size={14} /> Copier</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiCrossedSwords size={16} /> Mode de jeu</h3>
        <button className={campaignMode === "combat" ? "btn btn--danger" : "btn btn--primary"} onClick={toggleMode} style={{ width: "100%" }}>
          {campaignMode === "combat" ? <><GiCompass size={16} /> Passer en Exploration</> : <><GiBroadsword size={16} /> Lancer le Combat</>}
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiEyeTarget size={16} /> Vision du MJ</h3>
        <button className={gmSeeHidden ? "btn btn--primary" : "btn btn--secondary"} onClick={toggleGmVision} style={{ width: "100%" }}>
          <GiEyeTarget size={16} /> {gmSeeHidden ? "Vision totale activee" : "Vision totale desactivee"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiCrossedSwords size={16} /> Joueurs ({players.length})</h3>
        {players.length === 0 ? <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>Aucun joueur</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {players.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.375rem 0.5rem", backgroundColor: "var(--color-background-alt)", borderRadius: "var(--button-radius)" }}>
                <span style={{ fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiCharacter size={14} /> {m.profile?.display_name || "Joueur"}</span>
                <button className="btn btn--ghost" onClick={() => setConfirmAction({ type: 'kick', userId: m.user_id, userName: m.profile?.display_name || "Joueur" })} style={{ fontSize: "0.6875rem", color: "var(--color-error)", padding: "0.125rem 0.375rem" }}>
                  <GiCrossedSwords size={12} /> Exclure
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: "var(--color-error)" }}>
        <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-error)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiDeathSkull size={16} /> Zone dangereuse</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <button className="btn btn--secondary" onClick={() => setConfirmAction({ type: 'end' })} style={{ width: "100%" }}><GiTrophy size={16} /> Terminer la campagne</button>
          <button className="btn btn--danger" onClick={() => setConfirmAction({ type: 'delete' })} style={{ width: "100%" }}><GiTrashCan size={16} /> Supprimer la campagne</button>
        </div>
      </div>

      {confirmAction && (
        <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-dialog animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {confirmAction.type === 'kick' && (<>
              <h3 style={{ fontSize: "1.125rem", marginBottom: "0.75rem", color: "var(--color-error)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiCrossedSwords /> Exclure un joueur</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Exclure <strong>{confirmAction.userName}</strong> ? Son personnage sera supprime.</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                <button className="btn btn--danger" onClick={() => kickPlayer(confirmAction.userId!)} disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Exclure'}</button>
              </div>
            </>)}
            {confirmAction.type === 'delete' && (<>
              <h3 style={{ fontSize: "1.125rem", marginBottom: "0.75rem", color: "var(--color-error)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiTrashCan /> Supprimer</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Toutes les donnees seront perdues definitivement.</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                <button className="btn btn--danger" onClick={() => deleteCampaign()} disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Supprimer'}</button>
              </div>
            </>)}
            {confirmAction.type === 'end' && (<>
              <h3 style={{ fontSize: "1.125rem", marginBottom: "0.75rem", color: "var(--color-warning)", display: "flex", alignItems: "center", gap: "0.375rem" }}><GiTrophy /> Fin de campagne</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Comment se termine cette aventure ?</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                <button className="btn" onClick={() => endCampaign('victory')} disabled={busy} style={{ flex: 1, backgroundColor: 'var(--color-success)', color: '#fff' }}><GiTrophy size={14} /> {busy ? '...' : 'Victoire'}</button>
                <button className="btn btn--danger" onClick={() => endCampaign('defeat')} disabled={busy} style={{ flex: 1 }}><GiDeathSkull size={14} /> {busy ? '...' : 'Defaite'}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
