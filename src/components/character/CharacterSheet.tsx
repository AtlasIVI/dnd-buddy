import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Tables, Enums } from '../../types/database';
import {
  GiHearts, GiShield, GiLeatherBoot, GiBroadsword,
  GiMuscleUp, GiRunningNinja, GiBrain, GiPrayer, GiChatBubble,
  GiSparkles, GiScrollUnfurled, GiQuillInk, GiCrossedSwords,
  GiMagicSwirl, GiBackpack,
} from 'react-icons/gi';
import SpellsPanel from './SpellsPanel';
import SkillsList  from './SkillsPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CharacterSheetProps {
  campaignId: string;
  readOnly?: boolean;
  characterId?: string;
  inCombat?: boolean;
}

type SkillAbility = Enums<'skill_ability'>

const ABILITIES: { key: string; label: string; abilityKey: SkillAbility; icon: React.ComponentType<any> }[] = [
  { key: 'str', label: 'FOR', abilityKey: 'STR', icon: GiMuscleUp    },
  { key: 'dex', label: 'DEX', abilityKey: 'DEX', icon: GiRunningNinja },
  { key: 'con', label: 'CON', abilityKey: 'CON', icon: GiShield       },
  { key: 'int', label: 'INT', abilityKey: 'INT', icon: GiBrain        },
  { key: 'wis', label: 'SAG', abilityKey: 'WIS', icon: GiPrayer       },
  { key: 'cha', label: 'CHA', abilityKey: 'CHA', icon: GiChatBubble   },
];

