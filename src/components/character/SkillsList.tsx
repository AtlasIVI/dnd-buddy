import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/database';
import { GiScrollUnfurled, GiEyeTarget, GiSkills } from 'react-icons/gi';

interface SkillsListProps {
  characterId: string;
  canEdit: boolean;
}

export default function SkillsList({ characterId, canEdit }: SkillsListProps) {
  const [skills, setSkills] = useState<Tables<'skills'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', modifier: '', description: '', is_hidden: false });

  const fetchSkills = useCallback(async () => {
    const { data } = await supabase.from('skills').select('*').eq('character_id', characterId).order('sort_order');
    if (data) setSkills(data);
    setLoading(false);
  }, [characterId]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  useEffect(() => {
    const channel = supabase.channel('skills-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skills', filter: 'character_id=eq.' + characterId }, () => fetchSkills())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [characterId, fetchSkills]);

  async function addSkill() {
    if (!newSkill.name.trim()) return;
    const maxOrder = skills.length > 0 ? Math.max(...skills.map(s => s.sort_order)) + 1 : 0;
    await supabase.from('skills').insert({ character_id: characterId, ...newSkill, sort_order: maxOrder });
    setNewSkill({ name: '', modifier: '', description: '', is_hidden: false });
    setShowForm(false);
    fetchSkills();
  }

  async function removeSkill(id: string) {
    await supabase.from('skills').delete().eq('id', id);
    setSkills(skills.filter(s => s.id !== id));
  }

  async function toggleHidden(skill: Tables<'skills'>) {
    await supabase.from('skills').update({ is_hidden: !skill.is_hidden }).eq('id', skill.id);
    fetchSkills();
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiSkills size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Competences ({skills.length})</h2>
        </div>
        {canEdit && <button className="btn btn--ghost" onClick={() => setShowForm(!showForm)} style={{ fontSize: '0.75rem' }}>{showForm ? 'Annuler' : '+ Competence'}</button>}
      </div>

      {showForm && canEdit && (
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <input className="input" placeholder="Nom de la competence" value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" placeholder="Modificateur (+3, -1...)" value={newSkill.modifier} onChange={(e) => setNewSkill({ ...newSkill, modifier: e.target.value })} style={{ flex: 1 }} />
            <button className={newSkill.is_hidden ? 'btn btn--secondary' : 'btn btn--ghost'} onClick={() => setNewSkill({ ...newSkill, is_hidden: !newSkill.is_hidden })} style={{ fontSize: '0.75rem' }}>
              <GiEyeTarget size={14} /> {newSkill.is_hidden ? 'Cache' : 'Visible'}
            </button>
          </div>
          <input className="input" placeholder="Description (optionnel)" value={newSkill.description} onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })} />
          <button className="btn btn--primary" onClick={addSkill} disabled={!newSkill.name.trim()}>Ajouter</button>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <GiScrollUnfurled size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Aucune competence</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {skills.map(s => (
            <div key={s.id} className="card" style={{ padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.name}</span>
                  {s.modifier && <span className="badge badge--player" style={{ fontSize: '0.6875rem' }}>{s.modifier}</span>}
                  {s.is_hidden && <span className="badge badge--hidden" style={{ fontSize: '0.5625rem' }}>cache</span>}
                </div>
                {s.description && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{s.description}</p>}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="btn btn--ghost" onClick={() => toggleHidden(s)} style={{ padding: '0.125rem 0.25rem', fontSize: '0.75rem' }}>
                    <GiEyeTarget size={14} />
                  </button>
                  <button className="btn btn--ghost" onClick={() => removeSkill(s.id)} style={{ padding: '0.125rem 0.25rem', fontSize: '0.75rem', color: 'var(--color-error)' }}>X</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
