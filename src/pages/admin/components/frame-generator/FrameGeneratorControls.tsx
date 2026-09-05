import type { BarajaTemplateMetadata, CardType, DeckId } from '@entity-builders/deck-engine';
import { FrameCardConfigurationPanel } from './FrameCardConfigurationPanel';
import { FrameDimensionControls, type DimensionPreset } from './FrameDimensionControls';
import { FrameFaceSelector } from './FrameFaceSelector';
import { FramePromptPreviewPanel } from './FramePromptPreviewPanel';

interface FrameGeneratorControlsProps {
  artDirectorPreview: string;
  builderMetadata: BarajaTemplateMetadata;
  cardType: CardType;
  customHeight: number;
  customWidth: number;
  dimensionPresets: DimensionPreset[];
  dimPresetIdx: number;
  face: 'front' | 'back';
  structuralPreview: string;
  onAppendThemeInspiration: (label: string) => void;
  onCardTypeChange: (cardType: CardType) => void;
  onClearPrimaryColor: () => void;
  onClearThemeDescription: () => void;
  onCustomHeightChange: (height: number) => void;
  onCustomWidthChange: (width: number) => void;
  onDimensionPresetChange: (index: number) => void;
  onEnhanceThemeDescription: () => void;
  onFaceChange: (face: 'front' | 'back') => void;
  onPrimaryColorChange: (color: string) => void;
  onSelectDeck: (deckId: DeckId) => void;
  onThemeDescriptionChange: (description: string) => void;
}

export function FrameGeneratorControls({
  artDirectorPreview,
  builderMetadata,
  cardType,
  customHeight,
  customWidth,
  dimensionPresets,
  dimPresetIdx,
  face,
  structuralPreview,
  onAppendThemeInspiration,
  onCardTypeChange,
  onClearPrimaryColor,
  onClearThemeDescription,
  onCustomHeightChange,
  onCustomWidthChange,
  onDimensionPresetChange,
  onEnhanceThemeDescription,
  onFaceChange,
  onPrimaryColorChange,
  onSelectDeck,
  onThemeDescriptionChange,
}: FrameGeneratorControlsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <FrameFaceSelector face={face} onFaceChange={onFaceChange} />

      <FrameDimensionControls
        customHeight={customHeight}
        customWidth={customWidth}
        dimensionPresets={dimensionPresets}
        dimPresetIdx={dimPresetIdx}
        onCustomHeightChange={onCustomHeightChange}
        onCustomWidthChange={onCustomWidthChange}
        onDimensionPresetChange={onDimensionPresetChange}
      />

      <FrameCardConfigurationPanel
        builderMetadata={builderMetadata}
        cardType={cardType}
        onAppendThemeInspiration={onAppendThemeInspiration}
        onCardTypeChange={onCardTypeChange}
        onClearPrimaryColor={onClearPrimaryColor}
        onClearThemeDescription={onClearThemeDescription}
        onEnhanceThemeDescription={onEnhanceThemeDescription}
        onPrimaryColorChange={onPrimaryColorChange}
        onSelectDeck={onSelectDeck}
        onThemeDescriptionChange={onThemeDescriptionChange}
      />

      <FramePromptPreviewPanel
        artDirectorPreview={artDirectorPreview}
        structuralPreview={structuralPreview}
      />
    </div>
  );
}
