import {
  aiPanelDetailsStyle,
  aiPanelSectionLabel,
  aiPanelSummaryStyle,
} from './aiPanelStyles';

interface TextFieldInfo {
  key: string;
  label: string;
}

interface AIPanelSmartBoxesProps {
  activeTextFields: TextFieldInfo[];
  ornamentLoading: boolean;
  pngLoading: boolean;
  onGenerateFieldBox: (fieldKey: string, fieldLabel: string, type: 'svg' | 'image') => void;
}

export function AIPanelSmartBoxes({
  activeTextFields,
  ornamentLoading,
  pngLoading,
  onGenerateFieldBox,
}: AIPanelSmartBoxesProps) {
  return (
    <details style={{ ...aiPanelDetailsStyle, border: '1px solid rgba(160,142,230,0.16)', background: 'rgba(160,142,230,0.04)' }}>
      <summary style={aiPanelSummaryStyle}>
        Cajas inteligentes
      </summary>
      <div style={{ marginTop: '0.8rem' }}>
        <label style={{ ...aiPanelSectionLabel, color: '#a08ee6' }}>🧬 Cajas Inteligentes (IA)</label>
        <p style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.6rem', lineHeight: 1.3 }}>
          Genera un contenedor ornamental a medida para cada elemento de texto. Si vuelves a generarlo, reemplazará al anterior.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {activeTextFields.length === 0 && (
            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>No hay textos activos en esta cara.</div>
          )}
          {activeTextFields.map(field => (
            <div key={field.key} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.7rem', marginBottom: '0.4rem', color: 'rgba(255,255,255,0.8)' }}>
                {field.label.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => onGenerateFieldBox(field.key, field.label, 'svg')}
                  disabled={ornamentLoading || pngLoading}
                  style={{
                    flex: 1,
                    background: ornamentLoading ? '#444' : 'linear-gradient(135deg, #4b3d7a, #322554)',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid #a08ee6',
                    cursor: (ornamentLoading || pngLoading) ? 'wait' : 'pointer',
                    fontSize: '0.7rem',
                  }}
                  title="Generar Vector escalable (estilo Flat 3D)"
                >
                  🖌️ SVG
                </button>
                <button
                  onClick={() => onGenerateFieldBox(field.key, field.label, 'image')}
                  disabled={ornamentLoading || pngLoading}
                  style={{
                    flex: 1,
                    background: pngLoading ? '#444' : 'linear-gradient(135deg, #115c48, #0b3d2f)',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    border: '1px solid #20a07a',
                    cursor: (ornamentLoading || pngLoading) ? 'wait' : 'pointer',
                    fontSize: '0.7rem',
                  }}
                  title="Generar Imagen con textura fotorealista"
                >
                  🎨 PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
