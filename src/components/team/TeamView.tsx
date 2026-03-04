import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { GiCrossedSwords, GiHearts, GiShield, GiLeatherBoot, GiCharacter } from 'react-icons/gi';

interface TeamViewProps {
  campaignId: string;
}

interface TeamMember {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hp_current: number;
  hp_max: number;
  armor_class: number;
  speed: number;
  profile?: { display_name: string };
}

export default function TeamView({ campaignId }: TeamViewProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeam = useCallback(async () => {
    const { data } = await supabase
      .from('characters')
      .select('id, name, race, class, level, hp_current, hp_max, armor_class, speed, profiles(display_name)')
      .eq('campaign_id', campaignId);
    if (data) setMembers(data.map((c: any) => ({ ...c, profile: c.profiles })));
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  useEffect(() => {
    const channel = supabase.channel('team-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: 'campaign_id=eq.' + campaignId }, () => fetchTeam())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId, fetchTeam]);

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <GiCrossedSwords size={20} style={{ color: 'var(--color-accent)' }} />
        <h2 style={{ fontSize: '1.25rem' }}>Equipe ({members.length})</h2>
      </div>

      {members.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <GiCharacter size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucun membre dans l equipe</p>
        </div>
      ) : (
        <div className="card-grid card-grid--2col">
          {members.map(m => {
            const hpPct = m.hp_max > 0 ? Math.round((m.hp_current / m.hp_max) * 100) : 0;
            return (
              <div key={m.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem' }}>{m.name}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.race} {m.class} niv.{m.level}</p>
                  </div>
                  {m.profile && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>{m.profile.display_name}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <GiHearts size={14} style={{ color: 'var(--color-hp)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--color-hp)' }}>{m.hp_current}/{m.hp_max}</span>
                </div>
                <div className="hp-bar">
                  <div className="hp-bar__fill" style={{ width: `${Math.min(100, hpPct)}%` }} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiShield size={12} style={{ color: 'var(--color-armor-class)' }} /> {m.armor_class}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiLeatherBoot size={12} style={{ color: 'var(--color-info)' }} /> {m.speed}ft</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
