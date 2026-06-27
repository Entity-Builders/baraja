import { GENERATION_PRESETS, type GenerationPreset } from '../../generationPresets';
import {
  generationLabelStyle,
  getGenerationChipStyle,
} from '../../generationUi';

interface GenerationPresetButtonsProps {
  generating: boolean;
  onApplyPreset: (preset: GenerationPreset) => void;
}

export function GenerationPresetButtons({
  generating,
  onApplyPreset,
}: GenerationPresetButtonsProps) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <label style={generationLabelStyle}>Quick Presets</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {GENERATION_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onApplyPreset(preset)}
            disabled={generating}
            style={{
              ...getGenerationChipStyle(false, generating),
              borderRadius: '100px',
              fontSize: '0.75rem',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
