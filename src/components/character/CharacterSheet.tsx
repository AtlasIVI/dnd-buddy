import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/database';
import { GiHearts, GiShield, GiLeatherBoot, GiBroadsword, GiMuscleUp, GiRunningNinja, GiBrain, GiPrayer, GiChatBubble, GiSparkles, GiScrollUnfurled, GiQuillInk } from 'react-icons/gi';

interface CharacterSheetProps {
  campaignId: string;
  readOnly?: boolean;
  characterId?: string;
}

const ABILITIES = [
  { key: 'str', label: 'FOR', icon: GiMuscleUp },
  { key: 'dex', label: 'DEX', icon: GiRunningNinja },
  { key: 'con', label: 'CON', icon: GiShield },
  { key: 'int', label: 'INT', icon: GiBrain },
  { key: 'wis', label: 'SAG', icon: GiPrayer },
  { key: 'cha', label: 'CHA', icon: GiChatBubble },
] as const;

export default function CharacterSheet({ campaignId, readOnly, characterId }: CharacterSheetProps) {
  const { user } = useAuth();
  const [char, setChar] = useState<Tables<'characters'> | null>(null);
  const [effects, setEffects] = useState<Tables<'effects'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEffect, setNewEffect] = useState({ name: '', description: '', source: '', is_positive: true });
  const [showEffectForm, setShowEffectForm] = useState(false);

  const fetchChar = useCallback(async () => {
    if (characterId) {
      const { data } = await supabase.from('characters').select('*').eq('id', characterId).single();
      if (data) setChar(data);
    } else if (user) {
      const { data } = await supabase.from('characters').select('*').eq('campaign_id', campaignId).eq('user_id', user.id).single();
      if (data) setChar(data);
    }
    setLoading(false);
  }, [campaignId, user, characterId]);

  const fetchEffects = useCallback(async (cid: string) => {
    const { data } = await supabase.from('effects').select('*').eq('character_id', cid).order('created_at');
    if (data) setEffects(data);
  }, []);

  useEffect(() => { fetchChar(); }, [fetchChar]);
  useEffect(() => { if (char) fetchEffects(char.id); }, [char?.id, fetchEffects]);

  useEffect(() => {
    if (!char) return;
    const channel = supabase.channel('char-' + char.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: 'id=eq.' + char.id }, (p: any) => {
        if (p.new) setChar(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'effects', filter: 'character_id=eq.' + char.id }, () => {
        fetchEffects(char.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [char?.id, fetchEffects]);

  async function createCharacter() {
    if (!user) return;
    setSaving(true);
    const { data } = await supabase.from('characters').insert({ campaign_id: campaignId, user_id: user.id, name: 'Nouveau Personnage' }).select().single();
    if (data) setChar(data);
    setSaving(false);
  }

  async function updateField(field: string, value: any) {
    if (!char || readOnly) return;
    setSaving(true);
    await supabase.from('characters').update({ [field]: value }).eq('id', char.id);
    setChar({ ...char, [field]: value });
    setSaving(false);
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
    setEffects(effects.filter(e => e.id !== id));
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  if (!char) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <GiBroadsword size={32} style={{ color: 'var(--color-accent)', marginBottom: '0.75rem' }} />
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Pas encore de personnage</p>
        <button className="btn btn--primary" onClick={createCharacter} disabled={saving}>{saving ? '...' : 'Creer mon personnage'}</button>
      </div>
    );
  }

  const hpPercent = char.hp_max > 0 ? Math.round((char.hp_current / char.hp_max) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Identity */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <GiScrollUnfurled size={18} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.125rem' }}>Identite</h2>
          {saving && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>sauvegarde...</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input className="input" value={char.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Nom" readOnly={readOnly} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" value={char.race} onChange={(e) => updateField('race', e.target.value)} placeholder="Race" style={{ flex: 1 }} readOnly={readOnly} />
            <input className="input" value={char.class} onChange={(e) => updateField('class', e.target.value)} placeholder="Classe" style={{ flex: 1 }} readOnly={readOnly} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <GiSparkles size={14} style={{ color: 'var(--color-xp)' }} />
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Niv.</label>
              <input className="input" type="number" min={0} value={char.level} onChange={(e) => updateField('level', parseInt(e.target.value) || 0)} style={{ width: '4rem', textAlign: 'center' }} readOnly={readOnly} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <GiSparkles size={14} style={{ color: 'var(--color-xp)' }} />
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>XP</label>
              <input className="input" type="number" min={0} value={char.xp} onChange={(e) => updateField('xp', parseInt(e.target.value) || 0)} style={{ flex: 1, textAlign: 'center' }} readOnly={readOnly} />
            </div>
          </div>
        </div>
      </div>

      {/* HP / AC / Speed */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <GiHearts size={18} style={{ color: 'var(--color-hp)' }} />
          <h3 style={{ fontSize: '1rem' }}>Points de Vie</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <input className="input" type="number" min={0} value={char.hp_current} onChange={(e) => updateField('hp_current', Math.max(0, parseInt(e.target.value) || 0))} style={{ width: '4.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color: 'var(--color-hp)' }} readOnly={readOnly} />
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          <input className="input" type="number" min={0} value={char.hp_max} onChange={(e) => updateField('hp_max', Math.max(0, parseInt(e.target.value) || 0))} style={{ width: '4.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }} readOnly={readOnly} />
        </div>
        <div className="hp-bar hp-bar--large">
          <div className="hp-bar__fill" style={{ width: `${Math.min(100, hpPercent)}%` }} />
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <GiShield size={16} style={{ color: 'var(--color-armor-class)' }} />
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>CA</label>
            <input className="input" type="number" min={0} value={char.armor_class} onChange={(e) => updateField('armor_class', parseInt(e.target.value) || 0)} style={{ width: '4rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }} readOnly={readOnly} />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <GiLeatherBoot size={16} style={{ color: 'var(--color-info)' }} />
            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Vit.</label>
            <input className="input" type="number" min={0} value={char.speed} onChange={(e) => updateField('speed', parseInt(e.target.value) || 0)} style={{ width: '4rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }} readOnly={readOnly} />
          </div>
        </div>
      </div>

      {/* Abilities */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <GiMuscleUp size={18} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '1rem' }}>Caracteristiques</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {ABILITIES.map(({ key, label, icon: Icon }) => (
            <div key={key} className="stat-block" style={{ backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', padding: '0.5rem' }}>
              <Icon size={14} style={{ color: 'var(--color-text-muted)', marginBottom: '0.125rem' }} />
              <span className="stat-block__label">{label}</span>
              <input className="input" type="number" min={0} value={(char as any)[key]} onChange={(e) => updateField(key, parseInt(e.target.value) || 0)} style={{ width: '3.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 600, padding: '0.25rem', marginTop: '0.125rem' }} readOnly={readOnly} />
            </div>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GiSparkles size={18} style={{ color: 'var(--color-warning)' }} />
            <h3 style={{ fontSize: '1rem' }}>Effets ({effects.length})</h3>
          </div>
          {!readOnly && <button className="btn btn--ghost" onClick={() => setShowEffectForm(!showEffectForm)} style={{ fontSize: '0.75rem' }}>{showEffectForm ? 'Annuler' : '+ Effet'}</button>}
        </div>
        {showEffectForm && !readOnly && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.75rem', padding: '0.5rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)' }}>
            <input className="input" placeholder="Nom de l'effet" value={newEffect.name} onChange={(e) => setNewEffect({ ...newEffect, name: e.target.value })} />
            <input className="input" placeholder="Description" value={newEffect.description} onChange={(e) => setNewEffect({ ...newEffect, description: e.target.value })} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input" placeholder="Source" value={newEffect.source} onChange={(e) => setNewEffect({ ...newEffect, source: e.target.value })} style={{ flex: 1 }} />
              <button className={newEffect.is_positive ? 'btn btn--primary' : 'btn btn--danger'} onClick={() => setNewEffect({ ...newEffect, is_positive: !newEffect.is_positive })} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {newEffect.is_positive ? 'Positif' : 'Negatif'}
              </button>
            </div>
            <button className="btn btn--primary" onClick={addEffect} disabled={!newEffect.name.trim()} style={{ fontSize: '0.8125rem' }}>Ajouter</button>
          </div>
        )}
        {effects.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucun effet actif</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {effects.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0.5rem', backgroundColor: 'var(--color-background-alt)', borderRadius: 'var(--button-radius)', borderLeft: `3px solid ${e.is_positive ? 'var(--color-success)' : 'var(--color-error)'}` }}>
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{e.name}</span>
                  {e.description && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{e.description}</span>}
                  {e.source && <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', display: 'block' }}>Source: {e.source}</span>}
                </div>
                {!readOnly && <button className="btn btn--ghost" onClick={() => removeEffect(e.id)} style={{ fontSize: '0.75rem', color: 'var(--color-error)', padding: '0.125rem 0.375rem' }}>X</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <GiQuillInk size={18} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '1rem' }}>Notes</h3>
        </div>
        <textarea className="input" rows={4} value={char.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Notes personnelles..." readOnly={readOnly} style={{ resize: 'vertical' }} />
      </div>
    </div>
  );
}
