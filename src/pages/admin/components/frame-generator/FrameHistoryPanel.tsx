import type { GeneratedFrame } from '../../frameGeneratorTypes';

interface FrameHistoryPanelProps {
  activePreview: GeneratedFrame | null;
  history: GeneratedFrame[];
  onSelectHistoryFrame: (frame: GeneratedFrame) => void;
}

export function FrameHistoryPanel({ activePreview, history, onSelectHistoryFrame }: FrameHistoryPanelProps) {
  if (history.length <= 1) return null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '12px',
      padding: '1.25rem',
    }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', opacity: 0.6 }}>
        Historial de esta sesión
      </h3>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {history.map((frame, i) => (
          <div
            key={frame.timestamp}
            onClick={() => onSelectHistoryFrame(frame)}
            style={{
              width: '72px',
              height: '100px',
              borderRadius: '6px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: `2px solid ${activePreview?.timestamp === frame.timestamp ? 'var(--color-gold)' : 'transparent'}`,
              transition: 'border-color 0.15s',
              position: 'relative',
            }}
          >
            <img
              src={frame.dataUrl}
              alt={`Frame ${i + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {i === 0 && (
              <div style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: 'var(--color-gold)',
                color: '#0a0a10',
                fontSize: '0.5rem',
                padding: '1px 3px',
                borderRadius: '3px',
                fontWeight: 700,
              }}>
                NEW
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
