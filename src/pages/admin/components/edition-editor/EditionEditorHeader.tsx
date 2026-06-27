import { Link } from 'react-router-dom';
import type { CardViewMode, StudioMode } from './editionEditorTypes';

interface EditionEditorHeaderProps {
  deckName: string;
  studioMode: StudioMode;
  studioTitle: string;
  viewMode: CardViewMode;
  workspaceDeckId: string;
  onDeleteEdition: () => void;
  onOpenSettings: () => void;
  onViewModeChange: (viewMode: CardViewMode) => void;
}

const CARD_VIEW_OPTIONS: { id: CardViewMode; label: string; activeColor?: string }[] = [
  { id: 'print', label: 'Layout impreso' },
  { id: 'original', label: 'Arte original' },
  { id: 'gallery', label: 'Galería', activeColor: 'var(--color-gold)' },
];

export function EditionEditorHeader({
  deckName,
  studioMode,
  studioTitle,
  viewMode,
  workspaceDeckId,
  onDeleteEdition,
  onOpenSettings,
  onViewModeChange,
}: EditionEditorHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>&larr; Dashboard</Link>
        <h1 style={{ margin: 0 }}>{deckName} · {studioTitle}</h1>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-start', flex: '1 1 100%', width: '100%', maxWidth: 'calc(100vw - 2rem)', minWidth: 0 }}>
        {studioMode === 'cards' && (
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflowX: 'auto', overflowY: 'hidden', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%' }}>
            {CARD_VIEW_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => onViewModeChange(option.id)}
                style={{
                  background: viewMode === option.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: viewMode === option.id ? option.activeColor ?? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onOpenSettings}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Ajustes
        </button>
        <Link
          to={`/admin/${encodeURIComponent(workspaceDeckId)}?studio=output`}
          className={studioMode === 'output' ? 'btn-primary' : 'btn-ghost'}
          style={{ textDecoration: 'none' }}
        >
          Publicar / PDF
        </Link>
        <Link to={`/admin/${encodeURIComponent(workspaceDeckId)}?studio=design&tool=tuckbox`} className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
          Tuck box
        </Link>
        <button
          onClick={onDeleteEdition}
          style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.45)', color: '#f87171', padding: '0.5rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
