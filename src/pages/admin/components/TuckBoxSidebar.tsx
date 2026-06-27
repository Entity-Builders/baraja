import type {
  TuckBoxColors,
  TuckBoxDimensions,
} from '../../../lib/TuckBoxEngine';

interface TuckBoxSidebarProps {
  dims: TuckBoxDimensions;
  cardWidth: number;
  cardHeight: number;
  numCards: number;
  editionLabel: string;
  editionColors: TuckBoxColors;
  tolerance: number;
  thickness: number;
  bleed: number;
  isGeneratingPdf: boolean;
  onToleranceChange: (value: number) => void;
  onThicknessChange: (value: number) => void;
  onBleedChange: (value: number) => void;
  onDownloadSvg: () => void;
  onDownloadPdf: () => void;
}

export function TuckBoxSidebar({
  dims,
  cardWidth,
  cardHeight,
  numCards,
  editionLabel,
  editionColors,
  tolerance,
  thickness,
  bleed,
  isGeneratingPdf,
  onToleranceChange,
  onThicknessChange,
  onBleedChange,
  onDownloadSvg,
  onDownloadPdf,
}: TuckBoxSidebarProps) {
  return (
    <>
      <h3 style={{
        margin: '0 0 1rem', fontSize: '0.8rem', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: '#d4af64',
      }}>
        Caja
      </h3>

      <div style={{
        padding: '0.8rem', background: 'rgba(212,175,100,0.06)',
        borderRadius: '8px', borderLeft: '3px solid #d4af64',
        marginBottom: '1.2rem',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
          fontSize: '0.75rem',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Carta</div>
            <div style={{ color: '#d4af64', fontWeight: 700, fontSize: '0.9rem' }}>{cardWidth}×{cardHeight}<span style={{ fontSize: '0.6rem', opacity: 0.7 }}> mm</span></div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cartas</div>
            <div style={{ color: '#d4af64', fontWeight: 700, fontSize: '0.9rem' }}>{numCards}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Caja (W×H)</div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{dims.boxW.toFixed(1)}×{dims.boxH.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Profundidad</div>
            <div style={{ color: '#e88', fontWeight: 700, fontSize: '0.85rem' }}>{dims.boxD.toFixed(1)}<span style={{ fontSize: '0.6rem', opacity: 0.7 }}> mm</span></div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Edición</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: editionColors.primary }} />
              <span style={{ color: editionColors.secondary, fontWeight: 600, fontSize: '0.85rem' }}>{editionLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <h4 style={{
        margin: '0 0 0.8rem', fontSize: '0.7rem', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)',
      }}>
        ⚙️ Parámetros
      </h4>

      <SliderControl label="Tolerancia" value={tolerance} min={0.5} max={3} step={0.5} unit="mm" onChange={onToleranceChange} hint="Holgura entre carta y caja" />
      <SliderControl label="Grosor / carta" value={thickness} min={0.2} max={0.8} step={0.05} unit="mm" onChange={onThicknessChange} hint="300g ≈ 0.4mm, plastificado ≈ 0.5mm" />
      <SliderControl label="Sangría" value={bleed} min={0} max={5} step={1} unit="mm" onChange={onBleedChange} hint="Margen de sangría para corte" />

      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <h4 style={{
          margin: '0 0 0.5rem', fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'rgba(255,255,255,0.35)',
        }}>
          Leyenda
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '22px', height: '0px', borderTop: '1.5px solid #222' }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Línea de corte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '22px', height: '0px', borderTop: '1.5px dashed #888' }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Línea de plegado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '13px', height: '13px', background: editionColors.primary, borderRadius: '2px', opacity: 0.15 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Solapa de pegado</span>
          </div>
        </div>
      </div>

      <div style={{
        padding: '0.8rem', background: 'rgba(255,255,255,0.02)',
        borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.72rem', lineHeight: '1.7', marginBottom: '1.5rem',
      }}>
        <h4 style={{
          margin: '0 0 0.4rem', color: 'rgba(255,255,255,0.5)',
          fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          📌 Instrucciones
        </h4>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>
          <div>1. Descargá el PDF del troquel</div>
          <div>2. Imprimí en cartulina 250-300g</div>
          <div>3. Cortá las <strong>líneas sólidas</strong></div>
          <div>4. Plegá las <strong>líneas punteadas</strong></div>
          <div>5. Pegá las solapas con adhesivo</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={onDownloadPdf}
          disabled={isGeneratingPdf}
          style={{
            width: '100%', background: '#d4af64', color: '#000',
            padding: '0.7rem 1rem', borderRadius: '6px', border: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: isGeneratingPdf ? 'not-allowed' : 'pointer',
            opacity: isGeneratingPdf ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          {isGeneratingPdf ? '⏳ Generando PDF...' : '📥 Descargar PDF'}
        </button>
        <button
          onClick={onDownloadSvg}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)',
            padding: '0.5rem 1rem', borderRadius: '6px',
            fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          📐 Descargar SVG
        </button>
      </div>
    </>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>{label}</label>
        <span style={{
          fontSize: '0.75rem', color: '#d4af64', fontWeight: 700,
          background: 'rgba(212,175,100,0.1)', padding: '1px 6px', borderRadius: '4px',
        }}>
          {value}{unit && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}> {unit}</span>}
        </span>
      </div>
      <input
        type="range" value={value} min={min} max={max} step={step}
        onChange={event => onChange(Number(event.target.value))}
        style={{ width: '100%', accentColor: '#d4af64', cursor: 'pointer' }}
      />
      {hint && (
        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.1rem' }}>{hint}</div>
      )}
    </div>
  );
}
