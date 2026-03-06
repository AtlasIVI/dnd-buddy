import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/database';
import { GiBackpack, GiEyeTarget, GiShield } from 'react-icons/gi';

interface InventoryProps {
  characterId: string;
  canEdit: boolean;
}

export default function Inventory({ characterId, canEdit }: InventoryProps) {
  const [items, setItems] = useState<Tables<'inventory_items'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', description: '', quantity: 1, is_equipped: false, is_hidden: false });

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from('inventory_items').select('*').eq('character_id', characterId).order('sort_order');
    if (data) setItems(data);
    setLoading(false);
  }, [characterId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    const channel = supabase.channel('inv-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: 'character_id=eq.' + characterId }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [characterId, fetchItems]);

  async function addItem() {
    if (!newItem.name.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0;
    await supabase.from('inventory_items').insert({ character_id: characterId, ...newItem, sort_order: maxOrder });
    setNewItem({ name: '', description: '', quantity: 1, is_equipped: false, is_hidden: false });
    setShowForm(false);
    fetchItems();
  }

  async function removeItem(id: string) {
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(items.filter(i => i.id !== id));
  }

  async function toggleEquipped(item: Tables<'inventory_items'>) {
    await supabase.from('inventory_items').update({ is_equipped: !item.is_equipped }).eq('id', item.id);
    fetchItems();
  }

  async function toggleHidden(item: Tables<'inventory_items'>) {
    await supabase.from('inventory_items').update({ is_hidden: !item.is_hidden }).eq('id', item.id);
    fetchItems();
  }

  async function updateQuantity(item: Tables<'inventory_items'>, qty: number) {
    const newQty = Math.max(0, qty);
    await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', item.id);
    fetchItems();
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>;

  const equipped = items.filter(i => i.is_equipped);
  const unequipped = items.filter(i => !i.is_equipped);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GiBackpack size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Inventaire ({items.length})</h2>
        </div>
        {canEdit && <button className="btn btn--ghost btn--add-toggle" onClick={() => setShowForm(!showForm)} style={{ fontSize: '0.75rem' }}>{showForm ? 'Annuler' : '+ Objet'}</button>}
      </div>

      {showForm && canEdit && (
        <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <input className="input" placeholder="Nom de l'objet" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          <input className="input" placeholder="Description (optionnel)" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Qte</label>
              <input className="input" type="number" min={0} value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '4rem', textAlign: 'center' }} />
            </div>
            <button className={newItem.is_equipped ? 'btn btn--primary' : 'btn btn--ghost'} onClick={() => setNewItem({ ...newItem, is_equipped: !newItem.is_equipped })} style={{ fontSize: '0.75rem' }}>
              <GiShield size={14} /> {newItem.is_equipped ? 'Equipe' : 'Non equipe'}
            </button>
            <button className={newItem.is_hidden ? 'btn btn--secondary' : 'btn btn--ghost'} onClick={() => setNewItem({ ...newItem, is_hidden: !newItem.is_hidden })} style={{ fontSize: '0.75rem' }}>
              <GiEyeTarget size={14} /> {newItem.is_hidden ? 'Cache' : 'Visible'}
            </button>
          </div>
          <button className="btn btn--primary" onClick={addItem} disabled={!newItem.name.trim()}>Ajouter</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <GiBackpack size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }} />
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Sac vide</p>
        </div>
      ) : (
        <>
          {equipped.length > 0 && (
            <>
              <p style={{ fontSize: '0.6875rem', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}><GiShield size={12} style={{ marginRight: '0.25rem' }} />Equipe</p>
              {equipped.map(item => <ItemRow key={item.id} item={item} canEdit={canEdit} onRemove={removeItem} onToggleEquipped={toggleEquipped} onToggleHidden={toggleHidden} onUpdateQty={updateQuantity} />)}
            </>
          )}
          {unequipped.length > 0 && (
            <>
              {equipped.length > 0 && <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}><GiBackpack size={12} style={{ marginRight: '0.25rem' }} />Dans le sac</p>}
              {unequipped.map(item => <ItemRow key={item.id} item={item} canEdit={canEdit} onRemove={removeItem} onToggleEquipped={toggleEquipped} onToggleHidden={toggleHidden} onUpdateQty={updateQuantity} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ItemRow({ item, canEdit, onRemove, onToggleEquipped, onToggleHidden, onUpdateQty }: {
  item: Tables<'inventory_items'>; canEdit: boolean;
  onRemove: (id: string) => void; onToggleEquipped: (i: Tables<'inventory_items'>) => void;
  onToggleHidden: (i: Tables<'inventory_items'>) => void; onUpdateQty: (i: Tables<'inventory_items'>, q: number) => void;
}) {
  return (
    <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.name}</span>
            {item.quantity > 1 && <span className="badge badge--player" style={{ fontSize: '0.625rem' }}>x{item.quantity}</span>}
            {item.is_hidden && <span className="badge badge--hidden" style={{ fontSize: '0.5625rem' }}>cache</span>}
          </div>
          {item.description && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{item.description}</p>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <input type="number" min={0} className="input" value={item.quantity} onChange={(e) => onUpdateQty(item, parseInt(e.target.value) || 0)} style={{ width: '3rem', textAlign: 'center', padding: '0.125rem', fontSize: '0.75rem' }} />
            <button className="btn btn--ghost" onClick={() => onToggleEquipped(item)} style={{ padding: '0.125rem 0.25rem', fontSize: '0.6875rem', color: item.is_equipped ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
              <GiShield size={14} />
            </button>
            <button className="btn btn--ghost" onClick={() => onToggleHidden(item)} style={{ padding: '0.125rem 0.25rem', fontSize: '0.6875rem' }}>
              <GiEyeTarget size={14} />
            </button>
            <button className="btn btn--ghost" onClick={() => onRemove(item.id)} style={{ padding: '0.125rem 0.25rem', color: 'var(--color-error)' }}>X</button>
          </div>
        )}
      </div>
    </div>
  );
}
