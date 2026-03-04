import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Tables } from '../../types/database';
import { GiBroadsword, GiSundial, GiShield, GiHearts, GiCrestedHelmet, GiWolfHead, GiCharacter, GiDeathSkull, GiCrossedSwords } from 'react-icons/gi';

interface CombatTrackerProps {
  campaignId: string;
}

export default function CombatTracker({ campaignId }: CombatTrackerProps) {
  const { user } = useAuth();
  const [combat, setCombat] = useState<Tables<'combats'> | null>(null);
  const [participants, setParticipants] = useState<Tables<'combat_participants'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [combatName, setCombatName] = useState('Nouveau combat');

  // Add participant form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ display_name: '', participant_type: 'monster' as 'player' | 'monster' | 'npc', hp_max: 10, hp_current: 10, armor_class: 10, initiative: 0 });

  // Available players/NPCs for adding
  const [availablePlayers, setAvailablePlayers] = useState<Array<{ id: string; name: string; hp_current: number; hp_max: number; armor_class: number }>>([]);
  const [availableNpcs, setAvailableNpcs] = useState<Array<{ id: string; name: string; hp_current: number; hp_max: number; armor_class: number }>>([]);

  const fetchCombat = useCallback(async () => {
    const { data } = await supabase.from('combats').select('*').eq('campaign_id', campaignId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single();
    if (data) {
      setCombat(data);
      const { data: parts } = await supabase.from('combat_participants').select('*').eq('combat_id', data.id).order('initiative', { ascending: false });
      if (parts) setParticipants(parts);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { fetchCombat(); }, [fetchCombat]);

  useEffect(() => {
    // Fetch available players and NPCs for adding
    supabase.from('characters').select('id, name, hp_current, hp_max, armor_class').eq('campaign_id', campaignId).then(({ data }) => {
      if (data) setAvailablePlayers(data);
    });
    supabase.from('npcs').select('id, name, hp_current, hp_max, armor_class').eq('campaign_id', campaignId).then(({ data }) => {
      if (data) setAvailableNpcs(data);
    });
  }, [campaignId]);

  useEffect(() => {
    if (!combat) return;
    const channel = supabase.channel('combat-' + combat.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combat_participants', filter: 'combat_id=eq.' + combat.id }, () => {
        supabase.from('combat_participants').select('*').eq('combat_id', combat.id).order('initiative', { ascending: false }).then(({ data }) => {
          if (data) setParticipants(data);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combats', filter: 'id=eq.' + combat.id }, (p: any) => {
        if (p.new) setCombat(p.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [combat?.id]);

  async function createCombat() {
    const { data } = await supabase.from('combats').insert({ campaign_id: campaignId, name: combatName }).select().single();
    if (data) {
      setCombat(data);
      // Switch campaign to combat mode
      await supabase.from('campaigns').update({ mode: 'combat', active_combat_id: data.id }).eq('id', campaignId);
    }
  }

  async function addParticipant() {
    if (!combat || !addForm.display_name.trim()) return;
    await supabase.from('combat_participants').insert({
      combat_id: combat.id,
      display_name: addForm.display_name,
      participant_type: addForm.participant_type,
      hp_max: addForm.hp_max,
      hp_current: addForm.hp_current,
      armor_class: addForm.armor_class,
      initiative: addForm.initiative,
    });
    setAddForm({ display_name: '', participant_type: 'monster', hp_max: 10, hp_current: 10, armor_class: 10, initiative: 0 });
    setShowAdd(false);
  }

  async function addExistingPlayer(p: typeof availablePlayers[0]) {
    if (!combat) return;
    await supabase.from('combat_participants').insert({
      combat_id: combat.id, display_name: p.name, participant_type: 'player',
      hp_max: p.hp_max, hp_current: p.hp_current, armor_class: p.armor_class,
      character_id: p.id, initiative: 0,
    });
  }

  async function addExistingNpc(n: typeof availableNpcs[0]) {
    if (!combat) return;
    await supabase.from('combat_participants').insert({
      combat_id: combat.id, display_name: n.name, participant_type: 'npc',
      hp_max: n.hp_max, hp_current: n.hp_current, armor_class: n.armor_class,
      npc_id: n.id, initiative: 0,
    });
  }

  async function updateParticipantHp(id: string, delta: number) {
    const p = participants.find(x => x.id === id);
    if (!p) return;
    const newHp = Math.max(0, Math.min(p.hp_max, p.hp_current + delta));
    await supabase.from('combat_participants').update({ hp_current: newHp }).eq('id', id);
  }

  async function updateInitiative(id: string, init: number) {
    await supabase.from('combat_participants').update({ initiative: init }).eq('id', id);
  }

  async function removeParticipant(id: string) {
    await supabase.from('combat_participants').delete().eq('id', id);
  }

  async function toggleActive(id: string, isActive: boolean) {
    await supabase.from('combat_participants').update({ is_active: !isActive }).eq('id', id);
  }

  async function nextTurn() {
    if (!combat || participants.length === 0) return;
    const activeParts = participants.filter(p => p.is_active);
    if (activeParts.length === 0) return;
    const currentIdx = combat.current_turn_index ?? -1;
    const nextIdx = (currentIdx + 1) % activeParts.length;
    await supabase.from('combats').update({ current_turn_index: nextIdx }).eq('id', combat.id);
  }

  async function endCombat() {
    if (!combat) return;
    await supabase.from('combats').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', combat.id);
    await supabase.from('campaigns').update({ mode: 'exploration', active_combat_id: null }).eq('id', campaignId);
    // Sync HP back to characters
    for (const p of participants) {
      if (p.character_id) {
        await supabase.from('characters').update({ hp_current: p.hp_current }).eq('id', p.character_id);
      }
    }
    setCombat(null); setParticipants([]);
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  // No active combat — show create
  if (!combat) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiCrossedSwords size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Combat</h2>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <GiBroadsword size={32} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Aucun combat actif</p>
          <input className="input" value={combatName} onChange={(e) => setCombatName(e.target.value)} placeholder="Nom du combat" style={{ marginBottom: '0.5rem', textAlign: 'center' }} />
          <button className="btn btn--primary" onClick={createCombat} style={{ width: '100%' }}>
            <GiBroadsword size={16} /> Lancer le combat
          </button>
        </div>
      </div>
    );
  }

  const activeParts = participants.filter(p => p.is_active).sort((a, b) => b.initiative - a.initiative);
  const downParts = participants.filter(p => !p.is_active);
  const currentTurnIdx = combat.current_turn_index ?? -1;
  const currentParticipant = currentTurnIdx >= 0 && currentTurnIdx < activeParts.length ? activeParts[currentTurnIdx] : null;

  const typeIcon = (type: string) => {
    if (type === 'player') return <GiCrestedHelmet size={12} style={{ color: 'var(--color-player-color)' }} />;
    if (type === 'monster') return <GiWolfHead size={12} style={{ color: 'var(--color-monster-color)' }} />;
    return <GiCharacter size={12} style={{ color: 'var(--color-npc-color)' }} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiCrossedSwords size={20} style={{ color: 'var(--color-error)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>{combat.name}</h2>
        </div>
        <button className="btn btn--danger" onClick={endCombat} style={{ fontSize: '0.75rem' }}>Fin du combat</button>
      </div>

      {/* Current turn */}
      {currentParticipant && (
        <div className="card card--accent animate-pulse-turn" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}><GiSundial size={12} /> Tour actuel</p>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-your-turn)' }}>{currentParticipant.display_name}</h3>
          <button className="btn btn--primary" onClick={nextTurn} style={{ marginTop: '0.5rem' }}>Tour suivant</button>
        </div>
      )}

      {currentTurnIdx < 0 && activeParts.length > 0 && (
        <button className="btn btn--primary" onClick={nextTurn} style={{ width: '100%' }}>
          <GiSundial size={16} /> Demarrer les tours
        </button>
      )}

      {/* Add participant */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: '0.75rem' }}>{showAdd ? 'Annuler' : '+ Participant'}</button>
        {availablePlayers.map(p => {
          const alreadyIn = participants.some(x => x.character_id === p.id);
          return !alreadyIn ? (
            <button key={p.id} className="btn btn--ghost" onClick={() => addExistingPlayer(p)} style={{ fontSize: '0.6875rem', color: 'var(--color-player-color)' }}>
              <GiCrestedHelmet size={12} /> {p.name}
            </button>
          ) : null;
        })}
        {availableNpcs.map(n => {
          const alreadyIn = participants.some(x => x.npc_id === n.id);
          return !alreadyIn ? (
            <button key={n.id} className="btn btn--ghost" onClick={() => addExistingNpc(n)} style={{ fontSize: '0.6875rem', color: 'var(--color-npc-color)' }}>
              <GiCharacter size={12} /> {n.name}
            </button>
          ) : null;
        })}
      </div>

      {showAdd && (
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <input className="input" placeholder="Nom" value={addForm.display_name} onChange={(e) => setAddForm({ ...addForm, display_name: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {(['player', 'monster', 'npc'] as const).map(t => (
              <button key={t} className={addForm.participant_type === t ? 'btn btn--primary' : 'btn btn--ghost'} onClick={() => setAddForm({ ...addForm, participant_type: t })} style={{ flex: 1, fontSize: '0.75rem' }}>
                {t === 'player' ? <GiCrestedHelmet size={14} /> : t === 'monster' ? <GiWolfHead size={14} /> : <GiCharacter size={14} />} {t === 'player' ? 'Joueur' : t === 'monster' ? 'Monstre' : 'PNJ'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
              <GiHearts size={14} style={{ color: 'var(--color-hp)' }} />
              <input className="input" type="number" min={0} value={addForm.hp_max} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value) || 0); setAddForm({ ...addForm, hp_max: v, hp_current: v }); }} style={{ width: '4rem', textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
              <GiShield size={14} style={{ color: 'var(--color-armor-class)' }} />
              <input className="input" type="number" min={0} value={addForm.armor_class} onChange={(e) => setAddForm({ ...addForm, armor_class: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '4rem', textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
              <GiSundial size={14} style={{ color: 'var(--color-warning)' }} />
              <input className="input" type="number" min={0} value={addForm.initiative} onChange={(e) => setAddForm({ ...addForm, initiative: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '4rem', textAlign: 'center' }} />
            </div>
          </div>
          <button className="btn btn--primary" onClick={addParticipant} disabled={!addForm.display_name.trim()}>Ajouter</button>
        </div>
      )}

      {/* Active participants */}
      {activeParts.map((p, idx) => {
        const hpPct = p.hp_max > 0 ? Math.round((p.hp_current / p.hp_max) * 100) : 0;
        const isCurrent = idx === currentTurnIdx;
        return (
          <div key={p.id} className="card" style={{ borderColor: isCurrent ? 'var(--color-your-turn)' : undefined, boxShadow: isCurrent ? 'var(--glow-accent)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {typeIcon(p.participant_type)}
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.display_name}</span>
                {isCurrent && <span style={{ fontSize: '0.5625rem', color: 'var(--color-your-turn)', textTransform: 'uppercase' }}>En jeu</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <GiSundial size={12} style={{ color: 'var(--color-warning)' }} />
                <input className="input" type="number" min={0} value={p.initiative} onChange={(e) => updateInitiative(p.id, Math.max(0, parseInt(e.target.value) || 0))} style={{ width: '3rem', textAlign: 'center', padding: '0.125rem', fontSize: '0.75rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
              <button className="btn btn--ghost" onClick={() => updateParticipantHp(p.id, -1)} style={{ padding: '0.125rem 0.375rem', color: 'var(--color-error)' }}>-</button>
              <GiHearts size={14} style={{ color: 'var(--color-hp)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{p.hp_current}/{p.hp_max}</span>
              <button className="btn btn--ghost" onClick={() => updateParticipantHp(p.id, 1)} style={{ padding: '0.125rem 0.375rem', color: 'var(--color-success)' }}>+</button>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.125rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                <GiShield size={12} /> {p.armor_class}
              </span>
            </div>
            <div className="hp-bar">
              <div className="hp-bar__fill" style={{ width: `${Math.min(100, hpPct)}%` }} />
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem', justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={() => toggleActive(p.id, p.is_active)} style={{ fontSize: '0.6875rem', color: 'var(--color-warning)' }}><GiDeathSkull size={14} /> KO</button>
              <button className="btn btn--ghost" onClick={() => removeParticipant(p.id)} style={{ fontSize: '0.6875rem', color: 'var(--color-error)' }}>X</button>
            </div>
          </div>
        );
      })}

      {/* Down participants */}
      {downParts.length > 0 && (
        <>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiDeathSkull size={12} /> Hors combat ({downParts.length})</p>
          {downParts.map(p => (
            <div key={p.id} className="card" style={{ opacity: 0.5, padding: '0.375rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>{typeIcon(p.participant_type)} {p.display_name}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="btn btn--ghost" onClick={() => toggleActive(p.id, p.is_active)} style={{ fontSize: '0.6875rem', color: 'var(--color-success)' }}>Relever</button>
                <button className="btn btn--ghost" onClick={() => removeParticipant(p.id)} style={{ fontSize: '0.6875rem', color: 'var(--color-error)' }}>X</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
