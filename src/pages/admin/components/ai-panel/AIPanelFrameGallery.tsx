import { formatDate } from '../../../../lib/formatters';
import type { LibraryFrame } from './aiPanelTypes';
import {
  aiPanelDetailsStyle,
  aiPanelSectionLabel,
  aiPanelSummaryStyle,
} from './aiPanelStyles';

interface AIPanelFrameGalleryProps {
  face: 'front' | 'back';
  heightMm: number;
  frames: LibraryFrame[];
  loading: boolean;
  widthMm: number;
  onSelectFrame: (url: string, widthMm: number, heightMm: number, face: 'front' | 'back') => void;
}

export function AIPanelFrameGallery({
  face,
  heightMm,
  frames,
  loading,
  widthMm,
  onSelectFrame,
}: AIPanelFrameGalleryProps) {
  const faceFrames = frames.filter(frame => !frame.face || frame.face === face);
  const galleryFrames = faceFrames.length > 0 ? faceFrames : frames;

  return (
    <details open style={aiPanelDetailsStyle}>
      <summary style={aiPanelSummaryStyle}>
        Galería de fondos
      </summary>
      <div style={{ marginTop: '0.8rem' }}>
        <label style={aiPanelSectionLabel}>
          {face === 'front' ? 'Fondos para frente' : 'Fondos para dorso'}
        </label>
        {loading ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando galería...</div>
        ) : galleryFrames.length === 0 ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>No hay fondos en la galería global.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {galleryFrames.map((frame, i) => (
              <button
                key={frame.id || `${frame.url}-${i}`}
                type="button"
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: 0,
                  background: '#0a0a0f',
                  color: 'white',
                  textAlign: 'left',
                }}
                onClick={() => onSelectFrame(frame.url, widthMm, heightMm, face)}
                title={frame.prompt || 'Imagen de galería'}
                aria-label={`Usar fondo ${formatDate(frame.timestamp, undefined, undefined, 'sin fecha')}`}
              >
                <img src={frame.url} alt="Frame" style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', fontSize: '0.6rem', padding: '2px 4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  Usar · {formatDate(frame.timestamp, undefined, undefined, 'Sin fecha')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
