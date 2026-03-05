import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  GiCog, GiKey, GiScrollUnfurled, GiCrossedSwords, GiCompass,
  GiBroadsword, GiEyeTarget, GiCharacter, GiDeathSkull, GiTrophy, GiTrashCan,
} from 'react-icons/gi';

interface CampaignConfigProps {
  campaignId: string;
  campaignMode: 'exploration' | 'combat';
  onBack: () => void;
}

export default function CampaignConfig({ campaignId, campaignMode, onBack }: CampaignConfigProps) {
  const { user } = useAuth();
  const [inviteCode,    setInviteCode]    = useState('');
  const [gmSeeHidden,   setGmSeeHidden]   = useState(false);
  const [members,       setMembers]       = useState<Array<{
    id: string; user_id: string; role: string;
    profile?: { display_name: string };
  }>>([]);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'kick' | 'delete' | 'end';
    userId?: string;
    userName?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('campaigns')
      .select('invite_code, gm_see_hidden')
      .eq('id', campaignId).single()
      .then(({ data }) => {
        if (data) { setInviteCode(data.invite_code); setGmSeeHidden(data.gm_see_hidden); }
      });
    fetchMembers();
  }, [campaignId]);

  async function fetchMembers() {
    const { data } = await supabase
      .from('campaign_members')
      .select('id, user_id, role, profiles(display_name)')
      .eq('campaign_id', campaignId);
    if (data) setMembers(data.map((m: any) => ({ ...m, profile: m.profiles })));
  }

  async function toggleMode() {
    const nm = campaignMode === 'exploration' ? 'combat' : 'exploration';
    await supabase.from('campaigns').update({ mode: nm }).eq('id', campaignId);
  }

  async function toggleGmVision() {
    const nv = !gmSeeHidden;
    await supabase.from('campaigns').update({ gm_see_hidden: nv }).eq('id', campaignId);
    setGmSeeHidden(nv);
  }

  async function kickPlayer(userId: string) {
    setBusy(true);
    const { data: char } = await supabase.from('characters').select('id').eq('campaign_id', campaignId).eq('user_id', userId).single();
    if (char) {
      await supabase.from('effects').delete().eq('character_id', char.id);
      await supabase.from('skills').delete().eq('character_id', char.id);
      await supabase.from('inventory_items').delete().eq('character_id', char.id);
      await supabase.from('characters').delete().eq('id', char.id);
    }
    await supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', userId);
    setConfirmAction(null); setBusy(false); fetchMembers();
  }

  async function deleteCampaign() {
    setBusy(true);
    const combatIds = (await supabase.from('combats').select('id').eq('campaign_id', campaignId)).data?.map((c: any) => c.id) || [];
    if (combatIds.length) await supabase.from('combat_participants').delete().in('combat_id', combatIds);
    await supabase.from('combats').delete().eq('campaign_id', campaignId);
    const { data: chars } = await supabase.from('characters').select('id').eq('campaign_id', campaignId);
    for (const c of chars || []) {
      await supabase.from('effects').delete().eq('character_id', c.id);
      await supabase.from('skills').delete().eq('character_id', c.id);
      await supabase.from('inventory_items').delete().eq('character_id', c.id);
      // Supprimer aussi les sorts maintenant qu'on a les tables spells/spell_slots
      await supabase.from('spells').delete().eq('character_id', c.id);
      await supabase.from('spell_slots').delete().eq('character_id', c.id);
    }
    await supabase.from('characters').delete().eq('campaign_id', campaignId);
    await supabase.from('npcs').delete().eq('campaign_id', campaignId);
    await supabase.from('campaign_members').delete().eq('campaign_id', campaignId);
    await supabase.from('campaigns').delete().eq('id', campaignId);
    setBusy(false); onBack();
  }

  async function endCampaign(outcome: string) {
    setBusy(true);
    await supabase.from('campaigns').update({
      status: outcome,
      ended_at: new Date().toISOString(),
      mode: 'exploration',
    }).eq('id', campaignId);
    setBusy(false); onBack();
  }

  const players = members.filter(m => m.role === 'player');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <GiCog /> Configuration
      </h2>

      {/* Code d'invitation */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GiKey size={16} /> Code d'invitation
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', letterSpacing: '0.2em', color: 'var(--color-accent)' }}>
            {inviteCode}
          </span>
          <button className="btn btn--ghost" onClick={() => navigator.clipboard.writeText(inviteCode)} style={{ fontSize: '0.75rem' }}>
            <GiScrollUnfurled size={14} /> Copier
          </button>
        </div>
      </div>

      {/* Mode de jeu */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GiCrossedSwords size={16} /> Mode de jeu
        </h3>
        <button
          className={campaignMode === 'combat' ? 'btn btn--danger' : 'btn btn--primary'}
          onClick={toggleMode}
          style={{ width: '100%' }}
        >
          {campaignMode === 'combat'
            ? <><GiCompass size={16} /> Passer en Exploration</>
            : <><GiBroadsword size={16} /> Lancer le Combat</>}
        </button>
      </div>

      {/* Vision du MJ */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GiEyeTarget size={16} /> Vision du MJ
        </h3>
        <button
          className={gmSeeHidden ? 'btn btn--primary' : 'btn btn--secondary'}
          onClick={toggleGmVision}
          style={{ width: '100%' }}
        >
          <GiEyeTarget size={16} /> {gmSeeHidden ? 'Vision totale activée' : 'Vision totale désactivée'}
        </button>
      </div>

      {/* Joueurs */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GiCrossedSwords size={16} /> Joueurs ({players.length})
        </h3>
        {players.length === 0
          ? <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucun joueur</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {players.map(m => (
                <div key={m.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.375rem 0.5rem',
                  backgroundColor: 'var(--color-background-alt)',
                  borderRadius: 'var(--button-radius)',
                }}>
                  <span style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <GiCharacter size={14} /> {m.profile?.display_name || 'Joueur'}
                  </span>
                  <button
                    className="btn btn--ghost"
                    onClick={() => setConfirmAction({ type: 'kick', userId: m.user_id, userName: m.profile?.display_name || 'Joueur' })}
                    style={{ fontSize: '0.6875rem', color: 'var(--color-error)', padding: '0.125rem 0.375rem' }}
                  >
                    <GiCrossedSwords size={12} /> Exclure
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Zone dangereuse */}
      <div className="card" style={{ borderColor: 'var(--color-error)' }}>
        <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GiDeathSkull size={16} /> Zone dangereuse
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn btn--secondary" onClick={() => setConfirmAction({ type: 'end' })} style={{ width: '100%' }}>
            <GiTrophy size={16} /> Terminer la campagne
          </button>
          <button className="btn btn--danger" onClick={() => setConfirmAction({ type: 'delete' })} style={{ width: '100%' }}>
            <GiTrashCan size={16} /> Supprimer la campagne
          </button>
        </div>
      </div>

      {/* Modale de confirmation */}
      {confirmAction && (
        <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-dialog animate-fade-in" onClick={(e) => e.stopPropagation()}>

            {confirmAction.type === 'kick' && (
              <>
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <GiCrossedSwords /> Exclure un joueur
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Exclure <strong>{confirmAction.userName}</strong> ? Son personnage sera supprimé.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                  <button className="btn btn--danger" onClick={() => kickPlayer(confirmAction.userId!)} disabled={busy} style={{ flex: 1 }}>
                    {busy ? '…' : 'Exclure'}
                  </button>
                </div>
              </>
            )}

            {confirmAction.type === 'delete' && (
              <>
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <GiTrashCan /> Supprimer
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Toutes les données seront perdues définitivement.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                  <button className="btn btn--danger" onClick={deleteCampaign} disabled={busy} style={{ flex: 1 }}>
                    {busy ? '…' : 'Supprimer'}
                  </button>
                </div>
              </>
            )}

            {confirmAction.type === 'end' && (
              <>
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <GiTrophy /> Fin de campagne
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Comment se termine cette aventure ?
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn--secondary" onClick={() => setConfirmAction(null)} style={{ flex: 1 }}>Annuler</button>
                  <button
                    className="btn"
                    onClick={() => endCampaign('victory')}
                    disabled={busy}
                    style={{ flex: 1, backgroundColor: 'var(--color-success)', color: '#fff' }}
                  >
                    <GiTrophy size={14} /> {busy ? '…' : 'Victoire'}
                  </button>
                  <button className="btn btn--danger" onClick={() => endCampaign('defeat')} disabled={busy} style={{ flex: 1 }}>
                    <GiDeathSkull size={14} /> {busy ? '…' : 'Défaite'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}