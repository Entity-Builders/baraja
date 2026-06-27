import {
  DECK_CATALOG_CATEGORIES,
  DECK_CATALOG_COLLECTIONS,
  type DeckCatalogCategoryId,
  type DeckCatalogCollectionId,
} from '@eb-packages/deck-engine';
import type { EnrichedItem } from './generationResponseParsers';

export type DeckType = 'trivia' | 'introspection' | 'party' | 'custom';
export type TriviaDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export interface GenerationPayloadInput {
  topic: string;
  cardCount: number;
  additionalContext: string;
  deckType: DeckType;
  difficulty: TriviaDifficulty;
  artStyle: string;
  enrichedData: EnrichedItem[] | null;
  catalogCollection: DeckCatalogCollectionId;
  catalogCategory: DeckCatalogCategoryId;
  deckMoment: string;
  buyerSentence: string;
  landingPromise: string;
  previewPolicy: string;
}

export function buildGenerationPayload(input: GenerationPayloadInput) {
  const validEnriched = input.enrichedData?.filter((item) => !item._notFound && !item._error) ?? [];
  const promptContext = buildPromptContext(input);
  const category = DECK_CATALOG_CATEGORIES[input.catalogCategory];

  return {
    topic: input.topic.trim(),
    cardCount: input.cardCount,
    additionalContext: promptContext || undefined,
    deckType: input.deckType,
    difficulty: input.deckType === 'trivia' ? input.difficulty : undefined,
    artStyle: input.artStyle || undefined,
    enrichedData: validEnriched.length > 0 ? validEnriched : undefined,
    digitalDraft: {
      catalog: {
        collection: input.catalogCollection,
        category: input.catalogCategory,
      },
      tags: [
        input.catalogCollection,
        input.catalogCategory,
        category.shortLabel.toLowerCase().replace(/\s+/g, '-'),
      ].filter(Boolean),
      landing: {
        hero_promise: input.landingPromise.trim() || undefined,
        hero_supporting_copy: buildHeroSupportingCopy(input) || undefined,
        preview_intro: input.previewPolicy.trim() || undefined,
        unlock_summary: buildUnlockSummary(input.catalogCollection),
      },
    },
  };
}

function buildHeroSupportingCopy(input: Pick<GenerationPayloadInput, 'deckMoment' | 'buyerSentence'>) {
  const parts = [
    input.deckMoment.trim() ? `Momento: ${input.deckMoment.trim()}` : '',
    input.buyerSentence.trim() ? `Comprador: ${input.buyerSentence.trim()}` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

function buildUnlockSummary(catalogCollection: DeckCatalogCollectionId) {
  const collection = DECK_CATALOG_COLLECTIONS[catalogCollection];
  return `El acceso completo desbloquea la sesión digital, las cartas del mazo y el paquete imprimible si esta edición lo incluye. Se guarda como draft de ${collection.label}.`;
}

function buildPromptContext(input: GenerationPayloadInput) {
  const collection = DECK_CATALOG_COLLECTIONS[input.catalogCollection];
  const category = DECK_CATALOG_CATEGORIES[input.catalogCategory];
  const sections = [
    input.additionalContext.trim(),
    [
      '## Catalog and Landing Intent',
      `- Collection: ${collection.label} (${collection.id})`,
      `- Category: ${category.label} (${category.id})`,
      input.deckMoment.trim() ? `- Moment: ${input.deckMoment.trim()}` : '',
      input.buyerSentence.trim() ? `- Buyer sentence: ${input.buyerSentence.trim()}` : '',
      input.landingPromise.trim() ? `- Landing promise: ${input.landingPromise.trim()}` : '',
      input.previewPolicy.trim() ? `- Preview policy: ${input.previewPolicy.trim()}` : '',
      '- Generate the deck as a Baraja catalog draft, not as a standalone prompt dump.',
      '- The name, description, cards, and tone must serve the moment and buyer sentence.',
      '- Do not sell the deck by raw card count; sell context fit, tone, and use.',
      '- Back copy hierarchy: instruction is the primary playable payload; phrase is only a short editorial hook unless this is a pure introspection/regulation deck.',
    ].filter(Boolean).join('\n'),
  ].filter(Boolean);

  return sections.join('\n\n') || undefined;
}
