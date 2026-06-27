import type { GeneratedFrame, MaybePromise, TypoZone } from '../../frameGeneratorTypes';
import { isTypoZone } from '../../frameGeneratorTypes';

interface FrameTypographyPanelProps {
  activePreview: GeneratedFrame;
  analyzingTypography: boolean;
  cardContent: Record<string, unknown>;
  primaryTypographyKey: string;
  onAnalyzeTypography: (forceRemix?: boolean) => MaybePromise;
  onUpdateTypographyContainerSvg: (key: string, svg: string) => void;
}

export function FrameTypographyPanel({
  activePreview,
  analyzingTypography,
  cardContent,
  primaryTypographyKey,
  onAnalyzeTypography,
  onUpdateTypographyContainerSvg,
}: FrameTypographyPanelProps) {
  const typography = activePreview.typography;
  if (!typography) return null;

  return (
    <div style={{
      background: 'rgba(167,139,250,0.06)',
      border: '1px solid rgba(167,139,250,0.25)',
      borderRadius: '12px',
      padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '1rem' }}>🔡</span>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#a78bfa' }}>
          Sugerencias de Tipografía IA
        </h3>
        <button
          onClick={() => { void onAnalyzeTypography(); }}
          disabled={analyzingTypography}
          style={{
            background: analyzingTypography ? 'rgba(167,139,250,0.1)' : 'rgba(167,139,250,0.2)',
            border: '1px solid rgba(167,139,250,0.4)',
            color: analyzingTypography ? 'rgba(167,139,250,0.5)' : '#d8b4fe',
            borderRadius: '6px',
            padding: '0.3rem 0.6rem',
            fontSize: '0.7rem',
            fontWeight: 600,
            cursor: analyzingTypography ? 'wait' : 'pointer',
            marginLeft: '0.5rem',
            transition: 'all 0.2s'
          }}
          title="Volver a analizar la imagen activa para sugerir nuevas tipografías y colores"
        >
          {analyzingTypography ? '🤖 Analizando...' : '🤖 Re-analizar'}
        </button>
        <button
          onClick={() => { void onAnalyzeTypography(true); }}
          disabled={analyzingTypography}
          style={{
            background: analyzingTypography ? 'rgba(99,183,120,0.05)' : 'rgba(99,183,120,0.15)',
            border: '1px solid rgba(99,183,120,0.4)',
            color: analyzingTypography ? 'rgba(99,183,120,0.4)' : '#86efac',
            borderRadius: '6px',
            padding: '0.3rem 0.6rem',
            fontSize: '0.7rem',
            fontWeight: 600,
            cursor: analyzingTypography ? 'wait' : 'pointer',
            transition: 'all 0.2s'
          }}
          title="Generar una distribución de layout radicalmente diferente para esta misma imagen"
        >
          {analyzingTypography ? '...' : '🎲 Remix Layout'}
        </button>
        <span style={{ fontSize: '0.68rem', opacity: 0.4, marginLeft: 'auto' }}>
          Gemini · pt units
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {Object.keys(cardContent).map(key => {
          if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) return null;
          const zone = typography[key];
          if (!isTypoZone(zone) || !zone.leftPct) return null;
          return (
            <TypoRow
              key={key}
              label={key.toUpperCase()}
              field={zone}
              uiColor={key === primaryTypographyKey ? '#f8d56b' : '#94a3b8'}
              highlight={key === primaryTypographyKey}
              onUpdateSvg={(svg) => onUpdateTypographyContainerSvg(key, svg)}
            />
          );
        })}
      </div>

      {typography.qrSizeMm && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', opacity: 0.5 }}>
          QR sugerido: <strong>{typography.qrSizeMm}mm</strong>
        </div>
      )}

      {typography.focalPoints && typography.focalPoints.length > 0 && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.6rem 0.75rem',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '0.65rem', opacity: 0.5, marginBottom: '0.4rem', letterSpacing: '0.05em' }}>📍 ELEMENTOS VISUALES DETECTADOS</div>
          <div style={{ position: 'relative', width: '100%', paddingBottom: '142%', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
            {typography.focalPoints.map((fp, i) => (
              <div
                key={i}
                title={`${fp.description} (${fp.xPct.toFixed(0)}%, ${fp.yPct.toFixed(0)}%)`}
                style={{
                  position: 'absolute',
                  left: `${fp.xPct}%`,
                  top: `${fp.yPct}%`,
                  width: `${Math.min(fp.sizePct * 1.5, 35)}%`,
                  paddingBottom: `${Math.min(fp.sizePct * 1.5, 35)}%`,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: '1.5px dashed rgba(251,191,36,0.7)',
                  background: 'rgba(251,191,36,0.1)',
                  cursor: 'default',
                }}
              />
            ))}
            {typography.focalPoints.map((fp, i) => (
              <div key={`lbl-${i}`} style={{
                position: 'absolute',
                left: `${fp.xPct}%`,
                top: `${fp.yPct}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: '0.5rem',
                color: '#fbbf24',
                fontWeight: 700,
                background: 'rgba(0,0,0,0.6)',
                padding: '1px 3px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                zIndex: 2,
                pointerEvents: 'none',
              }}>{fp.description.slice(0, 18)}</div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {typography.focalPoints.map((fp, i) => (
              <div key={i} style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                <span style={{ color: '#fbbf24' }}>●</span> {fp.description} — ({fp.xPct.toFixed(0)}% derecha, {fp.yPct.toFixed(0)}% abajo)
              </div>
            ))}
          </div>
        </div>
      )}

      {typography.overallNotes && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.6rem 0.75rem',
          background: 'rgba(167,139,250,0.08)',
          borderRadius: '6px',
          fontSize: '0.75rem',
          opacity: 0.7,
          lineHeight: 1.5,
        }}>
          💬 {typography.overallNotes}
        </div>
      )}
    </div>
  );
}

interface TypoRowProps {
  label: string;
  field: TypoZone;
  uiColor?: string;
  highlight?: boolean;
  onUpdateSvg?: (svg: string) => void;
}

function TypoRow({ label, field, uiColor = 'white', highlight = false, onUpdateSvg }: TypoRowProps) {
  const weightLabel = field.fontWeight
    ? { thin: 'Thin', '300': 'Light', regular: 'Regular', bold: 'Bold', '700': 'Bold', '900': 'Black' }[field.fontWeight] ?? field.fontWeight
    : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      padding: '0.5rem 0.65rem',
      background: highlight ? 'rgba(248,213,107,0.06)' : 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      border: `1px solid ${highlight ? 'rgba(248,213,107,0.2)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'min-content 1fr auto',
        gap: '0.5rem',
        alignItems: 'start',
      }}>
        {field.color ? (
          <div style={{ marginTop: '3px', width: '12px', height: '12px', borderRadius: '4px', background: field.color, border: '1px solid rgba(255,255,255,0.2)' }} title={`Color IA: ${field.color}`} />
        ) : <div style={{ width: '12px' }} />}

        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7, letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
            {label}
          </div>

          {field.notes && (
            <div style={{ fontSize: '0.68rem', opacity: 0.45, fontStyle: 'italic', lineHeight: 1.3 }}>
              {field.notes}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: uiColor, fontFamily: 'monospace' }}>
              {field.fontSize}pt
            </div>
            {weightLabel && (
              <div style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: '4px',
                background: weightLabel === 'Black' || weightLabel === 'Bold'
                  ? 'rgba(251,191,36,0.2)'
                  : weightLabel === 'Thin' || weightLabel === 'Light'
                    ? 'rgba(148,163,184,0.15)'
                    : 'rgba(255,255,255,0.08)',
                color: weightLabel === 'Black' || weightLabel === 'Bold' ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                letterSpacing: '0.04em',
              }}>
                {weightLabel.toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.55, textAlign: 'right' }}>
            {field.fontFamily?.includes('Cormorant') ? 'Cormorant Garamond' : (field.fontFamily || 'Default Font')}
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '0.6rem', opacity: 0.4 }}>
            {field.lineHeight && <span>lh:{field.lineHeight}</span>}
            {field.letterSpacing && <span>ls:{field.letterSpacing}</span>}
          </div>
        </div>
      </div>

      {onUpdateSvg && (
        <div style={{ marginTop: '0.2rem', padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.55rem', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Container SVG (Fondo de texto)</div>
          <textarea
            value={field.containerSvg || ''}
            onChange={(e) => onUpdateSvg(e.target.value)}
            placeholder='Ej: <rect width="100%" height="100%" rx="10" fill="rgba(0,0,0,0.5)" />'
            style={{
              width: '100%',
              minHeight: '40px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none',
              padding: 0
            }}
          />
        </div>
      )}
    </div>
  );
}
