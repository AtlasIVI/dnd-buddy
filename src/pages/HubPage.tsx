import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GiCrossedSwords, GiBroadsword, GiCompass, GiScrollUnfurled, GiHearts, GiTrophy, GiDeathSkull } from 'react-icons/gi';

interface CampaignWithRole {
  campaign_id: string;
  role: 'gm' | 'player';
  campaign: { id: string; name: string; invite_code: string; mode: 'exploration' | 'combat'; created_by: string; status: string };
  character?: { id: string; name: string; class: string; race: string; level: number; hp_current: number; hp_max: number } | null;
  member_count?: number;
}

interface HubPageProps {
  onEnterCampaign: (campaignId: string, role: 'gm' | 'player') => void;
}

export default function HubPage({ onEnterCampaign }: HubPageProps) {
  const { user, profile, signOut, isAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    if (!user) return;

    // FIX N+1 : une seule requête qui joint campaign_members + campaigns
    const { data: members } = await supabase
      .from('campaign_members')
      .select('campaign_id, role, campaigns(id, name, invite_code, mode, created_by, status)')
      .eq('user_id', user.id);

    if (!members) { setLoading(false); return; }

    const campaignIds = members.map(m => (m as any).campaigns?.id).filter(Boolean);

    // Récupère tous les personnages de l'utilisateur en une seule requête
    const { data: allChars } = await supabase
      .from('characters')
      .select('id, name, class, race, level, hp_current, hp_max, campaign_id')
      .eq('user_id', user.id)
      .in('campaign_id', campaignIds);

    // Récupère tous les counts de membres en une seule requête
    const { data: memberCounts } = await supabase
      .from('campaign_members')
      .select('campaign_id')
      .in('campaign_id', campaignIds);

    const countByCampaign: Record<string, number> = {};
    for (const m of memberCounts || []) {
      countByCampaign[m.campaign_id] = (countByCampaign[m.campaign_id] || 0) + 1;
    }

    const charByCampaign: Record<string, typeof allChars extends (infer T)[] | null ? T : never> = {};
    for (const c of allChars || []) {
      charByCampaign[(c as any).campaign_id] = c as any;
    }

    const enriched: CampaignWithRole[] = [];
    for (const m of members) {
      const camp = (m as any).campaigns;
      if (!camp) continue;
      enriched.push({
        campaign_id: camp.id,
        role: m.role as 'gm' | 'player',
        campaign: camp,
        character: m.role === 'player' ? (charByCampaign[camp.id] || null) : null,
        member_count: countByCampaign[camp.id] ?? 0,
      });
    }

    // Séparer actives et terminées, actives en premier
    enriched.sort((a, b) => {
      const aActive = a.campaign.status === 'active' ? 0 : 1;
      const bActive = b.campaign.status === 'active' ? 0 : 1;
      return aActive - bActive;
    });

    setCampaigns(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function createCampaign() {
    if (!user || !newName.trim()) return;
    setBusy(true); setErr(null);
    const { data: c, error } = await supabase.from('campaigns').insert({ name: newName.trim(), created_by: user.id }).select().single();
    if (error || !c) { setErr(error?.message ?? 'Erreur'); setBusy(false); return; }
    const { error: e2 } = await supabase.from('campaign_members').insert({ campaign_id: c.id, user_id: user.id, role: 'gm' });
    if (e2) { setErr(e2.message); setBusy(false); return; }
    setNewName(''); setShowCreate(false); setBusy(false); fetchCampaigns();
  }

  async function joinCampaign() {
    if (!user || inviteCode.length < 6) return;
    setBusy(true); setErr(null);
    const { data: c } = await supabase.from('campaigns').select('id').eq('invite_code', inviteCode.trim().toUpperCase()).single();
    if (!c) { setErr('Code invalide'); setBusy(false); return; }
    const { error } = await supabase.from('campaign_members').insert({ campaign_id: c.id, user_id: user.id, role: 'player' });
    if (error) { setErr(error.message.includes('duplicate') ? 'Tu es déjà membre !' : error.message); setBusy(false); return; }
    setInviteCode(''); setShowJoin(false); setBusy(false); fetchCampaigns();
  }

  const activeCampaigns = campaigns.filter(c => c.campaign.status === 'active');
  const endedCampaigns = campaigns.filter(c => c.campaign.status !== 'active');

  return (
    <div className="app-shell">
      <div className="app-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem' }}>Mes Campagnes</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {profile?.display_name || 'Aventurier'}
              {isAdmin && <span className="badge badge--positive" style={{ fontSize: '0.5625rem' }}>ADMIN</span>}
            </p>
          </div>
          <button className="btn btn--ghost" onClick={signOut} style={{ fontSize: '0.8125rem' }}>Déconnexion</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <GiScrollUnfurled size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Aucune campagne</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Crée ou rejoins une campagne pour commencer</p>
          </div>
        ) : (
          <>
            {/* Campagnes actives */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeCampaigns.map(c => <CampaignCard key={c.campaign_id} campaign={c} onEnter={onEnterCampaign} />)}
            </div>

            {/* Campagnes terminées */}
            {endedCampaigns.length > 0 && (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '1.25rem', marginBottom: '0.5rem' }}>
                  Terminées
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {endedCampaigns.map(c => <CampaignCard key={c.campaign_id} campaign={c} onEnter={onEnterCampaign} ended />)}
                </div>
              </>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn--secondary" style={{ flex: 1 }} onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setErr(null); }}>
            Rejoindre
          </button>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setErr(null); }}>
            Nouvelle campagne
          </button>
        </div>

        {showJoin && (
          <div className="card animate-fade-in" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Rejoindre une campagne</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                placeholder="CODE (6 lettres)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <button className="btn btn--primary" onClick={joinCampaign} disabled={busy || inviteCode.length < 6}>
                {busy ? '...' : 'OK'}
              </button>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="card animate-fade-in" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Nouvelle campagne</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                placeholder="Nom de la campagne"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && !busy && newName.trim() && createCampaign()}
              />
              <button className="btn btn--primary" onClick={createCampaign} disabled={busy || !newName.trim()}>
                {busy ? '...' : 'Créer'}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Tu seras le Maître du Jeu.</p>
          </div>
        )}

        {err && (
          <div className="animate-fade-in" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: 'rgba(231,76,60,0.15)', border: '1px solid var(--color-error)', borderRadius: 'var(--button-radius)', color: 'var(--color-error)', fontSize: '0.8125rem' }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign: c, onEnter, ended }: { campaign: CampaignWithRole; onEnter: (id: string, role: 'gm' | 'player') => void; ended?: boolean }) {
  const statusIcon = c.campaign.status === 'victory'
    ? <GiTrophy size={14} style={{ color: 'var(--color-success)' }} />
    : c.campaign.status === 'defeat'
    ? <GiDeathSkull size={14} style={{ color: 'var(--color-error)' }} />
    : null;

  return (
    <button
      className="card"
      style={{ cursor: 'pointer', textAlign: 'left', width: '100%', opacity: ended ? 0.65 : 1, transition: 'opacity 0.2s' }}
      onClick={() => onEnter(c.campaign_id, c.role)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {statusIcon}
          {c.campaign.name}
        </h3>
        <span className={c.role === 'gm' ? 'badge badge--npc' : 'badge badge--player'}>
          {c.role === 'gm' ? 'MJ' : 'Joueur'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
        <span>{c.member_count} membre{(c.member_count ?? 0) > 1 ? 's' : ''}</span>
        {ended ? (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            {c.campaign.status === 'victory' ? '🏆 Victoire' : c.campaign.status === 'defeat' ? '💀 Défaite' : 'Terminée'}
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: c.campaign.mode === 'combat' ? 'var(--color-error)' : 'var(--color-success)' }}>
            {c.campaign.mode === 'combat' ? <GiBroadsword size={12} /> : <GiCompass size={12} />}
            {c.campaign.mode === 'combat' ? 'En combat' : 'Exploration'}
          </span>
        )}
        <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>#{c.campaign.invite_code}</span>
      </div>
      {c.character && (
        <div style={{ marginTop: '0.5rem', padding: '0.375rem 0.5rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{c.character.name}</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{c.character.race} {c.character.class} niv.{c.character.level}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-hp)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <GiHearts size={12} /> {c.character.hp_current}/{c.character.hp_max}
          </span>
        </div>
      )}
    </button>
  );
}