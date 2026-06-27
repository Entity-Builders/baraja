import {
  DECKS,
  getDeckCatalogBreadcrumb as getSharedDeckCatalogBreadcrumb,
  getDeckCatalogFacet as getSharedDeckCatalogFacet,
  getPrintableAccess,
  getPreviewCards,
  getDeckSessionModes,
  type DeckCatalogCategoryId,
  type DeckCatalogCollectionId,
  type DeckCatalogBreadcrumbItem,
  type DeckSchema,
} from '@eb-packages/deck-engine';

export const DIGITAL_DECKS: DeckSchema[] = Object.values(DECKS).filter(
  (deck) => deck.digital?.is_published === true
);

export const FEATURED_DIGITAL_DECK = DIGITAL_DECKS[0] ?? null;

export type DeckCatalogFamilyId = DeckCatalogCollectionId;

export interface DeckCatalogFacet {
  familyId: DeckCatalogFamilyId;
  familyLabel: string;
  subcategory: string;
  summary: string;
  collectionId: DeckCatalogCollectionId;
  collectionLabel: string;
  categoryId: DeckCatalogCategoryId;
  categoryLabel: string;
}

export function findDigitalDeck(slug: string | undefined): DeckSchema | null {
  if (!slug) {
    return null;
  }

  return (
    DIGITAL_DECKS.find(
      (deck) => deck.slug === slug || deck.id === slug || deck.edition === slug
    ) ?? null
  );
}

export function formatDeckPrice(deck: DeckSchema): string {
  const amount = deck.pricing.amount / 100;
  const currency = deck.pricing.currency.toUpperCase();

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'ARS' ? 0 : 2,
  }).format(amount);
}

export function getDeckHeroImage(deck: DeckSchema): string | undefined {
  return getPreviewCards(deck, 1)[0]?.front.art_url ?? deck.cards[0]?.front.art_url;
}

export function hasPrintablePdf(deck: DeckSchema): boolean {
  return getPrintableAccess(deck)?.enabled === true;
}

export function getDeckPrintableVersion(deck: DeckSchema): string {
  return getPrintableAccess(deck)?.version ?? 'PDF descargable';
}

export function getDeckPrintableLabel(deck: DeckSchema): string {
  const version = getPrintableAccess(deck)?.version;

  return version ? `PDF descargable incluido · ${version}` : 'PDF descargable incluido';
}

export function hasVerifiedDigitalDeckAccess(deck: DeckSchema): boolean {
  void deck;
  return false;
}

export function getOwnedDigitalDecks(): DeckSchema[] {
  return DIGITAL_DECKS.filter((deck) => hasVerifiedDigitalDeckAccess(deck));
}

export function getDeckAudienceBadges(deck: DeckSchema): string[] {
  const badges = new Set<string>();

  if (deck.metadata.player_count) {
    badges.add(formatPlayerCount(deck.metadata.player_count));
  }

  if (deck.digital?.category === 'emotional-regulation') {
    badges.add('Salud mental');
  }

  if (deck.digital?.tags?.includes('introspeccion')) {
    badges.add('Introspección');
  }

  if (getDeckSessionModes(deck).includes('facilitator')) {
    badges.add('Facilitadores');
  }

  if (hasPrintablePdf(deck)) {
    badges.add('PDF imprimible');
  }

  badges.add(deck.language.toUpperCase());

  return Array.from(badges).slice(0, 5);
}

export function getDeckCatalogFacet(deck: DeckSchema): DeckCatalogFacet {
  const facet = getSharedDeckCatalogFacet(deck);

  return {
    familyId: facet.collectionId,
    familyLabel: facet.collectionLabel,
    subcategory: facet.categoryLabel,
    summary: facet.summary,
    collectionId: facet.collectionId,
    collectionLabel: facet.collectionLabel,
    categoryId: facet.categoryId,
    categoryLabel: facet.categoryLabel,
  };
}

export function getDeckCatalogBreadcrumb(deck: DeckSchema): DeckCatalogBreadcrumbItem[] {
  return getSharedDeckCatalogBreadcrumb(deck);
}

export function getRelatedDigitalDecks(deck: DeckSchema, limit = 3): DeckSchema[] {
  const currentTags = new Set(deck.digital?.tags ?? []);
  const currentModes = new Set(getDeckSessionModes(deck));

  return DIGITAL_DECKS.filter(
    (candidate) =>
      candidate.id !== deck.id &&
      candidate.slug !== deck.slug &&
      candidate.edition !== deck.edition
  )
    .map((candidate) => ({
      deck: candidate,
      score: getRelatedDeckScore(deck, candidate, currentTags, currentModes),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.deck.name.localeCompare(right.deck.name, 'es');
    })
    .slice(0, limit)
    .map((candidate) => candidate.deck);
}

export function formatDeckCategory(deck: DeckSchema): string {
  return getDeckCatalogFacet(deck).categoryLabel;
}

function getRelatedDeckScore(
  currentDeck: DeckSchema,
  candidate: DeckSchema,
  currentTags: Set<string>,
  currentModes: Set<string>
): number {
  let score = 0;

  if (candidate.digital?.category && candidate.digital.category === currentDeck.digital?.category) {
    score += 4;
  }

  if (candidate.language === currentDeck.language) {
    score += 1;
  }

  for (const tag of candidate.digital?.tags ?? []) {
    if (currentTags.has(tag)) {
      score += 2;
    }
  }

  for (const mode of getDeckSessionModes(candidate)) {
    if (currentModes.has(mode)) {
      score += 1;
    }
  }

  return score;
}

function formatPlayerCount(playerCount: string): string {
  if (playerCount.startsWith('1')) {
    return '1 jugador';
  }

  return playerCount;
}
