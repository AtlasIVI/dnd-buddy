import { GiEyeTarget, GiCrestedHelmet, GiWarlockEye } from 'react-icons/gi';

export type ViewMode = 'gm' | 'player';

interface ViewToggleProps {
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * Petit toggle affiché uniquement pour les MJs, dans le header.
 * Permet de basculer entre la vue MJ et la vue joueur (debug/test).
 * Ne modifie PAS le rôle en base — c'est purement UI.
 */
export default function ViewToggle({ current, onChange }: ViewToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        backgroundColor: 'var(--color-background-alt)',
        border: '1px solid var(--color-border)',
        borderRadius: '999px',
        padding: '0.1875rem',
        userSelect: 'none',
      }}
      title="Basculer entre vue MJ et vue Joueur (test uniquement)"
    >
      <button
        onClick={() => onChange('gm')}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.25rem 0.625rem',
          borderRadius: '999px',
          border: 'none',
          fontSize: '0.6875rem', fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.15s',
          backgroundColor: current === 'gm' ? 'var(--color-accent)' : 'transparent',
          color: current === 'gm' ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
          minHeight: 'unset',
        }}
      >
        <GiWarlockEye size={12} />
        MJ
      </button>
      <button
        onClick={() => onChange('player')}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.25rem 0.625rem',
          borderRadius: '999px',
          border: 'none',
          fontSize: '0.6875rem', fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.15s',
          backgroundColor: current === 'player' ? 'var(--color-surface)' : 'transparent',
          color: current === 'player' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          boxShadow: current === 'player' ? 'var(--card-shadow)' : 'none',
          minHeight: 'unset',
        }}
      >
        <GiCrestedHelmet size={12} />
        Joueur
      </button>
    </div>
  );
}