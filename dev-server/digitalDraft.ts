import type { RawDeckContent } from '@entity-builders/deck-engine';
import { cleanOptionalString } from './contentUtils';

type RawDigitalConfig = NonNullable<RawDeckContent['digital']>;
type DigitalDeckCategoryValue = NonNullable<RawDigitalConfig['category']>;
type DeckSessionModeValue = NonNullable<RawDigitalConfig['session_modes']>[number];

interface AdminDigitalDraftPayload {
  catalog?: {
    collection?: string;
    category?: string;
  };
  tags?: string[];
  landing?: {
    hero_promise?: string;
    hero_supporting_copy?: string;
    preview_intro?: string;
    unlock_summary?: string;
  };
}

interface GeneratedCardDraft {
  id?: unknown;
}

function normalizeDraftTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  return Array.from(
    new Set(
      tags
        .map((tag) => cleanOptionalString(tag))
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => tag.toLowerCase().replace(/\s+/g, '-'))
    )
  ).slice(0, 8);
}

function mapDraftDigitalCategory(deckType: unknown, catalogCategory: string | undefined): DigitalDeckCategoryValue {
  if (catalogCategory === 'language-practice') return 'language-learning';
  if (catalogCategory === 'facilitation' || catalogCategory === 'office') return 'team-building';
  if (catalogCategory === 'emotional-regulation' || catalogCategory === 'anxiety-pause' || catalogCategory === 'grounding') return 'emotional-regulation';
  if (catalogCategory === 'introspection' || catalogCategory === 'journaling' || catalogCategory === 'boundaries' || catalogCategory === 'decision-clarity') return 'introspection';

  if (
    catalogCategory === 'argentine-cinema' ||
    catalogCategory === 'romantic-comedy' ||
    catalogCategory === 'pop-culture' ||
    catalogCategory === 'football' ||
    catalogCategory === 'music' ||
    catalogCategory === 'argentina-latam'
  ) {
    return 'trivia';
  }

  if (catalogCategory && [
    'between-friends',
    'dinner-table',
    'party',
    'family',
    'dates',
    'first-date',
    'couple-reconnection',
    'playful-intimacy',
    'hard-conversations',
    'conversation',
    'confessions',
  ].includes(catalogCategory)) {
    return 'conversation';
  }

  if (deckType === 'trivia') return 'trivia';
  if (deckType === 'introspection') return 'introspection';
  if (deckType === 'party') return 'conversation';

  return 'other';
}

function getDraftSessionModes(
  deckType: unknown,
  catalogCategory: string | undefined
): DeckSessionModeValue[] {
  if (catalogCategory === 'first-date' || catalogCategory === 'couple-reconnection' || catalogCategory === 'playful-intimacy') {
    return ['pair', 'browse'];
  }

  if (catalogCategory === 'office' || catalogCategory === 'facilitation' || catalogCategory === 'feedback') {
    return ['group', 'facilitator', 'browse'];
  }

  if (catalogCategory === 'emotional-regulation' || catalogCategory === 'grounding' || catalogCategory === 'introspection') {
    return ['solo', 'daily-card', 'browse'];
  }

  if (deckType === 'trivia' || deckType === 'party') {
    return ['group', 'browse'];
  }

  return ['browse'];
}

function cleanDraftLandingCopy(landing: AdminDigitalDraftPayload['landing'] | undefined): RawDigitalConfig['landing'] | undefined {
  const cleaned = {
    hero_promise: cleanOptionalString(landing?.hero_promise),
    hero_supporting_copy: cleanOptionalString(landing?.hero_supporting_copy),
    preview_intro: cleanOptionalString(landing?.preview_intro),
    unlock_summary: cleanOptionalString(landing?.unlock_summary),
  };

  return Object.values(cleaned).some(Boolean) ? cleaned : undefined;
}

export function buildDraftDigitalConfig(
  digitalDraft: AdminDigitalDraftPayload | undefined,
  cards: GeneratedCardDraft[],
  deckType: unknown
): RawDigitalConfig {
  const collection = cleanOptionalString(digitalDraft?.catalog?.collection);
  const category = cleanOptionalString(digitalDraft?.catalog?.category);
  const sessionModes = getDraftSessionModes(deckType, category);

  return {
    is_published: false,
    category: mapDraftDigitalCategory(deckType, category),
    catalog: collection && category
      ? { collection, category } as RawDigitalConfig['catalog']
      : undefined,
    tags: normalizeDraftTags([
      ...(digitalDraft?.tags ?? []),
      collection,
      category,
    ]),
    landing: cleanDraftLandingCopy(digitalDraft?.landing),
    preview_card_ids: cards
      .map((card) => cleanOptionalString(card.id))
      .filter((cardId): cardId is string => Boolean(cardId))
      .slice(0, 3),
    default_session_mode: sessionModes[0],
    session_modes: sessionModes,
    access_scopes: ['single-deck'],
    sharing: {
      allow_card_share: true,
      allow_bulk_export: false,
    },
  };
}
