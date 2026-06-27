import { formatTime } from '../../../../lib/formatters';
import type { GeneratedFrame, MaybePromise } from '../../frameGeneratorTypes';

interface FramePreviewActionsProps {
  activePreview: GeneratedFrame;
  face: 'front' | 'back';
  loading: boolean;
  refinementText: string;
  saveSuccess: boolean;
  savingToLibrary: boolean;
  selectedDeckId: string | null;
  onDownload: (frame: GeneratedFrame) => void;
  onGenerate: (refinementPrompt?: string) => MaybePromise;
  onRefinementTextChange: (value: string) => void;
  onSaveToLibrary: (frame: GeneratedFrame) => MaybePromise;
  onSetActive: (frame: GeneratedFrame) => MaybePromise;
}

export function FramePreviewActions({
  activePreview,
  face,
  loading,
  refinementText,
  saveSuccess,
  savingToLibrary,
  selectedDeckId,
  onDownload,
  onGenerate,
  onRefinementTextChange,
  onSaveToLibrary,
  onSetActive,
}: FramePreviewActionsProps) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '0.75rem',
          display: 'flex',
          gap: '0.5rem'
        }}>
          <input
            type="text"
            value={refinementText}
            onChange={e => onRefinementTextChange(e.target.value)}
            placeholder="🪄 Refinar: Ej. 'Hazlo más oscuro', 'Agrega luces neón'"
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white',
              borderRadius: '4px',
              flex: 1,
              padding: '0.6rem',
              fontSize: '0.8rem'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && refinementText.trim() && !loading) {
                void onGenerate(refinementText);
              }
            }}
          />
          <button
            onClick={() => { void onGenerate(refinementText); }}
            disabled={loading || !refinementText.trim()}
            style={{
              padding: '0 1.25rem',
              background: loading ? 'rgba(167,139,250,0.3)' : '#a78bfa',
              color: loading ? 'rgba(0,0,0,0.5)' : '#1e1e2e',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || !refinementText.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'all 0.2s',
            }}
          >
            Generar
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
          <button
            onClick={() => { void onSetActive(activePreview); }}
            style={{
              flex: 2,
              padding: '0.7rem',
              background: saveSuccess ? 'rgba(80,200,80,0.2)' : 'rgba(201,168,92,0.2)',
              border: `1px solid ${saveSuccess ? 'rgba(80,200,80,0.5)' : 'var(--color-gold)'}`,
              color: saveSuccess ? '#80e080' : 'var(--color-gold)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {saveSuccess ? '✅ Frame en uso!' : selectedDeckId ? `Set Active ${face === 'back' ? 'Back' : 'Front'} → ${selectedDeckId}` : `Set Active ${face === 'back' ? 'Back' : 'Front'} (Global)`}
          </button>
          <button
            onClick={() => { void onSaveToLibrary(activePreview); }}
            disabled={savingToLibrary}
            style={{
              flex: 1.5,
              padding: '0.7rem',
              background: savingToLibrary ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.4)',
              color: '#a78bfa',
              borderRadius: '8px',
              cursor: savingToLibrary ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {savingToLibrary ? '⏳...' : '💾 A Galería'}
          </button>
          <button
            onClick={() => onDownload(activePreview)}
            style={{
              flex: 1,
              padding: '0.7rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
            }}
          >
            ⬇️ Download PNG
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '1.5rem',
        fontSize: '0.72rem',
        opacity: 0.4,
        marginTop: '1rem',
      }}>
        <span>{activePreview.widthMm}×{activePreview.heightMm}mm</span>
        <span>Face: {activePreview.face}</span>
        <span>Master Builder</span>
        <span>{formatTime(activePreview.timestamp)}</span>
      </div>
    </>
  );
}
