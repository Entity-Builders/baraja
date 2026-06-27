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
  return (
    <details style={aiPanelDetailsStyle}>
      <summary style={aiPanelSummaryStyle}>
        Galería de fondos
      </summary>
      <div style={{ marginTop: '0.8rem' }}>
        <label style={aiPanelSectionLabel}>Historial / Galería</label>
        {loading ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando galería...</div>
        ) : frames.length === 0 ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>No hay fondos en la galería global.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {frames.map((frame, i) => (
              <div
                key={i}
                style={{ position: 'relative', cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => onSelectFrame(frame.url, frame.widthMm || widthMm, frame.heightMm || heightMm, frame.face || face)}
                title={frame.prompt || 'Imagen de galería'}
              >
                <img src={frame.url} alt="Frame" style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', fontSize: '0.6rem', padding: '2px 4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {formatDate(frame.timestamp, undefined, undefined, 'Sin fecha')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
