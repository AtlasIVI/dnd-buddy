import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/database';
import { GiBroadsword, GiSundial, GiHearts, GiShield, GiCrestedHelmet, GiWolfHead, GiCharacter, GiDeathSkull, GiCrossedSwords } from 'react-icons/gi';

interface PlayerCombatViewProps {
  campaignId: string;
}

export default function PlayerCombatView({ campaignId }: PlayerCombatViewProps) {
  const [combat, setCombat] = useState<Tables<'combats'> | null>(null);
  const [participants, setParticipants] = useState<Tables<'combat_participants'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(1);
  const [prevTurnIdx, setPrevTurnIdx] = useState<number>(-1);

  const fetchParticipants = useCallback(async (combatId: string) => {
    const { data } = await supabase.from('combat_participants').select('*').eq('combat_id', combatId).order('initiative', { ascending: false });
    if (data) setParticipants(data);
  }, []);

  const fetchCombat = useCallback(async () => {
    const { data } = await supabase.from('combats').select('*').eq('campaign_id', campaignId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
    if (data) {
      setCombat(data);
      await fetchParticipants(data.id);
    } else {
      setCombat(null);
      setParticipants([]);
    }
    setLoading(false);
  }, [campaignId, fetchParticipants]);

  useEffect(() => { fetchCombat(); }, [fetchCombat]);

  useEffect(() => {
    const campChannel = supabase.channel('player-combat-camp-' + campaignId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: 'id=eq.' + campaignId }, () => fetchCombat())
      .subscribe();
    return () => { supabase.removeChannel(campChannel); };
  }, [campaignId, fetchCombat]);

  useEffect(() => {
    if (!combat) return;
    const channel = supabase.channel('player-combat-' + combat.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combat_participants', filter: 'combat_id=eq.' + combat.id }, async () => {
        await fetchParticipants(combat.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combats', filter: 'id=eq.' + combat.id }, (p: any) => {
        if (p.new) {
          if (p.new.status === 'ended') {
            setCombat(null); setParticipants([]); setRound(1);
          } else {
            // Détecter le passage de round : index revient à 0 depuis une valeur > 0
            if (p.new.current_turn_index === 0 && p.old?.current_turn_index > 0) {
              setRound(r => r + 1);
            }
            setCombat(p.new);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [combat?.id, fetchParticipants]);

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  if (!combat) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiCrossedSwords size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Combat</h2>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <GiBroadsword size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>Pas de combat en cours</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>Le MJ lancera le combat quand il sera prêt</p>
        </div>
      </div>
    );
  }

  // FIX : travailler sur la liste filtrée/triée exactement comme le GM
  const activeParts = participants.filter(p => p.is_active).sort((a, b) => b.initiative - a.initiative);
  const downParts = participants.filter(p => !p.is_active);
  const currentTurnIdx = combat.current_turn_index ?? -1;
  // Clamp sécurisé
  const safeIdx = activeParts.length > 0 && currentTurnIdx >= 0
    ? ((currentTurnIdx % activeParts.length) + activeParts.length) % activeParts.length
    : -1;
  const currentParticipant = safeIdx >= 0 ? activeParts[safeIdx] : null;

  const typeIcon = (type: string) => {
    if (type === 'player') return <GiCrestedHelmet size={12} style={{ color: 'var(--color-player-color)' }} />;
    if (type === 'monster') return <GiWolfHead size={12} style={{ color: 'var(--color-monster-color)' }} />;
    return <GiCharacter size={12} style={{ color: 'var(--color-npc-color)' }} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <GiCrossedSwords size={20} style={{ color: 'var(--color-error)' }} />
        <h2 style={{ fontSize: '1.25rem' }}>{combat.name}</h2>
        <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-background-alt)', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>
          Round {round}
        </span>
      </div>

      {/* Bannière de tour */}
      {currentParticipant ? (
        <div className="card card--accent animate-pulse-turn" style={{ textAlign: 'center', padding: '0.75rem' }}>
          <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            <GiSundial size={12} style={{ marginRight: '0.25rem' }} />
            Tour {safeIdx + 1}/{activeParts.length}
          </p>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-your-turn)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
            {typeIcon(currentParticipant.participant_type)} {currentParticipant.display_name}
          </h3>
        </div>
      ) : currentTurnIdx === -1 && activeParts.length > 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '0.75rem' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>En attente du MJ pour démarrer les tours...</p>
        </div>
      ) : null}

      {/* Participants actifs */}
      {activeParts.map((p, idx) => {
        const hpPct = p.hp_max > 0 ? Math.round((p.hp_current / p.hp_max) * 100) : 0;
        const isCurrent = idx === safeIdx && currentTurnIdx >= 0;
        const hpColor = hpPct > 60 ? 'var(--color-hp)' : hpPct > 30 ? 'var(--color-warning)' : 'var(--color-error)';

        return (
          <div
            key={p.id}
            className="card"
            style={{
              borderColor: isCurrent ? 'var(--color-your-turn)' : undefined,
              boxShadow: isCurrent ? 'var(--glow-accent)' : undefined,
              padding: '0.5rem 0.75rem',
              transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600, fontSize: '0.9375rem' }}>
                {typeIcon(p.participant_type)} {p.display_name}
                {isCurrent && (
                  <span style={{ fontSize: '0.5rem', color: 'var(--color-your-turn)', textTransform: 'uppercase', fontWeight: 700, backgroundColor: 'rgba(255,200,0,0.15)', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>
                    En jeu
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}><GiSundial size={12} /> {p.initiative}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}><GiShield size={12} /> {p.armor_class}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
              <GiHearts size={14} style={{ color: hpColor }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: hpColor, fontWeight: 700 }}>{p.hp_current}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>/{p.hp_max}</span>
            </div>
            <div className="hp-bar">
              <div className="hp-bar__fill" style={{ width: `${Math.min(100, hpPct)}%`, backgroundColor: hpColor, transition: 'width 0.4s ease, background-color 0.4s ease' }} />
            </div>
          </div>
        );
      })}

      {/* KO */}
      {downParts.length > 0 && (
        <>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <GiDeathSkull size={12} /> Hors combat
          </p>
          {downParts.map(p => (
            <div key={p.id} className="card" style={{ opacity: 0.5, padding: '0.375rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {typeIcon(p.participant_type)}
              <span style={{ fontSize: '0.875rem', textDecoration: 'line-through' }}>{p.display_name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}