import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Tables, Enums } from '../../types/database';
import {
  GiBackpack, GiEyeTarget, GiShield, GiMuscleUp, GiHearts,
  GiSparkles, GiBroadsword, GiRunningNinja, GiBrain, GiPrayer, GiChatBubble,
  GiCrossedSwords, GiMagicSwirl,
} from 'react-icons/gi';

type SkillAbility = Enums<'skill_ability'>

interface InventoryProps {
  characterId: string;
  canEdit: boolean;
  inCombat?: boolean;
}

// Mapping ability → label + icon
const ABILITY_META: Record<SkillAbility, { label: string; icon: React.ComponentType<any> }> = {
  STR: { label: 'FOR', icon: GiMuscleUp    },
  DEX: { label: 'DEX', icon: GiRunningNinja },
  CON: { label: 'CON', icon: GiShield       },
  INT: { label: 'INT', icon: GiBrain        },
  WIS: { label: 'SAG', icon: GiPrayer       },
  CHA: { label: 'CHA', icon: GiChatBubble   },
};

const ABILITIES: SkillAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ACTION_COSTS = ['1 action', '1 action bonus', '1 réaction', 'Gratuit'];
const REST_TYPES = [
  { value: 'short', label: 'Repos court' },
  { value: 'long',  label: 'Repos long'  },
];

type Item = Tables<'inventory_items'>;

// Valeur par défaut d'un nouvel item
function emptyItem(characterId: string): Omit<Item, 'id' | 'created_at'> {
  return {
    character_id: characterId,
    name: '', description: '', quantity: 1,
    is_equipped: false, is_hidden: false, sort_order: 0,
    bonus_ca: 0, bonus_hp_max: 0,
    bonus_stat_ability: null as any, bonus_stat_value: 0,
    active_name: '', active_description: '',
    active_casting_time: '1 action', active_damage_dice: '',
    active_uses_max: null as any, active_uses_remaining: null as any,
    active_rest_reset: 'short',
  };
}

// Badge buff compact (comme SkillsPanel)
function BuffBadge({ label, value, color }: { label: string; value: number; color: string }) {
  if (!value) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
      fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
      color: 'white',
      backgroundColor: color,
      padding: '0.1rem 0.35rem', borderRadius: '999px',
    }}>
      {label} {value > 0 ? `+${value}` : value}
    </span>
  );
}

