import {
  DECK_CATALOG_CATEGORIES,
  DECK_CATALOG_COLLECTIONS,
  type DeckCatalogCategoryId,
  type DeckCatalogCollectionId,
} from '@eb-packages/deck-engine';

export function getGenerationCatalogCollections() {
  return Object.values(DECK_CATALOG_COLLECTIONS).filter(
    collection => collection.id !== 'other'
  );
}

export function getGenerationCatalogCategories(collectionId: DeckCatalogCollectionId) {
  return Object.values(DECK_CATALOG_CATEGORIES).filter(
    category => category.collection === collectionId && category.id !== 'other'
  );
}

export function getFallbackCatalogCategory(
  collectionId: DeckCatalogCollectionId,
  currentCategoryId: DeckCatalogCategoryId,
): DeckCatalogCategoryId | null {
  const category = DECK_CATALOG_CATEGORIES[currentCategoryId];

  if (category?.collection === collectionId) {
    return null;
  }

  return getGenerationCatalogCategories(collectionId)[0]?.id ?? null;
}