function modStr(v: number) { const m = Math.floor((v - 10) / 2); return m >= 0 ? `+${m}` : `${m}`; }

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CharacterSheet({ campaignId, readOnly, characterId, inCombat }: CharacterSheetProps) {
  const { user } = useAuth();
  const [char,          setChar]          = useState<Tables<'characters'> | null>(null);
  const [effects,       setEffects]       = useState<Tables<'effects'>[]>([]);
  const [passiveSkills, setPassiveSkills] = useState<Tables<'skills'>[]>([]);
  const [equippedItems, setEquippedItems] = useState<Tables<'inventory_items'>[]>([]);
  const [activeBuffs,   setActiveBuffs]   = useState<Tables<'active_buffs'>[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [newEffect,     setNewEffect]     = useState({ name: '', description: '', source: '', is_positive: true });
  const [showEffectForm, setShowEffectForm] = useState(false);
  const [localChar,     setLocalChar]     = useState<Tables<'characters'> | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchChar = useCallback(async () => {
    if (characterId) {
      const { data } = await supabase.from('characters').select('*').eq('id', characterId).single();
      if (data) { setChar(data); setLocalChar(data); }
    } else if (user) {
      const { data } = await supabase.from('characters').select('*').eq('campaign_id', campaignId).eq('user_id', user.id).single();
      if (data) { setChar(data); setLocalChar(data); }
    }
    setLoading(false);
  }, [campaignId, user, characterId]);

  const fetchEffects = useCallback(async (cid: string) => {
    const { data } = await supabase.from('effects').select('*').eq('character_id', cid).order('created_at');
    if (data) setEffects(data);
  }, []);

  const fetchPassiveSkillBonuses = useCallback(async (cid: string) => {
    const { data } = await supabase.from('skills').select('stat_bonus_ability, stat_bonus_value, name')
      .eq('character_id', cid).eq('is_active', false)
      .not('stat_bonus_ability', 'is', null).not('stat_bonus_value', 'is', null);
    if (data) setPassiveSkills(data as Tables<'skills'>[]);
  }, []);

  // Items équipés avec buffs
  const fetchEquippedItems = useCallback(async (cid: string) => {
    const { data } = await supabase.from('inventory_items').select('*')
      .eq('character_id', cid).eq('is_equipped', true);
    if (data) setEquippedItems(data);
  }, []);

  // Buffs temporaires actifs
  const fetchActiveBuffs = useCallback(async (cid: string) => {
    const { data } = await supabase.from('active_buffs').select('*')
      .eq('character_id', cid).eq('is_active', true);
    if (data) setActiveBuffs(data);
  }, []);

  useEffect(() => { fetchChar(); }, [fetchChar]);
  useEffect(() => {
    if (char) {
      fetchEffects(char.id);
      fetchPassiveSkillBonuses(char.id);
      fetchEquippedItems(char.id);
      fetchActiveBuffs(char.id);
    }
  }, [char?.id]);

  useEffect(() => {
    if (!char) return;
    const ch = supabase.channel('char-sheet-' + char.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters',      filter: 'id=eq.' + char.id }, (p: any) => {
        if (readOnly && p.new) { setChar(p.new); setLocalChar(p.new); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'effects',         filter: 'character_id=eq.' + char.id }, () => fetchEffects(char.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skills',          filter: 'character_id=eq.' + char.id }, () => fetchPassiveSkillBonuses(char.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: 'character_id=eq.' + char.id }, () => fetchEquippedItems(char.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_buffs',    filter: 'character_id=eq.' + char.id }, () => fetchActiveBuffs(char.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [char?.id, readOnly]);

  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout); }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function createCharacter() {
    if (!user) return; setSaving(true);
    const { data } = await supabase.from('characters').insert({ campaign_id: campaignId, user_id: user.id, name: 'Nouveau Personnage' }).select().single();
    if (data) { setChar(data); setLocalChar(data); }
    setSaving(false);
  }

  function updateField(field: string, value: any) {
    if (!localChar || readOnly) return;
    setLocalChar(prev => prev ? { ...prev, [field]: value } : prev);
    if (saveTimers.current[field]) clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      setSaving(true);
      await supabase.from('characters').update({ [field]: value }).eq('id', localChar.id);
      setChar(prev => prev ? { ...prev, [field]: value } : prev);
      setSaving(false);
    }, 600);
  }

  async function addEffect() {
    if (!char || !newEffect.name.trim()) return;
    await supabase.from('effects').insert({ character_id: char.id, ...newEffect });
    setNewEffect({ name: '', description: '', source: '', is_positive: true });
    setShowEffectForm(false);
    fetchEffects(char.id);
  }

  async function removeEffect(id: string) {
    await supabase.from('effects').delete().eq('id', id);
    setEffects(e => e.filter(x => x.id !== id));
  }

  async function deactivateBuff(id: string) {
    await supabase.from('active_buffs').update({ is_active: false }).eq('id', id);
    setActiveBuffs(b => b.filter(x => x.id !== id));
  }

  // ── Calcul des bonus agrégés ───────────────────────────────────────────────

  /** Bonus stat : passive skills + items équipés + active_buffs */
  function totalStatBonus(abilityKey: SkillAbility): number {
    const fromSkills = passiveSkills
      .filter(s => s.stat_bonus_ability === abilityKey)
      .reduce((sum, s) => sum + (s.stat_bonus_value ?? 0), 0);
    const fromItems = equippedItems
      .filter(i => i.bonus_stat_ability === abilityKey)
      .reduce((sum, i) => sum + (i.bonus_stat_value ?? 0), 0);
    const fromBuffs = activeBuffs
      .filter(b => b.bonus_stat_ability === abilityKey)
      .reduce((sum, b) => sum + (b.bonus_stat_value ?? 0), 0);
    return fromSkills + fromItems + fromBuffs;
  }

  /** Sources lisibles pour tooltip */
  function statBonusSources(abilityKey: SkillAbility): string {
    const parts: string[] = [];
    passiveSkills.filter(s => s.stat_bonus_ability === abilityKey && s.stat_bonus_value)
      .forEach(s => parts.push(`${s.name} (${s.stat_bonus_value! >= 0 ? '+' : ''}${s.stat_bonus_value})`));
    equippedItems.filter(i => i.bonus_stat_ability === abilityKey && i.bonus_stat_value)
      .forEach(i => parts.push(`${i.name} (${i.bonus_stat_value! >= 0 ? '+' : ''}${i.bonus_stat_value})`));
    activeBuffs.filter(b => b.bonus_stat_ability === abilityKey && b.bonus_stat_value)
      .forEach(b => parts.push(`${b.source_name} (${b.bonus_stat_value! >= 0 ? '+' : ''}${b.bonus_stat_value}) [temporaire]`));
    return parts.join(', ');
  }

  /** Bonus CA total : items équipés + active_buffs */
  function totalCaBonus(): number {
    return equippedItems.reduce((sum, i) => sum + (i.bonus_ca ?? 0), 0)
         + activeBuffs.reduce((sum, b) => sum + (b.bonus_ca ?? 0), 0);
  }

  /** Bonus PV max total : items équipés */
  function totalHpMaxBonus(): number {
    return equippedItems.reduce((sum, i) => sum + (i.bonus_hp_max ?? 0), 0);
  }

  /** PV temporaires : active_buffs */
  function totalHpTemp(): number {
    return activeBuffs.reduce((sum, b) => sum + (b.bonus_hp_temp ?? 0), 0);
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;
  if (!localChar) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <GiBroadsword size={32} style={{ color: 'var(--color-accent)', marginBottom: '0.75rem' }} />
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Pas encore de personnage</p>
        <button className="btn btn--primary" onClick={createCharacter} disabled={saving}>{saving ? '...' : 'Créer mon personnage'}</button>
      </div>
    );
  }

  const charStatsForSkills = { str: localChar.str, dex: localChar.dex, con: localChar.con, int: localChar.int, wis: localChar.wis, cha: localChar.cha, level: localChar.level };
  const caBonus    = totalCaBonus();
  const hpMaxBonus = totalHpMaxBonus();
  const hpTemp     = totalHpTemp();
  const effectiveHpMax = localChar.hp_max + hpMaxBonus;
  const effectiveCa    = localChar.armor_class + caBonus;

  // Items équipés avec capacité active
  const equippedWithActive = equippedItems.filter(i => !!i.active_name);

  const sharedProps = {
    localChar, effects, activeBuffs, saving, readOnly, inCombat,
    newEffect, showEffectForm, caBonus, hpMaxBonus, hpTemp,
    effectiveHpMax, effectiveCa,
    setNewEffect, setShowEffectForm, updateField, addEffect, removeEffect, deactivateBuff,
    totalStatBonus, statBonusSources,
  };

  if (inCombat) {
    return (
      <div className="combat-sheet-grid">
        <div className="combat-sheet-left">
          <SheetLeft {...sharedProps} />
        </div>
        <div className="combat-sheet-right">
          {/* Bandeau combat */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', backgroundColor: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.25)', borderRadius: 'var(--button-radius)', fontSize: '0.6875rem', color: 'var(--color-error)', fontWeight: 600 }}>
            <GiCrossedSwords size={13} /> Mode Combat — Actions disponibles
          </div>

          {/* 3 sections côte à côte sur grand écran */}
          <div className="combat-actions-grid">
            {char && (
              <div>
                <SkillsList characterId={char.id} canEdit={false} charStats={charStatsForSkills} />
              </div>
            )}
            {char && (
              <div>
                <SpellsPanel characterId={char.id} readOnly={false} combatMode={true} charId={char.id} />
              </div>
            )}
            {equippedWithActive.length > 0 && char && (
              <div>
                <EquipmentPowers items={equippedWithActive} characterId={char.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <SheetLeft {...sharedProps} />
    </div>
  );
}

// ─── Section Pouvoirs d'équipement (colonne droite combat) ────────────────────

function EquipmentPowers({ items, characterId }: { items: Tables<'inventory_items'>[]; characterId: string }) {
  async function useAbility(item: Tables<'inventory_items'>) {
    if (item.active_uses_remaining !== null && item.active_uses_remaining <= 0) return;
    const remaining = (item.active_uses_remaining ?? 1) - 1;
    await supabase.from('inventory_items').update({ active_uses_remaining: remaining }).eq('id', item.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
          <GiBackpack size={16} style={{ color: 'var(--color-warning)' }} />
          <h3 style={{ fontSize: '0.9375rem' }}>Pouvoirs d'équipement</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {items.map(item => {
            const hasCharges  = item.active_uses_max !== null;
            const remaining   = item.active_uses_remaining ?? item.active_uses_max ?? 0;
            const canUse      = !hasCharges || remaining > 0;
            return (
              <div key={item.id} style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', padding: '0.4rem 0.5rem', borderLeft: `3px solid var(--color-warning)`, opacity: canUse ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, flex: 1 }}>
                    <GiMagicSwirl size={11} style={{ color: 'var(--color-warning)', marginRight: '0.2rem' }} />
                    {item.active_name}
                  </span>
                  {/* Pips charges */}
                  {hasCharges && (
                    <div style={{ display: 'flex', gap: '0.15rem' }}>
                      {Array.from({ length: Math.min(item.active_uses_max!, 8) }).map((_, i) => (
                        <div key={i} style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', border: '1.5px solid var(--color-warning)', backgroundColor: i < remaining ? 'var(--color-warning)' : 'transparent' }} />
                      ))}
                      {item.active_uses_max! > 8 && <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{remaining}/{item.active_uses_max}</span>}
                    </div>
                  )}
                  <button className="btn btn--primary" onClick={() => useAbility(item)} disabled={!canUse}
                    style={{ fontSize: '0.5625rem', padding: '0.175rem 0.4rem', minHeight: 'unset', backgroundColor: 'var(--color-warning)', whiteSpace: 'nowrap' }}>
                    <GiBroadsword size={10} /> {canUse ? 'Utiliser' : 'Épuisé'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.5625rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                  <span>⚡ {item.active_casting_time}</span>
                  {item.active_damage_dice && <span style={{ color: 'var(--color-error)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{item.active_damage_dice}</span>}
                  {hasCharges && <span>{remaining}/{item.active_uses_max} — {item.active_rest_reset === 'short' ? 'repos court' : 'repos long'}</span>}
                  <span style={{ color: 'var(--color-text-muted)' }}>({item.name})</span>
                </div>
                {item.active_description && (
                  <p style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem', lineHeight: 1.4 }}>{item.active_description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Panneau gauche ───────────────────────────────────────────────────────────

type SheetLeftProps = {
  localChar: Tables<'characters'>; effects: Tables<'effects'>[]
  activeBuffs: Tables<'active_buffs'>[]
  saving: boolean; readOnly?: boolean; inCombat?: boolean
  newEffect: { name: string; description: string; source: string; is_positive: boolean }
  showEffectForm: boolean
  caBonus: number; hpMaxBonus: number; hpTemp: number
  effectiveHpMax: number; effectiveCa: number
  setNewEffect: (v: any) => void; setShowEffectForm: (v: boolean) => void
  updateField: (f: string, v: any) => void
  addEffect: () => void; removeEffect: (id: string) => void
  deactivateBuff: (id: string) => void
  totalStatBonus: (ab: SkillAbility) => number
  statBonusSources: (ab: SkillAbility) => string
}

function SheetLeft({ localChar, effects, activeBuffs, saving, readOnly, inCombat, newEffect, showEffectForm, caBonus, hpMaxBonus, hpTemp, effectiveHpMax, effectiveCa, setNewEffect, setShowEffectForm, updateField, addEffect, removeEffect, deactivateBuff, totalStatBonus, statBonusSources }: SheetLeftProps) {
  const hpPct   = effectiveHpMax > 0 ? Math.round((localChar.hp_current / effectiveHpMax) * 100) : 0;
  const hpColor = hpPct > 60 ? 'var(--color-hp)' : hpPct > 30 ? 'var(--color-warning)' : 'var(--color-error)';

  return (
    <>
      {/* ── Identité (masquée en combat) ── */}
      {!inCombat && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <GiScrollUnfurled size={18} style={{ color: 'var(--color-accent)' }} />
            <h2 style={{ fontSize: '1.125rem' }}>Identité</h2>
            {saving && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>sauvegarde...</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input className="input" value={localChar.name} onChange={e => updateField('name', e.target.value)} placeholder="Nom" readOnly={readOnly} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input" value={localChar.race}  onChange={e => updateField('race',  e.target.value)} placeholder="Race"   style={{ flex: 1 }} readOnly={readOnly} />
              <input className="input" value={localChar.class} onChange={e => updateField('class', e.target.value)} placeholder="Classe" style={{ flex: 1 }} readOnly={readOnly} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <GiSparkles size={14} style={{ color: 'var(--color-xp)' }} />
                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Niv.</label>
                <input className="input" type="number" inputMode="numeric" min={1} max={20} value={localChar.level} onChange={e => updateField('level', parseInt(e.target.value) || 1)} style={{ width: '4rem', textAlign: 'center' }} readOnly={readOnly} />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <GiSparkles size={14} style={{ color: 'var(--color-xp)' }} />
                <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>XP</label>
                <input className="input" type="number" inputMode="numeric" min={0} value={localChar.xp} onChange={e => updateField('xp', parseInt(e.target.value) || 0)} style={{ flex: 1, textAlign: 'center' }} readOnly={readOnly} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* En combat : bandeau identité compact */}
      {inCombat && (
        <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{localChar.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{localChar.class} niv.{localChar.level}</span>
            {saving && <span style={{ fontSize: '0.5rem', color: 'var(--color-text-muted)' }}>💾</span>}
          </div>
        </div>
      )}

      {/* ── PV ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <GiHearts size={18} style={{ color: hpColor }} />
          <h3 style={{ fontSize: '1rem' }}>PV</h3>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: hpColor, fontWeight: 700 }}>{hpPct}%</span>
          {/* Badge PV bonus items */}
          {hpMaxBonus !== 0 && (
            <span style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'white', backgroundColor: hpMaxBonus > 0 ? 'var(--color-success)' : 'var(--color-error)', padding: '0.1rem 0.35rem', borderRadius: '999px' }}>
              <GiBackpack size={8} /> PV max {hpMaxBonus > 0 ? `+${hpMaxBonus}` : hpMaxBonus}
            </span>
          )}
          {hpTemp > 0 && (
            <span style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'white', backgroundColor: 'var(--color-info)', padding: '0.1rem 0.35rem', borderRadius: '999px' }}>
              ✨ +{hpTemp} temp
            </span>
          )}
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', justifyContent: 'center' }}>
            {[-10, -5, -1].map(d => (
              <button key={d} className="btn btn--danger" style={{ flex: 1, fontSize: '0.875rem', padding: '0.5rem', fontWeight: 700 }}
                onClick={() => updateField('hp_current', Math.max(0, localChar.hp_current + d))}>{d}</button>
            ))}
            {[1, 5, 10].map(d => (
              <button key={d} className="btn btn--primary" style={{ flex: 1, fontSize: '0.875rem', padding: '0.5rem', fontWeight: 700, backgroundColor: 'var(--color-success)' }}
                onClick={() => updateField('hp_current', Math.min(effectiveHpMax, localChar.hp_current + d))}>+{d}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
          <input className="input" type="number" inputMode="numeric" min={0}
            value={localChar.hp_current} onChange={e => updateField('hp_current', Math.max(0, parseInt(e.target.value) || 0))}
            style={{ width: '4rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color: hpColor }} readOnly={readOnly} />
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          {/* PV max = base + bonus items */}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 700, color: hpMaxBonus !== 0 ? (hpMaxBonus > 0 ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-text-primary)' }}>
            {effectiveHpMax}
          </span>
          {hpMaxBonus !== 0 && (
            <span style={{ fontSize: '0.5625rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              (base {localChar.hp_max})
            </span>
          )}
          {!readOnly && (
            <button className="btn btn--ghost" style={{ fontSize: '0.6875rem', marginLeft: 'auto' }}
              onClick={() => updateField('hp_current', effectiveHpMax)}>↺ Full</button>
          )}
        </div>
        <div className="hp-bar hp-bar--large">
          <div className="hp-bar__fill" style={{ width: `${Math.min(100, hpPct)}%`, backgroundColor: hpColor, transition: 'width 0.4s ease, background-color 0.4s ease' }} />
        </div>

        {/* CA + Vitesse */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.625rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <GiShield size={14} style={{ color: caBonus !== 0 ? (caBonus > 0 ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-armor-class)' }} />
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>CA</label>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: caBonus !== 0 ? (caBonus > 0 ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-text-primary)' }}>
              {effectiveCa}
            </span>
            {caBonus !== 0 && (
              <span style={{ fontSize: '0.5rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                (base {localChar.armor_class})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <GiLeatherBoot size={14} style={{ color: 'var(--color-info)' }} />
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Vit.</label>
            <input className="input" type="number" inputMode="numeric" min={0}
              value={localChar.speed} onChange={e => updateField('speed', parseInt(e.target.value) || 0)}
              style={{ width: '3.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }} readOnly={readOnly} />
          </div>
        </div>
      </div>

      {/* ── Caractéristiques ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
          <GiMuscleUp size={18} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '1rem' }}>Caractéristiques</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.375rem' }}>
          {ABILITIES.map(({ key, label, abilityKey, icon: Icon }) => {
            const baseVal      = (localChar as any)[key] as number;
            const bonus        = totalStatBonus(abilityKey);
            const effectiveVal = baseVal + bonus;
            const hasBonus     = bonus !== 0;
            const bonusColor   = bonus > 0 ? 'var(--color-success)' : 'var(--color-error)';

            return (
              <div key={key}
                title={hasBonus ? `Bonus : ${statBonusSources(abilityKey)}` : undefined}
                className="stat-block"
                style={{ backgroundColor: hasBonus ? (bonus > 0 ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)') : 'var(--color-background-alt)', border: hasBonus ? `1px solid ${bonusColor}` : '1px solid transparent', borderRadius: 'var(--button-radius)', padding: '0.4rem 0.25rem', gap: '0.1rem', position: 'relative', transition: 'background-color 0.3s' }}>
                <Icon size={12} style={{ color: hasBonus ? bonusColor : 'var(--color-text-muted)' }} />
                <span className="stat-block__label" style={{ color: hasBonus ? bonusColor : undefined, fontSize: '0.5625rem' }}>{label}</span>
                {!readOnly ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.05rem' }}>
                    <button className="btn btn--ghost" onClick={() => updateField(key, Math.max(1, baseVal - 1))} style={{ padding: '0.1rem 0.2rem', minHeight: 'unset', fontSize: '0.7rem', lineHeight: 1 }}>−</button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, minWidth: '1.5rem', textAlign: 'center', color: hasBonus ? bonusColor : 'var(--color-text-primary)' }}>{effectiveVal}</span>
                    <button className="btn btn--ghost" onClick={() => updateField(key, Math.min(30, baseVal + 1))} style={{ padding: '0.1rem 0.2rem', minHeight: 'unset', fontSize: '0.7rem', lineHeight: 1 }}>+</button>
                  </div>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: hasBonus ? bonusColor : 'var(--color-text-primary)' }}>{effectiveVal}</span>
                )}
                <span style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: hasBonus ? bonusColor : 'var(--color-accent)' }}>{modStr(effectiveVal)}</span>
                {hasBonus && <span style={{ position: 'absolute', top: '0.15rem', right: '0.2rem', fontSize: '0.45rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', lineHeight: 1 }}>base {baseVal}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Effets + Buffs actifs ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GiSparkles size={16} style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ fontSize: '0.9375rem' }}>Effets ({effects.length + activeBuffs.length})</h3>
          </div>
          {!readOnly && (
            <button className="btn btn--ghost" onClick={() => setShowEffectForm(!showEffectForm)} style={{ fontSize: '0.75rem' }}>
              {showEffectForm ? 'Annuler' : '+ Effet'}
            </button>
          )}
        </div>

        {/* Formulaire effet */}
        {showEffectForm && !readOnly && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.625rem', padding: '0.5rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)' }}>
            <input className="input" placeholder="Nom de l'effet" value={newEffect.name} onChange={e => setNewEffect({ ...newEffect, name: e.target.value })} />
            <input className="input" placeholder="Description" value={newEffect.description} onChange={e => setNewEffect({ ...newEffect, description: e.target.value })} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input" placeholder="Source" value={newEffect.source} onChange={e => setNewEffect({ ...newEffect, source: e.target.value })} style={{ flex: 1 }} />
              <button className={newEffect.is_positive ? 'btn btn--primary' : 'btn btn--danger'} onClick={() => setNewEffect({ ...newEffect, is_positive: !newEffect.is_positive })} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {newEffect.is_positive ? '✨ Positif' : '💀 Négatif'}
              </button>
            </div>
            <button className="btn btn--primary" onClick={addEffect} disabled={!newEffect.name.trim()}>Ajouter</button>
          </div>
        )}

        {/* Buffs temporaires actifs (sorts) */}
        {activeBuffs.map(b => (
          <div key={b.id} className="animate-pop-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', marginBottom: '0.25rem', backgroundColor: 'rgba(52,152,219,0.08)', borderRadius: 'var(--button-radius)', borderLeft: '3px solid var(--color-info)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>✨ {b.source_name}</span>
                {b.expires_at_round !== null && (
                  <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--color-info)', color: 'white', padding: '0.1rem 0.3rem', borderRadius: '999px' }}>
                    jusqu'au round {b.expires_at_round}
                  </span>
                )}
                {b.bonus_ca !== 0 && b.bonus_ca && <span style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)' }}>CA {b.bonus_ca > 0 ? `+${b.bonus_ca}` : b.bonus_ca}</span>}
                {b.bonus_hp_temp !== 0 && b.bonus_hp_temp && <span style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)' }}>+{b.bonus_hp_temp} PV temp</span>}
              </div>
            </div>
            <button className="btn btn--ghost" onClick={() => deactivateBuff(b.id)} style={{ fontSize: '0.625rem', color: 'var(--color-info)', padding: '0.25rem 0.5rem' }}>✕</button>
          </div>
        ))}

        {/* Effets normaux */}
        {effects.length === 0 && activeBuffs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucun effet actif</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {effects.map(e => (
              <div key={e.id} className="animate-pop-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.5rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', borderLeft: `3px solid ${e.is_positive ? 'var(--color-success)' : 'var(--color-error)'}` }}>
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{e.name}</span>
                  {e.description && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{e.description}</span>}
                  {e.source && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block' }}>Source: {e.source}</span>}
                </div>
                {!readOnly && <button className="btn btn--ghost" onClick={() => removeEffect(e.id)} style={{ fontSize: '0.75rem', color: 'var(--color-error)', padding: '0.25rem 0.5rem' }}>✕</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notes (masquées en combat) ── */}
      {!inCombat && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <GiQuillInk size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1rem' }}>Notes</h3>
          </div>
          <textarea className="input" rows={4} value={localChar.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Notes personnelles..." readOnly={readOnly} style={{ resize: 'vertical' }} />
        </div>
      )}
    </>
  );
}