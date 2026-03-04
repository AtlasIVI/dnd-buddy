import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { GiCrossedSwords, GiHearts, GiShield, GiLeatherBoot, GiCharacter, GiEyeTarget, GiSkills, GiBackpack } from 'react-icons/gi';

interface GmPlayersPanelProps { campaignId: string; gmSeeHidden: boolean; }

interface PlayerData {
  user_id: string; display_name: string;
  character?: { id: string; name: string; class: string; race: string; level: number; hp_current: number; hp_max: number; armor_class: number; speed: number; str: number; dex: number; con: number; int: number; wis: number; cha: number; };
}

export default function GmPlayersPanel({ campaignId, gmSeeHidden }: GmPlayersPanelProps) {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlayers = useCallback(async () => {
    const { data: members } = await supabase.from('campaign_members').select('user_id, profiles(display_name)').eq('campaign_id', campaignId).eq('role', 'player');
    if (!members) { setLoading(false); return; }
    const result: PlayerData[] = [];
    for (const m of members) {
      const profile = (m as any).profiles;
      const { data: char } = await supabase.from('characters').select('id, name, class, race, level, hp_current, hp_max, armor_class, speed, str, dex, con, int, wis, cha').eq('campaign_id', campaignId).eq('user_id', m.user_id).single();
      result.push({ user_id: m.user_id, display_name: profile?.display_name || 'Joueur', character: char || undefined });
    }
    setPlayers(result); setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  useEffect(() => {
    const ch = supabase.channel('gm-players-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: 'campaign_id=eq.' + campaignId }, () => fetchPlayers())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, fetchPlayers]);

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><GiCrossedSwords /> Joueurs ({players.length})</h2>
      {players.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}><p style={{ color: 'var(--color-text-muted)' }}>Aucun joueur dans la campagne</p></div>
      ) : (
        <div className="card-grid card-grid--2col">
          {players.map(p => (
            <div key={p.user_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}><GiCharacter size={16} /> {p.display_name}</span>
                <span className="badge badge--player">{p.character?.class || '?'}</span>
              </div>
              {p.character ? (
                <>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{p.character.name} — {p.character.race} niv.{p.character.level}</p>
                  <div className="hp-bar hp-bar--large" style={{ marginBottom: '0.375rem' }}>
                    <div className="hp-bar__fill" style={{ width: `${Math.max(0, (p.character.hp_current / p.character.hp_max) * 100)}%` }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><GiHearts size={12} style={{ color: 'var(--color-hp)' }} /> {p.character.hp_current}/{p.character.hp_max}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><GiShield size={12} /> CA {p.character.armor_class}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><GiLeatherBoot size={12} /> {p.character.speed}ft</span>
                  </div>
                  {gmSeeHidden && (
                    <div style={{ marginTop: '0.5rem', padding: '0.375rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', fontSize: '0.6875rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem', color: 'var(--color-accent)' }}><GiEyeTarget size={12} /> Stats</span>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-mono)' }}>
                        <span><GiShield size={10} /> FOR {p.character.str}</span>
                        <span>DEX {p.character.dex}</span>
                        <span>CON {p.character.con}</span>
                        <span>INT {p.character.int}</span>
                        <span>SAG {p.character.wis}</span>
                        <span>CHA {p.character.cha}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>Pas encore de personnage</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
