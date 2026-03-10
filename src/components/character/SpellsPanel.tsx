import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Tables, TablesInsert } from '../../types/database';
import {
  GiSpellBook, GiMagicSwirl, GiCrystalBall, GiFireSpellCast,
  GiSundial, GiArrowScope, GiSpiralArrow, GiConcentrationOrb,
  GiDiceSixFacesSix, GiScrollUnfurled, GiBroadsword, GiHearts, GiShield,
} from 'react-icons/gi';

type Spell     = Tables<'spells'>;
type SpellSlot = Tables<'spell_slots'>;
type CombatParticipant = Tables<'combat_participants'>;

interface SpellsPanelProps {
  characterId: string;
  readOnly?: boolean;
  combatMode?: boolean;
  /** Nécessaire en mode combat pour créer les active_buffs */
  charId?: string;
}

const SLOT_LEVELS  = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ORDINAL      = ['', '1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e'];
const CASTING_TIMES = ['1 action', '1 action bonus', '1 réaction', '1 minute', '10 minutes', '1 heure'];

function emptySpell(characterId: string): Omit<Spell, 'id' | 'created_at'> {
  return {
    character_id: characterId, name: '', level: 0, casting_time: '1 action',
    range: '', duration: '', concentration: false, damage_dice: '', description: '',
    is_prepared: false, is_hidden: false, sort_order: 0,
    buff_ca: null, buff_hp_temp: null, buff_stat_ability: null, buff_stat_value: null,
    buff_duration_rounds: null, buff_target_count: 1,
  };
}

function SlotPip({ filled }: { filled: boolean }) {
  return <div style={{ width: '1rem', height: '1rem', borderRadius: '50%', border: '1.5px solid var(--color-accent)', backgroundColor: filled ? 'var(--color-accent)' : 'transparent', transition: 'background-color 0.15s', flexShrink: 0 }} />;
}

// ─── Modal sélection de cibles ────────────────────────────────────────────────

