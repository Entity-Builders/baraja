import {
  getMusicBingoUsableSongPool,
  type MusicBingoBoardSize,
  type MusicBingoSong,
} from '@entity-builders/deck-engine';

export interface SyncedMusicBingoCatalogTrack {
  id: string | null;
  title: string;
  artistDisplayName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export interface SyncedMusicBingoCatalogCollection {
  id: string;
  title: string;
  description: string;
  spotifyPlaylistId: string | null;
  spotifyUrl: string | null;
  coverImageUrl: string | null;
  market: string;
  visibility: string;
  categoryId: string;
  categoryLabel: string;
  genreLabel: string;
  energyLabel: string;
  decadeLabel: string | null;
  useCaseLabel: string;
  occasionLabels: string[];
  supportedBoardSizes: MusicBingoBoardSize[];
  searchTerms: string[];
  tracks: SyncedMusicBingoCatalogTrack[];
  songCount: number;
  minimumSongCount: number;
  targetSongCount: number;
  seededSongCount: number | null;
  syncedAt: string | null;
}

export interface SyncedMusicBingoCatalogSongCounts {
  importedSongCount: number;
  usableSongCount: number;
  duplicateSongCount: number;
  catalogSongCount: number;
}

export type SyncedMusicBingoCatalogState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; collections: SyncedMusicBingoCatalogCollection[] }
  | { status: 'error'; message: string };

type SyncedMusicBingoCatalogResponse =
  | { ok: true; collections: SyncedMusicBingoCatalogCollection[] }
  | { ok: false; message: string };

export async function fetchSyncedMusicBingoCatalog(
  signal?: AbortSignal
): Promise<SyncedMusicBingoCatalogCollection[]> {
  const response = await fetch('/api/music-bingo/catalog', {
    credentials: 'same-origin',
    signal,
  });
  const payload = await readSyncedMusicBingoCatalogResponse(response);
  if (!payload.ok) {
    throw new Error(payload.message);
  }

  return payload.collections;
}

export function formatSyncedMusicBingoSongs(
  collection: SyncedMusicBingoCatalogCollection
): string[] {
  return getSyncedMusicBingoCollectionSongs(collection).map(
    (song) => `${song.artist} - ${song.title}`
  );
}

export function getSyncedMusicBingoCollectionSongs(
  collection: SyncedMusicBingoCatalogCollection
): MusicBingoSong[] {
  return getMusicBingoUsableSongPool(syncedCollectionTracksToSongs(collection)).usableSongs;
}

export function getSyncedMusicBingoCollectionSongCounts(
  collection: SyncedMusicBingoCatalogCollection
): SyncedMusicBingoCatalogSongCounts {
  const { duplicateCount, usableSongs } = getMusicBingoUsableSongPool(
    syncedCollectionTracksToSongs(collection)
  );

  return {
    importedSongCount: collection.tracks.length,
    usableSongCount: usableSongs.length,
    duplicateSongCount: duplicateCount,
    catalogSongCount: collection.songCount,
  };
}

function syncedCollectionTracksToSongs(
  collection: SyncedMusicBingoCatalogCollection
): MusicBingoSong[] {
  return collection.tracks.map((track, index) => ({
    id: track.id ?? `${collection.id}-${index + 1}`,
    artist: track.artistDisplayName,
    title: track.title,
    artworkUrl: track.imageUrl ?? undefined,
    spotifyTrackUrl: track.spotifyUrl ?? undefined,
  }));
}

async function readSyncedMusicBingoCatalogResponse(
  response: Response
): Promise<SyncedMusicBingoCatalogResponse> {
  try {
    const payload = await response.json() as unknown;
    if (
      isRecord(payload) &&
      payload.ok === true &&
      Array.isArray(payload.collections) &&
      payload.collections.every(isSyncedMusicBingoCatalogCollection)
    ) {
      return {
        ok: true,
        collections: payload.collections,
      };
    }
  } catch {
    // Fall through to safe failure.
  }

  return {
    ok: false,
    message: response.ok
      ? 'El catalogo sincronizado no devolvio una respuesta valida.'
      : 'No pudimos leer el catalogo sincronizado.',
  };
}

function isSyncedMusicBingoCatalogCollection(
  value: unknown
): value is SyncedMusicBingoCatalogCollection {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    (typeof value.spotifyPlaylistId === 'string' || value.spotifyPlaylistId === null) &&
    (typeof value.spotifyUrl === 'string' || value.spotifyUrl === null) &&
    (typeof value.coverImageUrl === 'string' || value.coverImageUrl === null) &&
    typeof value.market === 'string' &&
    typeof value.visibility === 'string' &&
    typeof value.categoryId === 'string' &&
    typeof value.categoryLabel === 'string' &&
    typeof value.genreLabel === 'string' &&
    typeof value.energyLabel === 'string' &&
    (typeof value.decadeLabel === 'string' || value.decadeLabel === null) &&
    typeof value.useCaseLabel === 'string' &&
    Array.isArray(value.occasionLabels) &&
    value.occasionLabels.every((item) => typeof item === 'string') &&
    Array.isArray(value.supportedBoardSizes) &&
    value.supportedBoardSizes.every(isSupportedBoardSize) &&
    Array.isArray(value.searchTerms) &&
    value.searchTerms.every((item) => typeof item === 'string') &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isSyncedMusicBingoCatalogTrack) &&
    typeof value.songCount === 'number' &&
    typeof value.minimumSongCount === 'number' &&
    typeof value.targetSongCount === 'number' &&
    (typeof value.seededSongCount === 'number' || value.seededSongCount === null) &&
    (typeof value.syncedAt === 'string' || value.syncedAt === null)
  );
}

function isSyncedMusicBingoCatalogTrack(value: unknown): value is SyncedMusicBingoCatalogTrack {
  return (
    isRecord(value) &&
    (typeof value.id === 'string' || value.id === null) &&
    typeof value.title === 'string' &&
    typeof value.artistDisplayName === 'string' &&
    (typeof value.imageUrl === 'string' || value.imageUrl === null) &&
    (typeof value.spotifyUrl === 'string' || value.spotifyUrl === null)
  );
}

function isSupportedBoardSize(value: unknown): value is MusicBingoBoardSize {
  return value === 3 || value === 4 || value === 5 || value === 6;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
