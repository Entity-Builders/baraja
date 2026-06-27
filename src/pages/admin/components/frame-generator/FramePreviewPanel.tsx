import type { GeneratedFrame, MaybePromise } from '../../frameGeneratorTypes';
import { FrameCanvas } from './FrameCanvas';
import { FrameHistoryPanel } from './FrameHistoryPanel';
import { FramePreviewActions } from './FramePreviewActions';
import { FrameTypographyPanel } from './FrameTypographyPanel';
import { FrameWorkflowTip } from './FrameWorkflowTip';

interface FramePreviewPanelProps {
  activePreview: GeneratedFrame | null;
  analyzingTypography: boolean;
  cardContent: Record<string, unknown>;
  error: string | null;
  face: 'front' | 'back';
  history: GeneratedFrame[];
  loading: boolean;
  previewHeight: number;
  previewWidth: number;
  primaryTypographyKey: string;
  refinementText: string;
  saveSuccess: boolean;
  savingToLibrary: boolean;
  selectedDeckId: string | null;
  showCardContext: boolean;
  showSafeZone: boolean;
  onAnalyzeTypography: (forceRemix?: boolean) => MaybePromise;
  onDownload: (frame: GeneratedFrame) => void;
  onGenerate: (refinementPrompt?: string) => MaybePromise;
  onRefinementTextChange: (value: string) => void;
  onSaveToLibrary: (frame: GeneratedFrame) => MaybePromise;
  onSelectHistoryFrame: (frame: GeneratedFrame) => void;
  onSetActive: (frame: GeneratedFrame) => MaybePromise;
  onToggleSafeZone: (checked: boolean) => void;
  onUpdateTypographyContainerSvg: (key: string, svg: string) => void;
}

export function FramePreviewPanel({
  activePreview,
  analyzingTypography,
  cardContent,
  error,
  face,
  history,
  loading,
  previewHeight,
  previewWidth,
  primaryTypographyKey,
  refinementText,
  saveSuccess,
  savingToLibrary,
  selectedDeckId,
  showCardContext,
  showSafeZone,
  onAnalyzeTypography,
  onDownload,
  onGenerate,
  onRefinementTextChange,
  onSaveToLibrary,
  onSelectHistoryFrame,
  onSetActive,
  onToggleSafeZone,
  onUpdateTypographyContainerSvg,
}: FramePreviewPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', opacity: 0.7, fontFamily: 'var(--font-serif)' }}>
            Preview
          </h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', opacity: 0.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSafeZone}
              onChange={e => onToggleSafeZone(e.target.checked)}
              style={{ accentColor: 'var(--color-gold)' }}
            />
            Safe zone overlay
          </label>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {error && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(255,100,100,0.1)',
              border: '1px solid rgba(255,100,100,0.3)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#ff6b6b',
              textAlign: 'center'
            }}>
              ⚠️ {error}
            </div>
          )}
          <button
            onClick={() => { void onGenerate(); }}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: loading ? 'rgba(201,168,92,0.3)' : 'var(--color-gold)',
              color: loading ? 'rgba(255,255,255,0.5)' : '#0a0a10',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.05em',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(201,168,92,0.3)',
            }}
          >
            {loading ? '⏳ Generando Cartas con IA...' : '✨ GENERAR ARTE Y FRAME'}
          </button>
        </div>

        <FrameCanvas
          activePreview={activePreview}
          cardContent={cardContent}
          loading={loading}
          previewHeight={previewHeight}
          previewWidth={previewWidth}
          showCardContext={showCardContext}
          showSafeZone={showSafeZone}
        />

        {activePreview && (
          <FramePreviewActions
            activePreview={activePreview}
            face={face}
            loading={loading}
            refinementText={refinementText}
            saveSuccess={saveSuccess}
            savingToLibrary={savingToLibrary}
            selectedDeckId={selectedDeckId}
            onDownload={onDownload}
            onGenerate={onGenerate}
            onRefinementTextChange={onRefinementTextChange}
            onSaveToLibrary={onSaveToLibrary}
            onSetActive={onSetActive}
          />
        )}
      </div>

      {activePreview?.typography && (
        <FrameTypographyPanel
          activePreview={activePreview}
          analyzingTypography={analyzingTypography}
          cardContent={cardContent}
          primaryTypographyKey={primaryTypographyKey}
          onAnalyzeTypography={onAnalyzeTypography}
          onUpdateTypographyContainerSvg={onUpdateTypographyContainerSvg}
        />
      )}

      <FrameHistoryPanel
        activePreview={activePreview}
        history={history}
        onSelectHistoryFrame={onSelectHistoryFrame}
      />
      <FrameWorkflowTip />
    </div>
  );
}
