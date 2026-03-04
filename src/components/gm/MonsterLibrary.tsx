import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

interface Monster {
  id: string;
  created_by: string;
  name: string;
  hp_default: number;
  armor_class: number;
  notes: string;
  is_favorite: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Props {
  onSpawnMonster?: (monster: Monster, count: number) => void;
  selectionMode?: boolean;
}

export default function MonsterLibrary({ onSpawnMonster, selectionMode }: Props) {
  const { user } = useAuth();
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newMonster, setNewMonster] = useState({ name: "", hp_default: 20, armor_class: 12, notes: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", hp_default: 20, armor_class: 12, notes: "" });
  const [spawnCounts, setSpawnCounts] = useState<Record<string, number>>({});

  const fetchMonsters = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("monster_library")
      .select("*")
      .eq("created_by", user.id)
      .order("is_favorite", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("name");
    if (data) setMonsters(data as Monster[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMonsters(); }, [fetchMonsters]);

  async function addMonster() {
    if (!user || !newMonster.name.trim()) return;
    await supabase.from("monster_library").insert({ created_by: user.id, ...newMonster });
    setNewMonster({ name: "", hp_default: 20, armor_class: 12, notes: "" });
    setShowNew(false);
    fetchMonsters();
  }

  async function updateMonster(id: string) {
    await supabase.from("monster_library").update(editData).eq("id", id);
    setEditingId(null);
    fetchMonsters();
  }

  async function toggleFavorite(m: Monster) {
    await supabase.from("monster_library").update({ is_favorite: !m.is_favorite }).eq("id", m.id);
    fetchMonsters();
  }

  async function deleteMonster(id: string) {
    await supabase.from("monster_library").delete().eq("id", id);
    setMonsters(monsters.filter(m => m.id !== id));
  }

  function handleSpawn(m: Monster) {
    if (onSpawnMonster) {
      const count = spawnCounts[m.id] || 1;
      onSpawnMonster(m, count);
      supabase.from("monster_library").update({ last_used_at: new Date().toISOString() }).eq("id", m.id);
    }
  }

  const filtered = monsters.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const favorites = filtered.filter(m => m.is_favorite);
  const others = filtered.filter(m => !m.is_favorite);

  if (loading) return <p style={{ color: "var(--color-text-muted)" }}>Chargement...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1.25rem" }}>Bestiaire</h2>
        <button className="btn btn--ghost" onClick={() => setShowNew(!showNew)} style={{ fontSize: "0.8125rem" }}>{showNew ? "Annuler" : "+ Nouveau"}</button>
      </div>

      <input className="input" placeholder="Rechercher un monstre..." value={search} onChange={e => setSearch(e.target.value)} />

      {showNew && (
        <div className="card animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input className="input" placeholder="Nom du monstre" value={newMonster.name} onChange={e => setNewMonster({ ...newMonster, name: e.target.value })} autoFocus />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>PV</label>
              <input className="input" type="number" value={newMonster.hp_default} onChange={e => setNewMonster({ ...newMonster, hp_default: parseInt(e.target.value) || 1 })} style={{ fontFamily: "var(--font-mono)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>CA</label>
              <input className="input" type="number" value={newMonster.armor_class} onChange={e => setNewMonster({ ...newMonster, armor_class: parseInt(e.target.value) || 10 })} style={{ fontFamily: "var(--font-mono)" }} />
            </div>
          </div>
          <input className="input" placeholder="Notes (attaques, capacites...)" value={newMonster.notes} onChange={e => setNewMonster({ ...newMonster, notes: e.target.value })} />
          <button className="btn btn--primary" onClick={addMonster} disabled={!newMonster.name.trim()}>Ajouter au bestiaire</button>
        </div>
      )}

      {filtered.length === 0 && !showNew && (
        <div className="card" style={{ textAlign: "center", padding: "1.5rem" }}>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>{search ? "Aucun resultat" : "Bestiaire vide"}</p>
        </div>
      )}

      {[{ label: "Favoris", list: favorites }, { label: "", list: others }].map(({ label, list }) =>
        list.length > 0 ? (
          <div key={label}>
            {label && <p style={{ fontSize: "0.6875rem", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.375rem" }}>{label}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {list.map(m => (
                <div key={m.id} className="card">
                  {editingId === m.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <input className="input" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} autoFocus />
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input className="input" type="number" value={editData.hp_default} onChange={e => setEditData({ ...editData, hp_default: parseInt(e.target.value) || 1 })} style={{ width: "5rem", fontFamily: "var(--font-mono)" }} />
                        <input className="input" type="number" value={editData.armor_class} onChange={e => setEditData({ ...editData, armor_class: parseInt(e.target.value) || 10 })} style={{ width: "5rem", fontFamily: "var(--font-mono)" }} />
                        <input className="input" value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} style={{ flex: 1 }} placeholder="Notes" />
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn--primary" onClick={() => updateMonster(m.id)} style={{ flex: 1 }}>Sauver</button>
                        <button className="btn btn--ghost" onClick={() => setEditingId(null)}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button onClick={() => toggleFavorite(m)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: m.is_favorite ? "var(--color-accent)" : "var(--color-text-muted)", padding: 0 }}>{m.is_favorite ? "★" : "☆"}</button>
                          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{m.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "0.5625rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>PV</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-hp)" }}>{m.hp_default}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "0.5625rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>CA</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.armor_class}</div>
                          </div>
                        </div>
                      </div>
                      {m.notes && <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.375rem" }}>{m.notes}</p>}
                      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem", alignItems: "center" }}>
                        {selectionMode && onSpawnMonster && (
                          <>
                            <input className="input" type="number" min={1} max={20} value={spawnCounts[m.id] || 1} onChange={e => setSpawnCounts(sc => ({ ...sc, [m.id]: Math.max(1, parseInt(e.target.value) || 1) }))} style={{ width: "3rem", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", padding: "0.25rem" }} />
                            <button className="btn btn--danger" onClick={() => handleSpawn(m)} style={{ fontSize: "0.75rem" }}>Invoquer</button>
                            <div style={{ flex: 1 }} />
                          </>
                        )}
                        <button className="btn btn--ghost" onClick={() => { setEditingId(m.id); setEditData({ name: m.name, hp_default: m.hp_default, armor_class: m.armor_class, notes: m.notes }); }} style={{ fontSize: "0.6875rem" }}>Editer</button>
                        <button className="btn btn--ghost" onClick={() => deleteMonster(m.id)} style={{ fontSize: "0.6875rem", color: "var(--color-error)" }}>Suppr.</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
