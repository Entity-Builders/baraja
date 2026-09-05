import type React from 'react';
import type {
  DeckCatalogCategoryDefinition,
  DeckCatalogCategoryId,
  DeckCatalogCollectionDefinition,
  DeckCatalogCollectionId,
} from '@entity-builders/deck-engine';

interface GenerationCatalogIntentFieldsProps {
  buyerSentence: string;
  catalogCategories: DeckCatalogCategoryDefinition[];
  catalogCategory: DeckCatalogCategoryId;
  catalogCollection: DeckCatalogCollectionId;
  catalogCollections: DeckCatalogCollectionDefinition[];
  deckMoment: string;
  generating: boolean;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  landingPromise: string;
  previewPolicy: string;
  onBuyerSentenceChange: (value: string) => void;
  onCatalogCategoryChange: (value: DeckCatalogCategoryId) => void;
  onCatalogCollectionChange: (value: DeckCatalogCollectionId) => void;
  onDeckMomentChange: (value: string) => void;
  onLandingPromiseChange: (value: string) => void;
  onPreviewPolicyChange: (value: string) => void;
}

export function GenerationCatalogIntentFields({
  buyerSentence,
  catalogCategories,
  catalogCategory,
  catalogCollection,
  catalogCollections,
  deckMoment,
  generating,
  inputStyle,
  labelStyle,
  landingPromise,
  previewPolicy,
  onBuyerSentenceChange,
  onCatalogCategoryChange,
  onCatalogCollectionChange,
  onDeckMomentChange,
  onLandingPromiseChange,
  onPreviewPolicyChange,
}: GenerationCatalogIntentFieldsProps) {
  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '1rem',
      background: 'rgba(212, 175, 100, 0.04)',
    }}>
      <label style={labelStyle}>Catalog & Landing Intent</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div>
          <span style={{ display: 'block', fontSize: '0.68rem', opacity: 0.45, marginBottom: '0.35rem' }}>
            Collection
          </span>
          <select
            value={catalogCollection}
            onChange={(event) => onCatalogCollectionChange(event.target.value as DeckCatalogCollectionId)}
            disabled={generating}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {catalogCollections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span style={{ display: 'block', fontSize: '0.68rem', opacity: 0.45, marginBottom: '0.35rem' }}>
            Category
          </span>
          <select
            value={catalogCategory}
            onChange={(event) => onCatalogCategoryChange(event.target.value as DeckCatalogCategoryId)}
            disabled={generating}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {catalogCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        value={deckMoment}
        onChange={(event) => onDeckMomentChange(event.target.value)}
        placeholder='Moment: e.g. "Amigos en una sobremesa necesitan salir de los temas de siempre."'
        disabled={generating}
        style={{ ...inputStyle, minHeight: '58px', resize: 'vertical', marginBottom: '0.75rem' }}
      />
      <input
        value={buyerSentence}
        onChange={(event) => onBuyerSentenceChange(event.target.value)}
        placeholder='Buyer sentence: e.g. "Necesito algo para que la noche no muera."'
        disabled={generating}
        style={{ ...inputStyle, marginBottom: '0.75rem' }}
      />
      <input
        value={landingPromise}
        onChange={(event) => onLandingPromiseChange(event.target.value)}
        placeholder="Landing promise: one sentence above the fold"
        disabled={generating}
        style={{ ...inputStyle, marginBottom: '0.75rem' }}
      />
      <textarea
        value={previewPolicy}
        onChange={(event) => onPreviewPolicyChange(event.target.value)}
        placeholder="Preview policy: what 1-3 cards should reveal without spoiling the deck"
        disabled={generating}
        style={{ ...inputStyle, minHeight: '58px', resize: 'vertical' }}
      />

      <p style={{ fontSize: '0.72rem', opacity: 0.45, margin: '0.75rem 0 0' }}>
        New editions are saved as unpublished catalog drafts with landing copy and preview guidance.
      </p>
    </div>
  );
}
