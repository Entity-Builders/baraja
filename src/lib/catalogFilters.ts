import type { DeckSchema } from '@eb-packages/deck-engine';
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

export function deckMatchesCatalogFilter(deck: DeckSchema, filterId: CatalogFilterId): boolean {
  return filterId === 'all' || getDeckCatalogFacet(deck).familyId === filterId;
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