export default function InventoryPanel({ characterId, canEdit, inCombat }: InventoryProps) {
  const [items,    setItems]    = useState<Item[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<Omit<Item, 'id' | 'created_at'>>(emptyItem(characterId));
  const [saving,   setSaving]   = useState(false);
  // Quel item est en mode édition étendue
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from('inventory_items').select('*').eq('character_id', characterId).order('sort_order');
    if (data) setItems(data);
    setLoading(false);
  }, [characterId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    const ch = supabase.channel('inv-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: 'character_id=eq.' + characterId }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [characterId, fetchItems]);

  async function addItem() {
    if (!form.name.trim()) return;
    setSaving(true);
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    // Nettoyer les champs actifs si vides
    const clean = {
      ...form,
      sort_order: maxOrder,
      active_name: form.active_name?.trim() || null,
      active_description: form.active_description?.trim() || null,
      active_damage_dice: form.active_damage_dice?.trim() || null,
      active_uses_max: form.active_uses_max || null,
      active_uses_remaining: form.active_uses_max || null,
      bonus_stat_ability: form.bonus_stat_ability || null,
      bonus_stat_value: form.bonus_stat_ability ? form.bonus_stat_value : 0,
    };
    await supabase.from('inventory_items').insert(clean);
    setForm(emptyItem(characterId));
    setShowForm(false);
    setSaving(false);
    fetchItems();
  }

  async function removeItem(id: string) {
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function toggleEquipped(item: Item) {
    if (inCombat) return; // Désactivé en combat
    await supabase.from('inventory_items').update({ is_equipped: !item.is_equipped }).eq('id', item.id);
    fetchItems();
  }

  async function updateQuantity(item: Item, qty: number) {
    const newQty = Math.max(0, qty);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
    await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', item.id);
  }

  // Utiliser la capacité active d'un item (consomme une charge)
  async function useActiveAbility(item: Item) {
    if (!item.active_uses_remaining || item.active_uses_remaining <= 0) return;
    const remaining = item.active_uses_remaining - 1;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active_uses_remaining: remaining } : i));
    await supabase.from('inventory_items').update({ active_uses_remaining: remaining }).eq('id', item.id);
  }

  // Recharger les uses lors d'un repos
  async function resetActiveUses(item: Item) {
    if (!item.active_uses_max) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active_uses_remaining: i.active_uses_max } : i));
    await supabase.from('inventory_items').update({ active_uses_remaining: item.active_uses_max }).eq('id', item.id);
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  const equipped   = items.filter(i => i.is_equipped);
  const unequipped = items.filter(i => !i.is_equipped);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiBackpack size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Inventaire ({items.length})</h2>
        </div>
        {canEdit && !inCombat && (
          <button className="btn btn--ghost" onClick={() => setShowForm(!showForm)} style={{ fontSize: '0.75rem' }}>
            {showForm ? 'Annuler' : '+ Objet'}
          </button>
        )}
      </div>

      {/* ── Formulaire d'ajout ── */}
      {showForm && canEdit && !inCombat && (
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          {/* Nom + description */}
          <input className="input" placeholder="Nom de l'objet *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Description (optionnel)" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

          {/* Quantité + options */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Qte</label>
              <input className="input" type="number" min={0} value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(0, parseInt(e.target.value) || 0) }))}
                style={{ width: '4rem', textAlign: 'center' }} />
            </div>
            <button className={form.is_equipped ? 'btn btn--primary' : 'btn btn--ghost'}
              onClick={() => setForm(f => ({ ...f, is_equipped: !f.is_equipped }))} style={{ fontSize: '0.75rem' }}>
              <GiShield size={14} /> {form.is_equipped ? 'Équipé' : 'Non équipé'}
            </button>
            <button className={form.is_hidden ? 'btn btn--ghost' : 'btn btn--ghost'}
              onClick={() => setForm(f => ({ ...f, is_hidden: !f.is_hidden }))} style={{ fontSize: '0.75rem', color: form.is_hidden ? 'var(--color-warning)' : undefined }}>
              <GiEyeTarget size={14} /> {form.is_hidden ? 'Caché' : 'Visible'}
            </button>
          </div>

          {/* ── Buffs passifs ── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
            <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
              Buffs passifs (quand équipé)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem' }}>
              <div>
                <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}><GiShield size={10} /> CA</label>
                <input className="input" type="number" value={form.bonus_ca ?? 0}
                  onChange={e => setForm(f => ({ ...f, bonus_ca: parseInt(e.target.value) || 0 }))}
                  style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}><GiHearts size={10} /> PV max</label>
                <input className="input" type="number" value={form.bonus_hp_max ?? 0}
                  onChange={e => setForm(f => ({ ...f, bonus_hp_max: parseInt(e.target.value) || 0 }))}
                  style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}>Stat</label>
                <select className="input" value={form.bonus_stat_ability ?? ''}
                  onChange={e => setForm(f => ({ ...f, bonus_stat_ability: e.target.value as SkillAbility || null as any }))}>
                  <option value="">Aucune</option>
                  {ABILITIES.map(a => <option key={a} value={a}>{ABILITY_META[a].label}</option>)}
                </select>
              </div>
              {form.bonus_stat_ability && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}>
                    Valeur bonus {ABILITY_META[form.bonus_stat_ability].label}
                  </label>
                  <input className="input" type="number" value={form.bonus_stat_value ?? 0}
                    onChange={e => setForm(f => ({ ...f, bonus_stat_value: parseInt(e.target.value) || 0 }))}
                    style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
                </div>
              )}
            </div>
          </div>

          {/* ── Capacité active ── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
            <p style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
              Capacité active (optionnel)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <input className="input" placeholder="Nom de la capacité (ex: Boule de feu)"
                value={form.active_name ?? ''}
                onChange={e => setForm(f => ({ ...f, active_name: e.target.value }))} />
              {form.active_name?.trim() && (
                <>
                  <input className="input" placeholder="Description"
                    value={form.active_description ?? ''}
                    onChange={e => setForm(f => ({ ...f, active_description: e.target.value }))} />
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <select className="input" value={form.active_casting_time ?? '1 action'}
                      onChange={e => setForm(f => ({ ...f, active_casting_time: e.target.value }))} style={{ flex: 1 }}>
                      {ACTION_COSTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className="input" placeholder="Dés (ex: 8d6)"
                      value={form.active_damage_dice ?? ''}
                      onChange={e => setForm(f => ({ ...f, active_damage_dice: e.target.value }))}
                      style={{ flex: 1, fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}>Utilisations max</label>
                      <input className="input" type="number" min={1}
                        value={form.active_uses_max ?? ''}
                        placeholder="∞"
                        onChange={e => setForm(f => ({ ...f, active_uses_max: parseInt(e.target.value) || null as any }))}
                        style={{ textAlign: 'center' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.125rem' }}>Recharge</label>
                      <select className="input" value={form.active_rest_reset ?? 'short'}
                        onChange={e => setForm(f => ({ ...f, active_rest_reset: e.target.value as any }))}>
                        {REST_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <button className="btn btn--primary" onClick={addItem} disabled={saving || !form.name.trim()}>
            {saving ? '...' : 'Ajouter'}
          </button>
        </div>
      )}

      {/* ── Liste vide ── */}
      {items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <GiBackpack size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sac vide</p>
        </div>
      )}

      {/* ── Items équipés ── */}
      {equipped.length > 0 && (
        <>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <GiShield size={12} /> Équipé ({equipped.length})
          </p>
          {equipped.map(item => (
            <ItemCard key={item.id} item={item} canEdit={canEdit} inCombat={inCombat}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRemove={removeItem} onToggleEquipped={toggleEquipped}
              onUpdateQty={updateQuantity} onUseActive={useActiveAbility} onResetActive={resetActiveUses} />
          ))}
        </>
      )}

      {/* ── Items dans le sac ── */}
      {unequipped.length > 0 && (
        <>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: equipped.length > 0 ? '0.25rem' : 0 }}>
            <GiBackpack size={12} /> Dans le sac ({unequipped.length})
          </p>
          {unequipped.map(item => (
            <ItemCard key={item.id} item={item} canEdit={canEdit} inCombat={inCombat}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRemove={removeItem} onToggleEquipped={toggleEquipped}
              onUpdateQty={updateQuantity} onUseActive={useActiveAbility} onResetActive={resetActiveUses} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({ item, canEdit, inCombat, expanded, onToggleExpand, onRemove, onToggleEquipped, onUpdateQty, onUseActive, onResetActive }: {
  item: Item; canEdit: boolean; inCombat?: boolean; expanded: boolean;
  onToggleExpand: () => void; onRemove: (id: string) => void;
  onToggleEquipped: (i: Item) => void; onUpdateQty: (i: Item, q: number) => void;
  onUseActive: (i: Item) => void; onResetActive: (i: Item) => void;
}) {
  const hasBuffs  = !!(item.bonus_ca || item.bonus_hp_max || (item.bonus_stat_ability && item.bonus_stat_value));
  const hasActive = !!item.active_name;
  const hasCharges = hasActive && item.active_uses_max !== null;
  const remaining = item.active_uses_remaining ?? item.active_uses_max ?? 0;
  const usedCount = (item.active_uses_max ?? 0) - remaining;

  // Couleur bordure : équipé = accent, actif = warning
  const borderColor = item.is_equipped ? 'var(--color-accent)' : 'var(--color-border)';

  return (
    <div className="card animate-pop-in" style={{ padding: '0.5rem 0.75rem', borderColor, transition: 'border-color 0.2s' }}>

      {/* ── Ligne principale ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        {/* Expand toggle */}
        <button onClick={onToggleExpand} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
          <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        <div style={{ flex: 1, cursor: 'pointer' }} onClick={onToggleExpand}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.name}</span>
            {item.quantity > 1 && <span style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>x{item.quantity}</span>}
            {item.is_hidden && <span style={{ fontSize: '0.5rem', color: 'var(--color-warning)', fontWeight: 600 }}>CACHÉ</span>}
            {/* Badges buffs */}
            {item.is_equipped && (
              <>
                {!!(item.bonus_ca) && <BuffBadge label="CA" value={item.bonus_ca} color={item.bonus_ca > 0 ? 'var(--color-success)' : 'var(--color-error)'} />}
                {!!(item.bonus_hp_max) && <BuffBadge label="PV" value={item.bonus_hp_max} color={item.bonus_hp_max > 0 ? 'var(--color-success)' : 'var(--color-error)'} />}
                {item.bonus_stat_ability && item.bonus_stat_value && (
                  <BuffBadge label={ABILITY_META[item.bonus_stat_ability].label} value={item.bonus_stat_value} color={item.bonus_stat_value > 0 ? 'var(--color-success)' : 'var(--color-error)'} />
                )}
              </>
            )}
            {hasActive && (
              <span style={{ fontSize: '0.5rem', color: 'var(--color-warning)', fontWeight: 700, backgroundColor: 'rgba(255,150,0,0.12)', padding: '0.1rem 0.3rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                <GiMagicSwirl size={9} /> {item.active_name}
              </span>
            )}
          </div>
        </div>

        {/* Actions rapides */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
          {/* Équiper/Déséquiper — désactivé en combat */}
          {canEdit && (
            <button className="btn btn--ghost" onClick={() => onToggleEquipped(item)}
              disabled={inCombat}
              title={inCombat ? 'Impossible en combat' : item.is_equipped ? 'Déséquiper' : 'Équiper'}
              style={{ padding: '0.125rem 0.375rem', fontSize: '0.6875rem', color: item.is_equipped ? 'var(--color-accent)' : 'var(--color-text-muted)', opacity: inCombat ? 0.4 : 1 }}>
              <GiShield size={14} />
            </button>
          )}
          {canEdit && !inCombat && (
            <button className="btn btn--ghost" onClick={() => onRemove(item.id)}
              style={{ padding: '0.125rem 0.25rem', color: 'var(--color-error)', fontSize: '0.75rem' }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Détails expandés ── */}
      {expanded && (
        <div className="animate-fade-in" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>

          {item.description && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.description}</p>
          )}

          {/* Quantité */}
          {canEdit && !inCombat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Quantité :</label>
              <button className="btn btn--ghost" onClick={() => onUpdateQty(item, item.quantity - 1)} style={{ padding: '0.1rem 0.35rem', minHeight: 'unset', fontSize: '0.8rem' }}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', minWidth: '1.5rem', textAlign: 'center' }}>{item.quantity}</span>
              <button className="btn btn--ghost" onClick={() => onUpdateQty(item, item.quantity + 1)} style={{ padding: '0.1rem 0.35rem', minHeight: 'unset', fontSize: '0.8rem' }}>+</button>
            </div>
          )}

          {/* Buffs passifs — détail */}
          {hasBuffs && (
            <div style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', padding: '0.375rem 0.5rem' }}>
              <p style={{ fontSize: '0.5625rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.25rem', letterSpacing: '0.06em' }}>
                Buffs passifs {item.is_equipped ? '(actifs)' : '(inactifs — non équipé)'}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                {!!(item.bonus_ca) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: item.bonus_ca > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    <GiShield size={12} /> CA {item.bonus_ca > 0 ? `+${item.bonus_ca}` : item.bonus_ca}
                  </span>
                )}
                {!!(item.bonus_hp_max) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: item.bonus_hp_max > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    <GiHearts size={12} /> PV max {item.bonus_hp_max > 0 ? `+${item.bonus_hp_max}` : item.bonus_hp_max}
                  </span>
                )}
                {item.bonus_stat_ability && item.bonus_stat_value && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: item.bonus_stat_value > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    <GiSparkles size={12} /> {ABILITY_META[item.bonus_stat_ability].label} {item.bonus_stat_value > 0 ? `+${item.bonus_stat_value}` : item.bonus_stat_value}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Capacité active */}
          {hasActive && (
            <div style={{ backgroundColor: 'rgba(255,150,0,0.07)', border: '1px solid rgba(255,150,0,0.2)', borderRadius: 'var(--button-radius)', padding: '0.375rem 0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <GiMagicSwirl size={13} style={{ color: 'var(--color-warning)' }} />
                  {item.active_name}
                </span>
                <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                  {/* Pips de charges */}
                  {hasCharges && (
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {Array.from({ length: item.active_uses_max! }).map((_, i) => (
                        <div key={i} style={{ width: '0.625rem', height: '0.625rem', borderRadius: '50%', border: '1.5px solid var(--color-warning)', backgroundColor: i < remaining ? 'var(--color-warning)' : 'transparent', transition: 'background-color 0.15s' }} />
                      ))}
                    </div>
                  )}
                  {/* Bouton utiliser */}
                  <button className="btn btn--primary"
                    onClick={() => onUseActive(item)}
                    disabled={hasCharges && remaining <= 0}
                    style={{ fontSize: '0.625rem', padding: '0.2rem 0.5rem', minHeight: 'unset', backgroundColor: 'var(--color-warning)', whiteSpace: 'nowrap' }}>
                    <GiBroadsword size={11} /> Utiliser
                  </button>
                  {/* Bouton recharger (hors combat seulement) */}
                  {!inCombat && hasCharges && usedCount > 0 && (
                    <button className="btn btn--ghost" onClick={() => onResetActive(item)} style={{ fontSize: '0.625rem', padding: '0.2rem 0.35rem', minHeight: 'unset', color: 'var(--color-info)' }}>
                      ↺
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                {item.active_casting_time && <span>⚡ {item.active_casting_time}</span>}
                {item.active_damage_dice && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-error)', fontWeight: 700 }}>{item.active_damage_dice}</span>}
                {hasCharges && <span>{remaining}/{item.active_uses_max} charges — {item.active_rest_reset === 'short' ? 'repos court' : 'repos long'}</span>}
              </div>

              {item.active_description && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>{item.active_description}</p>
              )}
            </div>
          )}

          {/* Avertissement équipement en combat */}
          {inCombat && canEdit && (
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              🔒 Équipement verrouillé en combat
            </p>
          )}
        </div>
      )}
    </div>
  );
}