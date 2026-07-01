import type { SavedConfigRow } from '../../../lib/deckRepository';
import { formatDate } from '../../../lib/formatters';

interface SavedConfigsPanelProps {
  configs: SavedConfigRow[];
  loading: boolean;
  applyingId: string | null;
  onApply: (config: SavedConfigRow) => void;
  onDelete: (config: SavedConfigRow) => void;
}

export function SavedConfigsPanel({
  configs,
  loading,
  applyingId,
  onApply,
  onDelete,
}: SavedConfigsPanelProps) {
  if (loading) {
    return (
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando versiones de diseño...</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.6rem',
      }}>
        <h3 style={{
          margin: 0, fontSize: '0.8rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)',
        }}>
          Versiones de diseño
        </h3>
        <span style={{
          fontSize: '0.7rem', background: 'rgba(212,175,100,0.15)',
          color: '#d4af64', padding: '2px 8px', borderRadius: '10px',
        }}>
          {configs.length}
        </span>
      </div>

      {configs.length === 0 ? (
        <div style={{
          padding: '1rem', background: 'rgba(255,255,255,0.02)',
          borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)',
          textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)',
        }}>
          No hay versiones guardadas aún.
          <br />
          <span style={{ fontSize: '0.7rem' }}>Usá "Guardar copia" arriba para crear una.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {configs.map(config => {
            const isApplying = applyingId === config.id;
            const isGlobal = !config.edition_slug;
            const dateStr = formatDate(config.created_at, {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }, 'es-AR');

            return (
              <div
                key={config.id}
                style={{
                  padding: '0.7rem 0.8rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={event => (event.currentTarget.style.borderColor = 'rgba(212,175,100,0.3)')}
                onMouseLeave={event => (event.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{config.name}</span>
                  {isGlobal && (
                    <span style={{
                      fontSize: '0.6rem', background: 'rgba(139,190,238,0.15)',
                      color: '#8be', padding: '1px 6px', borderRadius: '8px',
                    }}>
                      Global
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem' }}>
                  {config.card_width}×{config.card_height}mm • {dateStr}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => onApply(config)}
                    disabled={isApplying}
                    style={{
                      flex: 1, padding: '0.35rem', fontSize: '0.75rem',
                      background: isApplying ? '#333' : 'rgba(212,175,100,0.1)',
                      border: '1px solid rgba(212,175,100,0.3)',
                      color: '#d4af64', borderRadius: '4px',
                      cursor: isApplying ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {isApplying ? '⏳...' : '▶ Aplicar'}
                  </button>
                  <button
                    onClick={() => onDelete(config)}
                    style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.75rem',
                      background: 'transparent',
                      border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
