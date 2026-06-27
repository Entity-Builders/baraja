import { inputStyle, labelStyle, sectionStyle, selectStyle } from '../../frameGeneratorStyles';

export interface DimensionPreset {
  label: string;
  widthMm: number;
  heightMm: number;
}

interface FrameDimensionControlsProps {
  customHeight: number;
  customWidth: number;
  dimensionPresets: DimensionPreset[];
  dimPresetIdx: number;
  onCustomHeightChange: (height: number) => void;
  onCustomWidthChange: (width: number) => void;
  onDimensionPresetChange: (index: number) => void;
}

export function FrameDimensionControls({
  customHeight,
  customWidth,
  dimensionPresets,
  dimPresetIdx,
  onCustomHeightChange,
  onCustomWidthChange,
  onDimensionPresetChange,
}: FrameDimensionControlsProps) {
  return (
    <section style={sectionStyle}>
      <label style={labelStyle}>Dimensiones</label>
      <select
        value={dimPresetIdx}
        onChange={e => onDimensionPresetChange(Number(e.target.value))}
        style={selectStyle}
      >
        {dimensionPresets.map((preset, i) => (
          <option key={i} value={i}>{preset.label}</option>
        ))}
        <option value={dimensionPresets.length}>Custom...</option>
      </select>
      {dimPresetIdx === dimensionPresets.length && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Width (mm)</label>
            <input
              type="number"
              value={customWidth}
              onChange={e => onCustomWidthChange(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Height (mm)</label>
            <input
              type="number"
              value={customHeight}
              onChange={e => onCustomHeightChange(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </section>
  );
}
