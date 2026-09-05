import type { MusicBingoCreatorSongSource } from '@entity-builders/deck-engine';
import type { BarajaMusicBingoCheckoutSource } from '../../services/musicBingoCheckout';

export type MusicBingoCreatorEntry = 'chooser' | 'collection' | 'playlist';

export const MUSIC_BINGO_PRIMARY_CARD_COUNTS = [15, 30, 50] as const;

const CURATED_CATALOG_OFFERING_IDS: Record<string, string> = {
  'rock-argentino-esenciales': 'rock-argentino-prebuilt',
  'cumbia-cuarteto-argentina': 'cumbia-retro-prebuilt',
  'pop-latino-2000s': 'hits-2000-prebuilt',
};

export function getMusicBingoCreatorEntry(search: string): MusicBingoCreatorEntry {
  const params = new URLSearchParams(search);
  const entry = params.get('entry');

  if (entry === 'playlist' || params.get('spotifyPlaylistUrl')) return 'playlist';
  if (entry === 'collection' || params.get('catalogCollectionId') || params.get('tema')) {
    return 'collection';
  }

  return 'chooser';
}

export function getCuratedCatalogOfferingId(collectionId: string): string | null {
  return CURATED_CATALOG_OFFERING_IDS[collectionId] ?? null;
}

export function isCuratedMusicBingoSelection(
  source: MusicBingoCreatorSongSource,
  selectedSyncedCollectionId: string
): boolean {
  return source === 'baraja_theme' || Boolean(getCuratedCatalogOfferingId(selectedSyncedCollectionId));
}

export function getMusicBingoPricingSongSource(input: {
  source: MusicBingoCreatorSongSource;
  selectedSyncedCollectionId: string;
}): MusicBingoCreatorSongSource {
  return isCuratedMusicBingoSelection(input.source, input.selectedSyncedCollectionId)
    ? 'baraja_theme'
    : input.source;
}

export function getMusicBingoCheckoutSource(input: {
  source: MusicBingoCreatorSongSource;
  selectedSyncedCollectionId: string;
  spotifyImportSucceeded: boolean;
  hasSpotifyPlaylistUrl: boolean;
}): BarajaMusicBingoCheckoutSource {
  if (isCuratedMusicBingoSelection(input.source, input.selectedSyncedCollectionId)) {
    return 'curated_spotify';
  }

  if (input.spotifyImportSucceeded || input.hasSpotifyPlaylistUrl) return 'custom_spotify';
  return 'manual_fallback';
}

export function getMusicBingoCommercialThemeId(input: {
  source: MusicBingoCreatorSongSource;
  selectedSyncedCollectionId: string;
  themeId: string;
}): string {
  if (getCuratedCatalogOfferingId(input.selectedSyncedCollectionId)) {
    return input.selectedSyncedCollectionId;
  }

  return input.source === 'baraja_theme' ? input.themeId : 'custom_spotify';
}
