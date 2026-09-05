import { LAYOUT_PRESETS, type BarajaTemplateMetadata, type CardLayout } from '@entity-builders/deck-engine';
import { labelStyle, sectionStyle } from '../../frameGeneratorStyles';

const MANUAL_LAYOUT_ZONES: Array<{ key: keyof CardLayout; label: string }> = [
  { key: 'hasHeaderZone', label: 'Top Header Zone' },
  { key: 'hasBodyZone', label: 'Middle Body Zone' },
  { key: 'hasCentralImageZone', label: 'Center Cutout' },
  { key: 'hasFooterZone', label: 'Bottom Footer Zone' },
];

interface FrameLayoutPanelProps {
  builderMetadata: BarajaTemplateMetadata;
  layoutPresetId: string;
  onSelectPreset: (id: string, layout: CardLayout) => void;
  onToggleZone: (key: keyof CardLayout, checked: boolean) => void;
}

export function FrameLayoutPanel({
  builderMetadata,
  layoutPresetId,
  onSelectPreset,
  onToggleZone,
}: FrameLayoutPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={sectionStyle}>
        <label style={labelStyle}>Layout de Zonas de Contenido</label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
          {Object.entries(LAYOUT_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              onClick={() => onSelectPreset(id, preset.layout)}
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${layoutPresetId === id ? 'var(--color-gold)' : 'rgba(255,255,255,0.08)'}`,
                background: layoutPresetId === id ? 'rgba(201,168,92,0.12)' : 'rgba(255,255,255,0.02)',
                color: layoutPresetId === id ? 'var(--color-gold)' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                textAlign: 'left',
                transition: 'all 0.15s',
                lineHeight: 1.3,
              }}
              onMouseOver={e => {
                if (layoutPresetId !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseOut={e => {
                if (layoutPresetId !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              <div style={{ fontWeight: layoutPresetId === id ? 600 : 400 }}>{preset.label}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '0.15rem' }}>{preset.description}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <label style={{ fontSize: '0.72rem', opacity: 0.6, display: 'block', marginBottom: '0.8rem', fontWeight: 600 }}>Zonas Manuales (Overrides)</label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.7rem' }}>
            {MANUAL_LAYOUT_ZONES.map(zone => (
              <label key={zone.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer', color: 'rgba(255,255,255,0.9)' }}>
                <input
                  type="checkbox"
                  checked={Boolean(builderMetadata.layout?.[zone.key])}
                  onChange={e => onToggleZone(zone.key, e.target.checked)}
                  style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>{zone.label}</span>
              </label>
            ))}

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer', marginTop: '0.5rem', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)' }}>
              <input
                type="checkbox"
                checked={Boolean(builderMetadata.layout?.borderless)}
                onChange={e => onToggleZone('borderless', e.target.checked)}
                style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Borderless (Fondo full-bleed sin marcos)</span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
