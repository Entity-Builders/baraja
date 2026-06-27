import { labelStyle, sectionStyle } from '../../frameGeneratorStyles';

interface FramePromptPreviewPanelProps {
  artDirectorPreview: string;
  structuralPreview: string;
}

export function FramePromptPreviewPanel({ artDirectorPreview, structuralPreview }: FramePromptPreviewPanelProps) {
  return (
    <section style={sectionStyle}>
      <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🔍 Preview de Instrucciones al Motor</span>
      </label>
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        padding: '0.6rem',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.05)',
        fontSize: '0.65rem',
        color: 'rgba(255,255,255,0.5)',
        overflowY: 'auto',
        maxHeight: '130px',
        lineHeight: 1.4,
        fontFamily: 'monospace'
      }}>
        <strong>Art Director:</strong><br />
        {artDirectorPreview}
        <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
        <strong>Structural Rules:</strong><br />
        {structuralPreview}
      </div>
    </section>
  );
}
