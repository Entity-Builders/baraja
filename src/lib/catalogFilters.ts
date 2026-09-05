import type { DeckSchema } from '@entity-builders/deck-engine';
import { getDeckCatalogFacet } from './digitalDeckCatalog';

export const CATALOG_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'self-work', label: 'Autoconocimiento' },
  { id: 'social-games', label: 'Juegos sociales' },
  { id: 'couples-dating', label: 'Parejas' },
  { id: 'team-tools', label: 'Equipos' },
  { id: 'trivia-games', label: 'Trivia' },
] as const;

export type CatalogFilterId = typeof CATALOG_FILTERS[number]['id'];

export interface CatalogFilterSummary {
  id: CatalogFilterId;
  label: string;
  count: number;
}

export function deckMatchesCatalogFilter(deck: DeckSchema, filterId: CatalogFilterId): boolean {
  return filterId === 'all' || getDeckCatalogFacet(deck).familyId === filterId;
}

export function getCatalogFilterSummaries(decks: DeckSchema[]): CatalogFilterSummary[] {
  const countsByFilter = new Map<CatalogFilterId, number>(
    CATALOG_FILTERS.map((filter) => [filter.id, filter.id === 'all' ? decks.length : 0])
  );

  for (const deck of decks) {
    const familyId = getDeckCatalogFacet(deck).familyId;

    if (isCatalogFilterId(familyId)) {
      countsByFilter.set(familyId, (countsByFilter.get(familyId) ?? 0) + 1);
    }
  }

  return CATALOG_FILTERS.map((filter) => ({
    ...filter,
    count: countsByFilter.get(filter.id) ?? 0,
  }));
}

export function getDecksByCatalogFilter(
  decks: DeckSchema[],
  filterId: CatalogFilterId
): DeckSchema[] {
  if (filterId === 'all') {
    return decks;
  }

  return decks.filter((deck) => deckMatchesCatalogFilter(deck, filterId));
}

export function getCatalogFilterFromSearch(search: string): CatalogFilterId {
  const value = new URLSearchParams(search).get('catalog');
  const filter = CATALOG_FILTERS.find((candidate) => candidate.id === value);

  return filter?.id ?? 'all';
}

export function formatCatalogPlayerCount(playerCount: string): string {
  return playerCount
    .replace('(Uso personal)', '')
    .replace('jugadores', 'jug.')
    .replace('personas', 'pers.')
    .trim();
}

function isCatalogFilterId(value: string): value is CatalogFilterId {
  return CATALOG_FILTERS.some((filter) => filter.id === value);
}
