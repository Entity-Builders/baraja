import type React from 'react';
import type {
  DeckCatalogCategoryDefinition,
  DeckCatalogCategoryId,
  DeckCatalogCollectionDefinition,
  DeckCatalogCollectionId,
} from '@eb-packages/deck-engine';
import type { DeckType, TriviaDifficulty } from '../generationPayload';
import { GENERATION_PRESETS, type GenerationPreset } from '../generationPresets';
import { GenerationCatalogIntentFields } from '../GenerationCatalogIntentFields';
import type { EnrichedItem } from '../generationResponseParsers';
import {
  ART_STYLE_OPTIONS,
  CARD_COUNT_OPTIONS,
  DECK_TYPE_OPTIONS,
  TRIVIA_DIFFICULTY_OPTIONS,
  generationInputStyle,
  generationLabelStyle,
  getDifficultyHint,
  getFoundEnrichedItems,
  getGenerationChipStyle,
  getSeedItems,
  normalizeCardCount,
} from '../generationUi';

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
  onGenerate: (event: React.FormEvent) => void;
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
      <PresetButtons generating={generating} onApplyPreset={onApplyPreset} />

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
          <SeedItemsField
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

        <ActionButtons
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

function PresetButtons({
  generating,
  onApplyPreset,
}: {
  generating: boolean;
  onApplyPreset: (preset: GenerationPreset) => void;
}) {
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

function DeckTypeButtons({
  deckType,
  generating,
  onDeckTypeChange,
}: {
  deckType: DeckType;
  generating: boolean;
  onDeckTypeChange: (value: DeckType) => void;
}) {
  return (
    <div>
      <label style={generationLabelStyle}>Deck Type</label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {DECK_TYPE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onDeckTypeChange(option.key)}
            disabled={generating}
            style={getGenerationChipStyle(deckType === option.key, generating)}
            title={option.desc}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CardCountField({
  cardCount,
  generating,
  onCardCountChange,
}: {
  cardCount: number;
  generating: boolean;
  onCardCountChange: (value: number) => void;
}) {
  return (
    <div>
      <label style={generationLabelStyle}>Card Count</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {CARD_COUNT_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => onCardCountChange(count)}
            disabled={generating}
            style={getGenerationChipStyle(cardCount === count, generating)}
          >
            {count}
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={60}
          value={cardCount}
          onChange={(event) => onCardCountChange(normalizeCardCount(event.target.value))}
          disabled={generating}
          style={{ ...generationInputStyle, width: '70px', textAlign: 'center' }}
        />
      </div>
    </div>
  );
}

function TriviaDifficultyField({
  difficulty,
  generating,
  onDifficultyChange,
}: {
  difficulty: TriviaDifficulty;
  generating: boolean;
  onDifficultyChange: (value: TriviaDifficulty) => void;
}) {
  return (
    <div>
      <label style={generationLabelStyle}>Difficulty</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {TRIVIA_DIFFICULTY_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onDifficultyChange(option.key)}
            disabled={generating}
            style={getGenerationChipStyle(difficulty === option.key, generating, option.color)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '0.35rem' }}>
        {getDifficultyHint(difficulty)}
      </p>
    </div>
  );
}

function ArtStyleField({
  artStyle,
  generating,
  onArtStyleChange,
}: {
  artStyle: string;
  generating: boolean;
  onArtStyleChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={generationLabelStyle}>Art Style</label>
      <select
        value={artStyle}
        onChange={(event) => onArtStyleChange(event.target.value)}
        disabled={generating}
        style={{ ...generationInputStyle, cursor: 'pointer' }}
      >
        {ART_STYLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SeedItemsField({
  seedText,
  enrichedItems,
  enriching,
  generating,
  seedItemCount,
  onSeedTextChange,
  onEnrich,
}: {
  seedText: string;
  enrichedItems: EnrichedItem[];
  enriching: boolean;
  generating: boolean;
  seedItemCount: number;
  onSeedTextChange: (value: string) => void;
  onEnrich: () => void;
}) {
  const disabled = generating || enriching || seedItemCount === 0;

  return (
    <div>
      <label style={generationLabelStyle}>
        📦 Seed Items (one per line) — Enriched via TMDB
      </label>
      <textarea
        value={seedText}
        onChange={(event) => onSeedTextChange(event.target.value)}
        placeholder={'El Secreto de sus Ojos\nRelatos Salvajes\nNueve Reinas\nLa Historia Oficial\nEl Hijo de la Novia'}
        disabled={generating || enriching}
        style={{ ...generationInputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onEnrich}
          disabled={disabled}
          style={{
            ...getGenerationChipStyle(false, disabled, '#4ade80'),
            color: '#4ade80',
            borderColor: 'rgba(74, 222, 128, 0.3)',
          }}
        >
          {enriching ? '⏳ Enriching...' : `🔍 Enrich ${seedItemCount} items`}
        </button>
        {enrichedItems.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#4ade80', opacity: 0.8 }}>
            ✅ {enrichedItems.length} items enriched
          </span>
        )}
      </div>

      {enrichedItems.length > 0 && (
        <EnrichedItemsPreview items={enrichedItems} />
      )}
    </div>
  );
}

function EnrichedItemsPreview({ items }: { items: EnrichedItem[] }) {
  return (
    <div style={{
      marginTop: '0.75rem',
      maxHeight: '200px',
      overflowY: 'auto',
      background: '#0a0908',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.5rem 0.75rem',
    }}>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} style={{ fontSize: '0.75rem', lineHeight: 1.6, padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: 'var(--color-gold)' }}>{item.title}</span>
          <span style={{ opacity: 0.5 }}> ({item.year})</span>
          {item.director && <span style={{ opacity: 0.6 }}> — {item.director}</span>}
          {item.imdbRating && <span style={{ color: '#facc15' }}> ⭐ {item.imdbRating}</span>}
          {item.wikiExtract && <span style={{ marginLeft: '0.5rem', background: '#93c5fd', color: '#000', padding: '0 0.4rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 'bold' }}>+ WIKI LORE</span>}
          {item.poster && <img src={item.poster} alt="" style={{ width: 24, height: 36, borderRadius: 2, marginLeft: '0.5rem', verticalAlign: 'middle', objectFit: 'cover' }} />}
        </div>
      ))}
    </div>
  );
}

function ActionButtons({
  disabled,
  generating,
  onPreviewPrompt,
}: {
  disabled: boolean;
  generating: boolean;
  onPreviewPrompt: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <button
        type="button"
        onClick={onPreviewPrompt}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '0.75rem',
          background: 'transparent',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--radius-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.8rem',
          opacity: disabled ? 0.4 : 1,
          transition: 'all 0.2s',
        }}
      >
        📝 Preview Prompt
      </button>

      <button
        type="submit"
        disabled={disabled}
        className="btn-primary"
        style={{
          flex: 2,
          padding: '0.75rem',
          fontSize: '0.85rem',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {generating ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span className="spinner" />
            Generating...
          </span>
        ) : (
          '🃏 Generate Edition'
        )}
      </button>
    </div>
  );
}
