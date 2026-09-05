import type { FormEvent } from 'react';
import type {
  DeckCatalogCategoryDefinition,
  DeckCatalogCategoryId,
  DeckCatalogCollectionDefinition,
  DeckCatalogCollectionId,
} from '@entity-builders/deck-engine';
import type { DeckType, TriviaDifficulty } from '../generationPayload';
import type { GenerationPreset } from '../generationPresets';
import { GenerationCatalogIntentFields } from '../GenerationCatalogIntentFields';
import type { EnrichedItem } from '../generationResponseParsers';
import {
  generationInputStyle,
  generationLabelStyle,
  getFoundEnrichedItems,
  getSeedItems,
} from '../generationUi';
import { GenerationActionButtons } from './generate-edition/GenerationActionButtons';
import {
  ArtStyleField,
  CardCountField,
  DeckTypeButtons,
  TriviaDifficultyField,
} from './generate-edition/GenerationOptionFields';
import { GenerationPresetButtons } from './generate-edition/GenerationPresetButtons';
import { GenerationSeedItemsField } from './generate-edition/GenerationSeedItemsField';

interface GenerateEditionFormProps {
  topic: string;
  cardCount: number;
  additionalContext: string;
  deckType: DeckType;
  difficulty: TriviaDifficulty;
  artStyle: string;
  catalogCollection: DeckCatalogCollectionId;
  catalogCategory: DeckCatalogCategoryId;
  catalogCollections: DeckCatalogCollectionDefinition[];
  catalogCategories: DeckCatalogCategoryDefinition[];
  deckMoment: string;
  buyerSentence: string;
  landingPromise: string;
  previewPolicy: string;
  seedText: string;
  enrichedData: EnrichedItem[] | null;
  enriching: boolean;
  generating: boolean;
  onApplyPreset: (preset: GenerationPreset) => void;
  onTopicChange: (value: string) => void;
  onCardCountChange: (value: number) => void;
  onAdditionalContextChange: (value: string) => void;
  onDeckTypeChange: (value: DeckType) => void;
  onDifficultyChange: (value: TriviaDifficulty) => void;
  onArtStyleChange: (value: string) => void;
  onCatalogCollectionChange: (value: DeckCatalogCollectionId) => void;
  onCatalogCategoryChange: (value: DeckCatalogCategoryId) => void;
  onDeckMomentChange: (value: string) => void;
  onBuyerSentenceChange: (value: string) => void;
  onLandingPromiseChange: (value: string) => void;
  onPreviewPolicyChange: (value: string) => void;
  onSeedTextChange: (value: string) => void;
  onEnrich: () => void;
  onPreviewPrompt: () => void;
  onGenerate: (event: FormEvent) => void;
}

export function GenerateEditionForm({
  topic,
  cardCount,
  additionalContext,
  deckType,
  difficulty,
  artStyle,
  catalogCollection,
  catalogCategory,
  catalogCollections,
  catalogCategories,
  deckMoment,
  buyerSentence,
  landingPromise,
  previewPolicy,
  seedText,
  enrichedData,
  enriching,
  generating,
  onApplyPreset,
  onTopicChange,
  onCardCountChange,
  onAdditionalContextChange,
  onDeckTypeChange,
  onDifficultyChange,
  onArtStyleChange,
  onCatalogCollectionChange,
  onCatalogCategoryChange,
  onDeckMomentChange,
  onBuyerSentenceChange,
  onLandingPromiseChange,
  onPreviewPolicyChange,
  onSeedTextChange,
  onEnrich,
  onPreviewPrompt,
  onGenerate,
}: GenerateEditionFormProps) {
  const isTrivia = deckType === 'trivia';
  const seedItems = getSeedItems(seedText);
  const foundEnrichedItems = getFoundEnrichedItems(enrichedData);
  const hasEnrichedData = foundEnrichedItems.length > 0;
  const disabledPrimaryAction = generating || !topic.trim();

  return (
    <div>
      <GenerationPresetButtons generating={generating} onApplyPreset={onApplyPreset} />

      <form onSubmit={onGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <DeckTypeButtons
          deckType={deckType}
          generating={generating}
          onDeckTypeChange={onDeckTypeChange}
        />

        <GenerationCatalogIntentFields
          buyerSentence={buyerSentence}
          catalogCategories={catalogCategories}
          catalogCategory={catalogCategory}
          catalogCollection={catalogCollection}
          catalogCollections={catalogCollections}
          deckMoment={deckMoment}
          generating={generating}
          inputStyle={generationInputStyle}
          labelStyle={generationLabelStyle}
          landingPromise={landingPromise}
          previewPolicy={previewPolicy}
          onBuyerSentenceChange={onBuyerSentenceChange}
          onCatalogCategoryChange={onCatalogCategoryChange}
          onCatalogCollectionChange={onCatalogCollectionChange}
          onDeckMomentChange={onDeckMomentChange}
          onLandingPromiseChange={onLandingPromiseChange}
          onPreviewPolicyChange={onPreviewPolicyChange}
        />

        <div>
          <label style={generationLabelStyle}>Topic / Theme *</label>
          <textarea
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder='e.g. "Trivia sobre cine argentino y latinoamericano"'
            disabled={generating}
            required
            style={{ ...generationInputStyle, minHeight: '70px', resize: 'vertical' }}
          />
        </div>

        <CardCountField
          cardCount={cardCount}
          generating={generating}
          onCardCountChange={onCardCountChange}
        />

        {isTrivia && (
          <TriviaDifficultyField
            difficulty={difficulty}
            generating={generating}
            onDifficultyChange={onDifficultyChange}
          />
        )}

        <ArtStyleField
          artStyle={artStyle}
          generating={generating}
          onArtStyleChange={onArtStyleChange}
        />

        {isTrivia && (
          <GenerationSeedItemsField
            seedText={seedText}
            enrichedItems={foundEnrichedItems}
            enriching={enriching}
            generating={generating}
            seedItemCount={seedItems.length}
            onSeedTextChange={onSeedTextChange}
            onEnrich={onEnrich}
          />
        )}

        <div>
          <label style={generationLabelStyle}>Additional Instructions (Optional)</label>
          <textarea
            value={additionalContext}
            onChange={(event) => onAdditionalContextChange(event.target.value)}
            placeholder="Tone, style notes, specific instructions... e.g. 'Use informal Argentine Spanish.'"
            disabled={generating}
            style={{ ...generationInputStyle, minHeight: '80px', resize: 'vertical' }}
          />
        </div>

        <GenerationActionButtons
          disabled={disabledPrimaryAction}
          generating={generating}
          onPreviewPrompt={onPreviewPrompt}
        />

        {!generating && topic.trim() && (
          <p style={{ fontSize: '0.7rem', opacity: 0.35, textAlign: 'center', marginTop: '-0.5rem' }}>
            Est. ~{Math.ceil(cardCount / 10) * 15}-{Math.ceil(cardCount / 10) * 25}s
            {hasEnrichedData ? ` · ${foundEnrichedItems.length} seed items enriched` : ''}
          </p>
        )}
      </form>
    </div>
  );
}