function TargetModal({ spell, slots, participants, currentRound, onConfirm, onClose }: {
  spell: Spell;
  slots: SpellSlot[];
  participants: CombatParticipant[];
  currentRound: number;
  onConfirm: (targetIds: string[], slotLevel: number) => void;
  onClose: () => void;
}) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot]       = useState<number>(spell.level);
  const maxTargets = spell.buff_target_count ?? 1;

  // Slots disponibles pour ce sort
  const availableSlots = spell.level === 0 ? [] : slots.filter(s => s.slot_level >= spell.level && (s.slots_total - s.slots_used) > 0);

  function toggleTarget(id: string) {
    setSelectedTargets(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= maxTargets) return [...prev.slice(1), id]; // remplace le plus ancien si max atteint
      return [...prev, id];
    });
  }

  // Résumé des buffs
  const buffSummary: string[] = [];
  if (spell.buff_ca)       buffSummary.push(`CA ${spell.buff_ca > 0 ? '+' : ''}${spell.buff_ca}`);
  if (spell.buff_hp_temp)  buffSummary.push(`+${spell.buff_hp_temp} PV temporaires`);
  if (spell.buff_stat_ability && spell.buff_stat_value) buffSummary.push(`${spell.buff_stat_ability} ${spell.buff_stat_value > 0 ? '+' : ''}${spell.buff_stat_value}`);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '28rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GiMagicSwirl size={18} style={{ color: 'var(--color-info)' }} /> {spell.name}
          </h3>
          <button className="btn btn--ghost" onClick={onClose} style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>✕</button>
        </div>

        {/* Résumé du buff */}
        {buffSummary.length > 0 && (
          <div style={{ backgroundColor: 'rgba(52,152,219,0.1)', border: '1px solid rgba(52,152,219,0.3)', borderRadius: 'var(--button-radius)', padding: '0.375rem 0.625rem', fontSize: '0.75rem', color: 'var(--color-info)' }}>
            Effet : {buffSummary.join(' · ')}
            {spell.buff_duration_rounds !== null
              ? ` · ${spell.buff_duration_rounds} round${spell.buff_duration_rounds > 1 ? 's' : ''}`
              : ' · Manuel (désactivation manuelle)'}
          </div>
        )}

        {/* Sélection emplacement */}
        {spell.level > 0 && availableSlots.length > 0 && (
          <div>
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Emplacement de sort</p>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {availableSlots.map(s => (
                <button key={s.slot_level}
                  className={selectedSlot === s.slot_level ? 'btn btn--primary' : 'btn btn--ghost'}
                  onClick={() => setSelectedSlot(s.slot_level)}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                  {ORDINAL[s.slot_level]} ({s.slots_total - s.slots_used} dispo)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sélection cibles */}
        <div>
          <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
            Cible(s) — {selectedTargets.length}/{maxTargets} sélectionné(s)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {participants.filter(p => p.is_active && p.participant_type === 'player').map(p => (
              <button key={p.id}
                className={selectedTargets.includes(p.id) ? 'btn btn--primary' : 'btn btn--ghost'}
                onClick={() => toggleTarget(p.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}>
                <span>{p.display_name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}>
                  <GiHearts size={11} style={{ marginRight: '0.2rem' }} />{p.hp_current}/{p.hp_max}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn--primary"
          onClick={() => { if (selectedTargets.length > 0) onConfirm(selectedTargets, selectedSlot); }}
          disabled={selectedTargets.length === 0 || (spell.level > 0 && availableSlots.length === 0)}
          style={{ width: '100%' }}>
          Lancer le sort ({selectedTargets.length} cible{selectedTargets.length > 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}

// ─── SpellCombatCard ──────────────────────────────────────────────────────────

function SpellCombatCard({ spell, slots, onCast, onCastBuff }: {
  spell: Spell; slots: SpellSlot[];
  onCast: (slotLevel: number) => void;
  onCastBuff: (spell: Spell) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCantrip = spell.level === 0;
  const isBuff    = !!(spell.buff_ca || spell.buff_hp_temp || spell.buff_stat_ability);
  const availableSlots = isCantrip ? [] : slots.filter(s => s.slot_level >= spell.level && (s.slots_total - s.slots_used) > 0);
  const canCast = isCantrip || availableSlots.length > 0;
  const actionColor = spell.casting_time === '1 action' ? 'var(--color-accent)' : spell.casting_time === '1 action bonus' ? 'var(--color-info)' : spell.casting_time === '1 réaction' ? 'var(--color-warning)' : 'var(--color-success)';

  return (
    <div style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', border: `1px solid ${canCast ? (isBuff ? 'var(--color-info)' : 'var(--color-accent)') : 'var(--color-border)'}`, opacity: canCast ? 1 : 0.5, overflow: 'hidden', borderLeft: `3px solid ${actionColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.4rem 0.5rem' }}>
        <button onClick={() => setExpanded(x => !x)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{spell.name}</span>
            {isBuff && <GiShield size={11} style={{ color: 'var(--color-info)' }} title="Sort de buff" />}
            {spell.concentration && <GiConcentrationOrb size={11} style={{ color: 'var(--color-warning)' }} />}
            {spell.damage_dice && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: 'var(--color-error)', fontWeight: 700, backgroundColor: 'rgba(231,76,60,0.1)', padding: '0.05rem 0.3rem', borderRadius: '999px' }}>{spell.damage_dice}</span>}
            {!isCantrip && <span style={{ fontSize: '0.5rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>niv.{spell.level}</span>}
          </div>
        </button>

        {/* Bouton lancer — buff ouvre le modal cibles, sinon lance direct */}
        {isBuff ? (
          <button className="btn btn--primary"
            onClick={() => onCastBuff(spell)}
            disabled={!canCast}
            style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', minHeight: 'unset', whiteSpace: 'nowrap', backgroundColor: 'var(--color-info)' }}>
            <GiShield size={11} /> Buff
          </button>
        ) : isCantrip ? (
          <button className="btn btn--primary" onClick={() => onCast(0)}
            style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', minHeight: 'unset', whiteSpace: 'nowrap' }}>
            <GiBroadsword size={11} /> Lancer
          </button>
        ) : availableSlots.length === 1 ? (
          <button className="btn btn--primary" onClick={() => onCast(availableSlots[0].slot_level)} disabled={!canCast}
            style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', minHeight: 'unset', whiteSpace: 'nowrap' }}>
            <GiBroadsword size={11} /> {ORDINAL[availableSlots[0].slot_level]}
          </button>
        ) : availableSlots.length > 1 ? (
          <select className="input" style={{ fontSize: '0.625rem', padding: '0.15rem 0.25rem', width: 'auto', cursor: 'pointer' }}
            onChange={e => { if (e.target.value) onCast(parseInt(e.target.value)); e.target.value = ''; }} defaultValue="">
            <option value="" disabled>Lancer…</option>
            {availableSlots.map(s => <option key={s.slot_level} value={s.slot_level}>{ORDINAL[s.slot_level]} ({s.slots_total - s.slots_used})</option>)}
          </select>
        ) : (
          <span style={{ fontSize: '0.625rem', color: 'var(--color-error)', fontWeight: 600 }}>Épuisé</span>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 0.5rem 0.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }} className="animate-fade-in">
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
            {spell.casting_time && <span><GiSundial size={11} /> {spell.casting_time}</span>}
            {spell.range        && <span><GiArrowScope size={11} /> {spell.range}</span>}
            {spell.duration     && <span><GiSpiralArrow size={11} /> {spell.duration}</span>}
          </div>
          {/* Détail buffs */}
          {isBuff && (
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-info)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {spell.buff_ca       && <span><GiShield size={11} /> CA {spell.buff_ca > 0 ? `+${spell.buff_ca}` : spell.buff_ca}</span>}
              {spell.buff_hp_temp  && <span><GiHearts size={11} /> +{spell.buff_hp_temp} PV temp</span>}
              {spell.buff_duration_rounds !== null ? <span>⏱ {spell.buff_duration_rounds} round{(spell.buff_duration_rounds ?? 0) > 1 ? 's' : ''}</span> : <span>⏱ Manuel</span>}
              {(spell.buff_target_count ?? 1) > 1 && <span>👥 {spell.buff_target_count} cibles</span>}
            </div>
          )}
          {spell.description && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{spell.description}</p>}
        </div>
      )}
    </div>
  );
}

// ─── SpellCard (exploration) ──────────────────────────────────────────────────

function SpellCard({ spell, readOnly, onTogglePrepared, onDelete }: {
  spell: Spell; readOnly?: boolean; onTogglePrepared: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isBuff = !!(spell.buff_ca || spell.buff_hp_temp || spell.buff_stat_ability);
  return (
    <div style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', border: `1px solid ${spell.is_prepared ? (isBuff ? 'var(--color-info)' : 'var(--color-accent)') : 'var(--color-border)'}`, overflow: 'hidden', transition: 'border-color 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', cursor: 'pointer' }} onClick={() => setExpanded(x => !x)}>
        {!readOnly && spell.level > 0 && (
          <button className="btn btn--ghost" onClick={e => { e.stopPropagation(); onTogglePrepared(); }}
            style={{ padding: '0.125rem', minHeight: 'unset', width: '1.5rem', height: '1.5rem', color: spell.is_prepared ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
            <GiCrystalBall size={14} />
          </button>
        )}
        <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, color: spell.is_prepared || spell.level === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
          {spell.name || <em style={{ color: 'var(--color-text-muted)' }}>Sans nom</em>}
        </span>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
          {isBuff       && <GiShield size={13} style={{ color: 'var(--color-info)' }} title="Sort de buff" />}
          {spell.concentration && <GiConcentrationOrb size={14} style={{ color: 'var(--color-warning)' }} />}
          {spell.damage_dice   && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--color-error)', fontWeight: 700, backgroundColor: 'rgba(231,76,60,0.1)', padding: '0.1rem 0.35rem', borderRadius: '999px' }}>{spell.damage_dice}</span>}
          <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 0.625rem 0.625rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.375rem' }} className="animate-fade-in">
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            {spell.casting_time && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiSundial size={12} /> {spell.casting_time}</span>}
            {spell.range        && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiArrowScope size={12} /> {spell.range}</span>}
            {spell.duration     && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><GiSpiralArrow size={12} /> {spell.duration}</span>}
          </div>
          {/* Détail buff en exploration */}
          {isBuff && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-info)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.25rem 0.375rem', backgroundColor: 'rgba(52,152,219,0.08)', borderRadius: 'var(--button-radius)' }}>
              {spell.buff_ca      && <span><GiShield size={12} /> CA {spell.buff_ca > 0 ? `+${spell.buff_ca}` : spell.buff_ca}</span>}
              {spell.buff_hp_temp && <span><GiHearts size={12} /> +{spell.buff_hp_temp} PV temp</span>}
              {spell.buff_stat_ability && spell.buff_stat_value && <span>+{spell.buff_stat_value} {spell.buff_stat_ability}</span>}
              <span>{spell.buff_duration_rounds !== null ? `${spell.buff_duration_rounds} rounds` : 'durée manuelle'}</span>
              {(spell.buff_target_count ?? 1) > 1 && <span>👥 {spell.buff_target_count} cibles max</span>}
            </div>
          )}
          {spell.description && <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{spell.description}</p>}
          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={onDelete} style={{ fontSize: '0.6875rem', color: 'var(--color-error)', padding: '0.25rem 0.5rem', minHeight: 'unset' }}>Supprimer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SpellsPanel({ characterId, readOnly, combatMode, charId }: SpellsPanelProps) {
  const [spells,       setSpells]       = useState<Spell[]>([]);
  const [slots,        setSlots]        = useState<SpellSlot[]>([]);
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState<Omit<Spell, 'id' | 'created_at'>>(emptySpell(characterId));
  const [saving,       setSaving]       = useState(false);
  const [activeTab,    setActiveTab]    = useState<'cantrips' | 'prepared' | 'known'>('prepared');
  // Sort buff en attente de sélection de cibles
  const [buffSpell,    setBuffSpell]    = useState<Spell | null>(null);
  const [currentRound, setCurrentRound] = useState(1);

  const fetchSpells = useCallback(async () => {
    const { data } = await supabase.from('spells').select('*').eq('character_id', characterId).order('level').order('name');
    if (data) setSpells(data);
  }, [characterId]);

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase.from('spell_slots').select('*').eq('character_id', characterId).order('slot_level');
    if (data) setSlots(data);
  }, [characterId]);

  // En mode combat, récupérer les participants pour la sélection de cibles
  const fetchParticipants = useCallback(async () => {
    if (!combatMode) return;
    const { data: campaign } = await supabase.from('combats').select('id, current_turn_index').eq('status', 'active').limit(1).single();
    if (!campaign) return;
    setCurrentRound(1); // Le round réel vient du CombatTracker — ici approximation
    const { data } = await supabase.from('combat_participants').select('*').eq('combat_id', campaign.id).eq('is_active', true);
    if (data) setParticipants(data);
  }, [combatMode]);

  useEffect(() => {
    Promise.all([fetchSpells(), fetchSlots(), fetchParticipants()]).finally(() => setLoading(false));
  }, [fetchSpells, fetchSlots, fetchParticipants]);

  useEffect(() => {
    const ch = supabase.channel('spells-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spells',      filter: `character_id=eq.${characterId}` }, fetchSpells)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spell_slots', filter: `character_id=eq.${characterId}` }, fetchSlots)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [characterId, fetchSpells, fetchSlots]);

  // CRUD sorts
  async function addSpell() {
    if (!form.name.trim()) return; setSaving(true);
    const { data } = await supabase.from('spells').insert(form).select().single();
    if (data) { setSpells(p => [...p, data]); setForm(emptySpell(characterId)); setShowForm(false); }
    setSaving(false);
  }
  async function togglePrepared(spell: Spell) {
    const val = !spell.is_prepared;
    setSpells(p => p.map(s => s.id === spell.id ? { ...s, is_prepared: val } : s));
    await supabase.from('spells').update({ is_prepared: val }).eq('id', spell.id);
  }
  async function deleteSpell(id: string) {
    setSpells(p => p.filter(s => s.id !== id));
    await supabase.from('spells').delete().eq('id', id);
  }

  // Slots
  async function upsertSlotTotal(level: number, total: number) {
    const existing = slots.find(s => s.slot_level === level);
    if (existing) {
      const upd = { ...existing, slots_total: Math.max(0, total), slots_used: Math.min(existing.slots_used, Math.max(0, total)) };
      setSlots(p => p.map(s => s.slot_level === level ? upd : s));
      await supabase.from('spell_slots').update({ slots_total: upd.slots_total, slots_used: upd.slots_used }).eq('id', existing.id);
    } else if (total > 0) {
      const { data } = await supabase.from('spell_slots').insert({ character_id: characterId, slot_level: level, slots_total: total, slots_used: 0 }).select().single();
      if (data) setSlots(p => [...p, data].sort((a, b) => a.slot_level - b.slot_level));
    }
  }
  async function useSlot(level: number) {
    const s = slots.find(x => x.slot_level === level);
    if (!s || s.slots_used >= s.slots_total) return;
    const used = s.slots_used + 1;
    setSlots(p => p.map(x => x.slot_level === level ? { ...x, slots_used: used } : x));
    await supabase.from('spell_slots').update({ slots_used: used }).eq('id', s.id);
  }
  async function restoreSlot(level: number) {
    const s = slots.find(x => x.slot_level === level);
    if (!s || s.slots_used === 0) return;
    const used = s.slots_used - 1;
    setSlots(p => p.map(x => x.slot_level === level ? { ...x, slots_used: used } : x));
    await supabase.from('spell_slots').update({ slots_used: used }).eq('id', s.id);
  }
  async function longRest() {
    const updated = slots.map(s => ({ ...s, slots_used: 0 }));
    setSlots(updated);
    await Promise.all(updated.map(s => supabase.from('spell_slots').update({ slots_used: 0 }).eq('id', s.id)));
  }

  // Lancer un sort normal (consomme slot)
  async function castSpell(_spell: Spell, slotLevel: number) {
    if (slotLevel > 0) await useSlot(slotLevel);
  }

  // Lancer un sort buff — crée active_buffs pour chaque cible
  async function castBuffSpell(spell: Spell, targetIds: string[], slotLevel: number) {
    if (slotLevel > 0) await useSlot(slotLevel);

    // Trouver le combat actif
    const { data: combat } = await supabase.from('combats').select('id').eq('status', 'active').limit(1).single();
    if (!combat) return;

    // Créer un active_buff par cible — on résout character_id à partir de combat_participants
    const inserts = targetIds.map((participantId): TablesInsert<'active_buffs'> | null => {
      const p = participants.find(x => x.id === participantId);
      if (!p?.character_id) return null;
      return {
        character_id:            p.character_id,
        applied_by_character_id: charId ?? null,
        combat_id:               combat.id,
        source_type:             'spell' as const,
        source_id:               spell.id,
        source_name:             spell.name,
        bonus_ca:                spell.buff_ca ?? 0,
        bonus_hp_temp:           spell.buff_hp_temp ?? 0,
        bonus_stat_ability:      spell.buff_stat_ability ?? null,
        bonus_stat_value:        spell.buff_stat_value ?? 0,
        applied_at_round:        currentRound,
        expires_at_round:        spell.buff_duration_rounds !== null
          ? currentRound + (spell.buff_duration_rounds ?? 0)
          : null,
      };
    }).filter((entry): entry is TablesInsert<'active_buffs'> => entry !== null);

    if (inserts.length > 0) {
      await supabase.from('active_buffs').insert(inserts);
    }

    setBuffSpell(null);
  }

  const cantrips = spells.filter(s => s.level === 0);
  const prepared = spells.filter(s => s.level > 0 && s.is_prepared);
  const known    = spells.filter(s => s.level > 0 && !s.is_prepared);
  const usedSlots  = slots.reduce((acc, s) => acc + s.slots_used, 0);
  const totalSlots = slots.reduce((acc, s) => acc + s.slots_total, 0);

  if (loading) return <p style={{ color: 'var(--color-text-muted)', padding: '1rem' }}>Chargement...</p>;

  // ─── MODE COMBAT ──────────────────────────────────────────────────────────

  if (combatMode) {
    const combatSpells = [...cantrips, ...prepared];
    return (
      <>
        {/* Modal sélection cibles (sort buff) */}
        {buffSpell && (
          <TargetModal
            spell={buffSpell} slots={slots} participants={participants} currentRound={currentRound}
            onConfirm={(targets, slot) => castBuffSpell(buffSpell, targets, slot)}
            onClose={() => setBuffSpell(null)}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Slots compacts */}
          <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <GiMagicSwirl size={16} style={{ color: 'var(--color-accent)' }} />
                <h3 style={{ fontSize: '0.9375rem' }}>Sorts</h3>
              </div>
              {totalSlots > 0 && <button className="btn btn--ghost" onClick={longRest} style={{ fontSize: '0.625rem', color: 'var(--color-info)' }}>↺ Repos long</button>}
            </div>
            {totalSlots > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {SLOT_LEVELS.map(level => {
                  const slot = slots.find(s => s.slot_level === level);
                  const total = slot?.slots_total ?? 0;
                  if (total === 0) return null;
                  const used = slot?.slots_used ?? 0;
                  const available = total - used;
                  return (
                    <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ fontSize: '0.5625rem', color: 'var(--color-text-muted)', minWidth: '2rem', fontFamily: 'var(--font-mono)' }}>{ORDINAL[level]}</span>
                      <div style={{ display: 'flex', gap: '0.2rem', flex: 1, flexWrap: 'wrap' }}>
                        {Array.from({ length: total }).map((_, i) => (
                          <button key={i} className="btn btn--ghost" onClick={() => i < available ? useSlot(level) : restoreSlot(level)} style={{ padding: 0, minHeight: 'unset' }} title={i < available ? 'Utiliser' : 'Récupérer'}>
                            <SlotPip filled={i < available} />
                          </button>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', color: available > 0 ? 'var(--color-text-muted)' : 'var(--color-error)' }}>{available}/{total}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Liste sorts */}
          {combatSpells.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '0.75rem' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucun sort préparé</p>
            </div>
          ) : (
            <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
              <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
                Sorts disponibles ({combatSpells.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {combatSpells.map(spell => (
                  <SpellCombatCard key={spell.id} spell={spell} slots={slots}
                    onCast={slotLevel => castSpell(spell, slotLevel)}
                    onCastBuff={s => setBuffSpell(s)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ─── MODE EXPLORATION ─────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Slots */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GiMagicSwirl size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1rem' }}>Emplacements de sort</h3>
          </div>
          {!readOnly && totalSlots > 0 && <button className="btn btn--ghost" onClick={longRest} style={{ fontSize: '0.6875rem', color: 'var(--color-info)' }}>Repos long ↺</button>}
        </div>
        {totalSlots > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: usedSlots >= totalSlots ? 'var(--color-error)' : 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{totalSlots - usedSlots}/{totalSlots} disponibles</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {SLOT_LEVELS.map(level => {
            const slot = slots.find(s => s.slot_level === level);
            const total = slot?.slots_total ?? 0;
            const used  = slot?.slots_used  ?? 0;
            const available = total - used;
            return (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', minWidth: '2.5rem', fontFamily: 'var(--font-mono)' }}>{ORDINAL[level]}</span>
                {total > 0 && (
                  <div style={{ display: 'flex', gap: '0.25rem', flex: 1, flexWrap: 'wrap' }}>
                    {Array.from({ length: total }).map((_, i) => (
                      <button key={i} className="btn btn--ghost" onClick={() => !readOnly && (i < available ? useSlot(level) : restoreSlot(level))} disabled={readOnly} style={{ padding: 0, minHeight: 'unset', cursor: readOnly ? 'default' : 'pointer' }}>
                        <SlotPip filled={i < available} />
                      </button>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: 'auto', flexShrink: 0 }}>
                    <button className="btn btn--ghost" onClick={() => upsertSlotTotal(level, total - 1)} disabled={total === 0} style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', minHeight: 'unset', lineHeight: 1 }}>−</button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', minWidth: '1rem', textAlign: 'center' }}>{total}</span>
                    <button className="btn btn--ghost" onClick={() => upsertSlotTotal(level, total + 1)} style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', minHeight: 'unset', lineHeight: 1 }}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sorts */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GiSpellBook size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1rem' }}>Sorts ({spells.length})</h3>
          </div>
          {!readOnly && <button className="btn btn--ghost" onClick={() => setShowForm(x => !x)} style={{ fontSize: '0.75rem' }}>{showForm ? 'Annuler' : '+ Sort'}</button>}
        </div>

        {/* Formulaire */}
        {showForm && !readOnly && (
          <div className="animate-fade-in" style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input" placeholder="Nom du sort *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 2 }} />
              <select className="input" value={form.level} onChange={e => setForm(f => ({ ...f, level: parseInt(e.target.value) }))} style={{ flex: 1 }}>
                <option value={0}>Cantrip</option>
                {SLOT_LEVELS.map(l => <option key={l} value={l}>Niv. {l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="input" value={form.casting_time} onChange={e => setForm(f => ({ ...f, casting_time: e.target.value }))} style={{ flex: 1 }}>
                {CASTING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input" placeholder="Portée" value={form.range} onChange={e => setForm(f => ({ ...f, range: e.target.value }))} style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input" placeholder="Durée" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} style={{ flex: 1 }} />
              <input className="input" placeholder="Dés (ex: 2d6)" value={form.damage_dice} onChange={e => setForm(f => ({ ...f, damage_dice: e.target.value }))} style={{ flex: 1, fontFamily: 'var(--font-mono)' }} />
            </div>

            {/* Section buff */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
              <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'var(--color-info)', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>Sort de buff (optionnel)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                <div>
                  <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.1rem' }}><GiShield size={10} /> Bonus CA</label>
                  <input className="input" type="number" value={form.buff_ca ?? ''} placeholder="0" onChange={e => setForm(f => ({ ...f, buff_ca: parseInt(e.target.value) || null as any }))} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.1rem' }}><GiHearts size={10} /> PV temporaires</label>
                  <input className="input" type="number" value={form.buff_hp_temp ?? ''} placeholder="0" onChange={e => setForm(f => ({ ...f, buff_hp_temp: parseInt(e.target.value) || null as any }))} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.1rem' }}>Durée (rounds, vide=manuel)</label>
                  <input className="input" type="number" min={1} value={form.buff_duration_rounds ?? ''} placeholder="Manuel" onChange={e => setForm(f => ({ ...f, buff_duration_rounds: parseInt(e.target.value) || null as any }))} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.1rem' }}>Nb cibles max</label>
                  <input className="input" type="number" min={1} value={form.buff_target_count ?? 1} onChange={e => setForm(f => ({ ...f, buff_target_count: parseInt(e.target.value) || 1 }))} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
            </div>

            <textarea className="input" placeholder="Description..." rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'none' }} />
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.concentration} onChange={e => setForm(f => ({ ...f, concentration: e.target.checked }))} />
                <GiConcentrationOrb size={14} style={{ color: 'var(--color-warning)' }} /> Concentration
              </label>
              {form.level > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_prepared} onChange={e => setForm(f => ({ ...f, is_prepared: e.target.checked }))} />
                  <GiCrystalBall size={14} style={{ color: 'var(--color-accent)' }} /> Préparé
                </label>
              )}
              <button className="btn btn--primary" onClick={addSpell} disabled={saving || !form.name.trim()} style={{ marginLeft: 'auto', fontSize: '0.8125rem' }}>{saving ? '...' : 'Ajouter'}</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', padding: '0.25rem' }}>
          {([
            { key: 'cantrips', label: 'Cantrips', count: cantrips.length, icon: GiFireSpellCast },
            { key: 'prepared', label: 'Préparés', count: prepared.length, icon: GiCrystalBall  },
            { key: 'known',    label: 'Connus',   count: known.length,    icon: GiScrollUnfurled },
          ] as const).map(({ key, label, count, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.375rem 0.25rem', borderRadius: 'calc(var(--button-radius) - 2px)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', backgroundColor: activeTab === key ? 'var(--color-surface)' : 'transparent', color: activeTab === key ? 'var(--color-accent)' : 'var(--color-text-muted)', boxShadow: activeTab === key ? 'var(--card-shadow)' : 'none', transition: 'all 0.15s', minHeight: '2rem' }}>
              <Icon size={13} /> {label}
              <span style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', backgroundColor: activeTab === key ? 'var(--color-accent)' : 'var(--color-border)', color: activeTab === key ? 'var(--color-accent-text)' : 'var(--color-text-muted)', padding: '0.1rem 0.35rem', borderRadius: '999px' }}>{count}</span>
            </button>
          ))}
        </div>

        {activeTab === 'cantrips' && <SpellList spells={cantrips} emptyMsg="Aucun cantrip."          readOnly={readOnly} onTogglePrepared={togglePrepared} onDelete={deleteSpell} />}
        {activeTab === 'prepared' && <SpellList spells={prepared} emptyMsg="Prépare des sorts."      readOnly={readOnly} onTogglePrepared={togglePrepared} onDelete={deleteSpell} />}
        {activeTab === 'known'    && <SpellList spells={known}    emptyMsg="Aucun sort connu."        readOnly={readOnly} onTogglePrepared={togglePrepared} onDelete={deleteSpell} />}
      </div>
    </div>
  );
}

function SpellList({ spells, emptyMsg, readOnly, onTogglePrepared, onDelete }: { spells: Spell[]; emptyMsg: string; readOnly?: boolean; onTogglePrepared: (s: Spell) => void; onDelete: (id: string) => void; }) {
  if (spells.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '0.75rem 0' }}>{emptyMsg}</p>;
  const byLevel: Record<number, Spell[]> = {};
  for (const s of spells) { if (!byLevel[s.level]) byLevel[s.level] = []; byLevel[s.level].push(s); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {Object.entries(byLevel).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([lvl, group]) => (
        <div key={lvl}>
          {spells.some(s => s.level > 0) && (
            <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GiDiceSixFacesSix size={10} />{parseInt(lvl) === 0 ? 'Cantrips' : `Niveau ${lvl}`}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {group.map(spell => <SpellCard key={spell.id} spell={spell} readOnly={readOnly} onTogglePrepared={() => onTogglePrepared(spell)} onDelete={() => onDelete(spell.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}