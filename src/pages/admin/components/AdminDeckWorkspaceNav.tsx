import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';

type WorkspaceMode = 'cards' | 'design' | 'output';

interface AdminDeckWorkspaceNavProps {
  deckId: string;
  deckName?: string;
  activeMode: WorkspaceMode;
}

function modeStyle(isActive: boolean): CSSProperties {
  return {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '36px',
    padding: '0.45rem 0.7rem',
    borderRadius: '6px',
    border: `1px solid ${isActive ? 'rgba(212,175,100,0.55)' : 'rgba(255,255,255,0.1)'}`,
    background: isActive ? 'rgba(212,175,100,0.12)' : 'rgba(255,255,255,0.035)',
    color: isActive ? '#f3d58c' : 'rgba(255,255,255,0.78)',
    textDecoration: 'none',
    transition: 'border-color 160ms ease, background 160ms ease, color 160ms ease',
  };
}

export function AdminDeckWorkspaceNav({ deckId, deckName, activeMode }: AdminDeckWorkspaceNavProps) {
  const encodedDeckId = encodeURIComponent(deckId);

  return (
    <nav
      aria-label="Modos del estudio del mazo"
      style={{
        display: 'flex',
        gap: '0.55rem',
        padding: '0.55rem',
        marginBottom: '1rem',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.025)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={{ margin: 0, color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Estudio del mazo
        </p>
        {deckName && (
          <p style={{ margin: '0.18rem 0 0', color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deckName}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <Link to={`/admin/${encodedDeckId}`} style={modeStyle(activeMode === 'cards')}>
          <strong style={{ fontSize: '0.84rem' }}>Mazo</strong>
        </Link>

        <Link to={`/admin/${encodedDeckId}?studio=design`} style={modeStyle(activeMode === 'design')}>
          <strong style={{ fontSize: '0.84rem' }}>Diseño global</strong>
        </Link>

        <Link to={`/admin/${encodedDeckId}?studio=output`} style={modeStyle(activeMode === 'output')}>
          <strong style={{ fontSize: '0.84rem' }}>Publicar / PDF</strong>
        </Link>
      </div>
    </nav>
  );
}
