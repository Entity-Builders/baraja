import type { GeneratedFrame, LibraryFrame } from '../../frameGeneratorTypes';

interface FrameLibraryGalleryProps {
  activePreview: GeneratedFrame | null;
  frames: LibraryFrame[];
  loading: boolean;
  onSelectFrame: (frame: LibraryFrame) => void;
}

export function FrameLibraryGallery({ activePreview, frames, loading, onSelectFrame }: FrameLibraryGalleryProps) {
  return (
    <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--color-gold)' }}>
          📚 Librería de Frames Guardados
        </h2>
        <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{frames.length} frames en tu repertorio</span>
      </div>

      {loading ? (
        <div style={{ opacity: 0.5, fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>⏳ Recuperando galería...</div>
      ) : frames.length === 0 ? (
        <div style={{ opacity: 0.3, fontSize: '0.8rem', padding: '3rem 0', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
          No guardaste ningún frame todavía. Usá el botón "💾 A Galería" para sumar tu diseño acá.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '1.25rem' }}>
          {frames.map(libFrame => (
            <div
              key={libFrame.id}
              onClick={() => onSelectFrame(libFrame)}
              style={{
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.02)',
                padding: '6px',
                border: `1px solid ${activePreview?.timestamp === libFrame.timestamp ? 'var(--color-gold)' : 'rgba(255,255,255,0.05)'}`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(201,168,92,0.4)';
                e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = activePreview?.timestamp === libFrame.timestamp ? 'var(--color-gold)' : 'rgba(255,255,255,0.05)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ borderRadius: '6px', overflow: 'hidden', background: '#0a0a0f', aspectRatio: '70 / 120' }}>
                <img
                  src={libFrame.url}
                  alt="Saved Frame"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ fontSize: '0.62rem', opacity: 0.45, marginTop: '0.4rem', textAlign: 'center', fontFamily: 'monospace' }}>
                {new Date(libFrame.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
