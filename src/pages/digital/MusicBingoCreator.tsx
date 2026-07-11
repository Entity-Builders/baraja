import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
  MUSIC_BINGO_BAR_EVENT_OFFERING,
  MUSIC_BINGO_BOARD_SIZE_OPTIONS,
  MUSIC_BINGO_CARD_COUNT_OPTIONS,
  MUSIC_BINGO_CUSTOM_OFFERING,
  MUSIC_BINGO_MVP_THEMES,
  MUSIC_BINGO_PRODUCT,
  buildMusicBingoPrintPack,
  generateMusicBingoCards,
  getMusicBingoUsableSongPool,
  getMusicBingoPriceQuote,
  parseMusicBingoManualSongs,
  validateMusicBingoDraftSongs,
  type GeneratedMusicBingoCard,
  type MusicBingoBoardSize,
  type MusicBingoCreatorSongSource,
  type MusicBingoCreatorUseContext,
  type MusicBingoEventRuleProfile,
  type MusicBingoPlaylistFitReport,
  type MusicBingoPlaylistReference,
  type MusicBingoPrintPack,
  type MusicBingoSong,
  type MusicBingoTheme,
} from '@eb-packages/deck-engine';
import { parseSpotifyPlaylistId } from '@eb-packages/spotify-service';
import { BrandIcon } from '../../components/BrandIcon';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { getBarajaAcquisitionContext } from '../../lib/acquisitionAttribution';
import { getBarajaAnalyticsDistinctId, trackBarajaEvent } from '../../services/analytics';
import {
  BarajaMusicBingoCheckoutError,
  createBarajaMusicBingoValidationPdf,
  startBarajaMusicBingoCheckout,
  type BarajaMusicBingoCheckoutPackSnapshot,
} from '../../services/musicBingoCheckout';
import {
  fetchSyncedMusicBingoCatalog,
  formatSyncedMusicBingoSongs,
  getSyncedMusicBingoCollectionSongCounts,
  type SyncedMusicBingoCatalogCollection,
  type SyncedMusicBingoCatalogState,
} from './musicBingoCatalogApi';
import {
  getCuratedCatalogOfferingId,
  getMusicBingoCheckoutSource,
  getMusicBingoCommercialThemeId,
  getMusicBingoCreatorEntry,
  getMusicBingoPricingSongSource,
  isCuratedMusicBingoSelection,
  MUSIC_BINGO_PRIMARY_CARD_COUNTS,
} from './musicBingoCreatorFlow';
import { createMusicBingoPreviewPdfBlob } from './musicBingoPreviewPdf';

type MapWithInsertHelpers<K, V> = Map<K, V> & {
  getOrInsert?: (key: K, value: V) => V;
  getOrInsertComputed?: (key: K, callbackfn: (key: K) => V) => V;
};

function installPdfJsMapPolyfills() {
  const mapPrototype = Map.prototype as MapWithInsertHelpers<unknown, unknown>;

  if (!mapPrototype.getOrInsert) {
    Object.defineProperty(mapPrototype, 'getOrInsert', {
      configurable: true,
      value: function getOrInsert<K, V>(this: Map<K, V>, key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      },
    });
  }

  if (!mapPrototype.getOrInsertComputed) {
    Object.defineProperty(mapPrototype, 'getOrInsertComputed', {
      configurable: true,
      value: function getOrInsertComputed<K, V>(
        this: Map<K, V>,
        key: K,
        callbackfn: (key: K) => V
      ): V {
        if (this.has(key)) return this.get(key) as V;
        const value = callbackfn(key);
        this.set(key, value);
        return value;
      },
    });
  }
}

installPdfJsMapPolyfills();
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const CREATOR_ROUTE = '/bingo-musical/crear';
const CATALOG_ROUTE = '/bingo-musical/catalogo';
const CREATOR_SURFACE = 'music_bingo_creator';
const DEFAULT_THEME = MUSIC_BINGO_MVP_THEMES[0];
const DEFAULT_USE_CONTEXT: MusicBingoCreatorUseContext = 'private_event';
const DEFAULT_CARD_COUNT =
  MUSIC_BINGO_CARD_COUNT_OPTIONS.find((option) => option.cardCount === 30)?.cardCount ??
  MUSIC_BINGO_CARD_COUNT_OPTIONS[0].cardCount;
const DEFAULT_PLAYLIST_URL = DEFAULT_THEME.playlist?.url ?? '';
const CHECKOUT_EMAIL_STORAGE_KEY = 'baraja_music_bingo_checkout_email';
const DEFAULT_CHECKOUT_EMAIL_PLACEHOLDER = 'tu@email.com';
const SPOTIFY_CACHE_TTL_MS = 10 * 60 * 1000;
const SPOTIFY_USER_PLAYLISTS_CACHE_KEY = 'baraja_spotify_user_playlists_v1';
const SPOTIFY_PLAYLIST_IMPORT_CACHE_PREFIX = 'baraja_spotify_playlist_import_v1';
const SPOTIFY_USER_PLAYLISTS_REQUEST_LIMIT = 250;
const BARAJA_MUSIC_BINGO_PLAYLIST_MARKERS = [
  'baraja bingo',
  'bingo musical baraja',
  'bingo musical',
];

const DELIVERABLES = [
  'Cartones imprimibles',
  'Hoja de control',
  'Reglas y variantes',
  'Guía de impresión',
  'Guía de dinámica',
  'QR opcional',
];

function getThemeById(themeId: string): MusicBingoTheme {
  return MUSIC_BINGO_MVP_THEMES.find((theme) => theme.id === themeId) ?? DEFAULT_THEME;
}

function getExplicitThemeById(themeId: string | null): MusicBingoTheme | undefined {
  if (!themeId) return undefined;
  return MUSIC_BINGO_MVP_THEMES.find((theme) => theme.id === themeId);
}

function getInitialThemeFromSearch(search: string): MusicBingoTheme {
  const themeId = new URLSearchParams(search).get('tema');
  return getExplicitThemeById(themeId) ?? DEFAULT_THEME;
}

function getInitialCardCountFromSearch(search: string): number | undefined {
  const rawCardCount = new URLSearchParams(search).get('cartones');
  if (!rawCardCount) return undefined;

  const parsedCardCount = Number(rawCardCount);
  return MUSIC_BINGO_CARD_COUNT_OPTIONS.some((option) => option.cardCount === parsedCardCount)
    ? parsedCardCount
    : undefined;
}

function getThemeByPlaylistUrl(playlistUrl: string): MusicBingoTheme | undefined {
  const normalizedUrl = playlistUrl.trim();
  return MUSIC_BINGO_MVP_THEMES.find((theme) => theme.playlist?.url === normalizedUrl);
}

function getSourceLabel(
  source: MusicBingoCreatorSongSource,
  theme: MusicBingoTheme,
  isCuratedSelection: boolean
): string {
  if (!isCuratedSelection) return 'Playlist propia de Spotify';
  return source === 'baraja_theme' ? `Coleccion Baraja: ${theme.title}` : 'Coleccion Baraja';
}

function getOfferingId(
  source: MusicBingoCreatorSongSource,
  theme: MusicBingoTheme,
  useContext: MusicBingoCreatorUseContext,
  selectedSyncedCollectionId: string
): string {
  if (useContext === 'venue_event' || useContext === 'professional_facilitation') {
    return MUSIC_BINGO_BAR_EVENT_OFFERING.id;
  }

  return (
    getCuratedCatalogOfferingId(selectedSyncedCollectionId) ??
    (source === 'baraja_theme' ? theme.offeringId : MUSIC_BINGO_CUSTOM_OFFERING.id)
  );
}

function buildOrderMessage(input: {
  gameName: string;
  useContext: MusicBingoCreatorUseContext;
  source: MusicBingoCreatorSongSource;
  theme: MusicBingoTheme;
  isCuratedSelection: boolean;
  songs: MusicBingoSong[];
  cardCount: number;
  freeSpace: boolean;
  boardSize: MusicBingoBoardSize;
  priceLabel: string;
  playlist?: MusicBingoPlaylistReference;
  playlistFit: MusicBingoPlaylistFitReport;
  eventRuleProfile: MusicBingoEventRuleProfile;
}): string {
  const previewSongs = input.songs
    .slice(0, 12)
    .map((song) => `- ${song.artist} - ${song.title}`)
    .join('\n');

  return [
    'Hola, quiero armar un Bingo Musical con Baraja.',
    '',
    `Nombre del juego: ${input.gameName}`,
    `Fuente: ${getSourceLabel(input.source, input.theme, input.isCuratedSelection)}`,
    `Cartones: ${input.cardCount}`,
    `Grid: ${input.boardSize} x ${input.boardSize}`,
    `Canciones cargadas: ${input.songs.length}`,
    `Fit playlist: ${input.playlistFit.summary}`,
    `Regla del juego: ${input.eventRuleProfile.label}`,
    `Casillero libre: ${input.freeSpace ? 'Si' : 'No'}`,
    `Precio/alcance: ${input.priceLabel}`,
    input.playlist
      ? `Playlist publica sugerida: ${input.playlist.title} (${input.playlist.url})`
      : 'Playlist propia: enviada como listado de canciones',
    '',
    'Entregables que necesito:',
    ...DELIVERABLES.map((deliverable) => `- ${deliverable}`),
    '',
    'Primeras canciones:',
    previewSongs || '- A definir',
    '',
    MUSIC_BINGO_PRODUCT.legal.summary,
  ].join('\n');
}

function trackCreatorEvent(
  event:
    | 'baraja_music_bingo_creator_started'
    | 'baraja_music_bingo_song_source_selected'
    | 'baraja_music_bingo_songs_validated'
    | 'baraja_music_bingo_card_count_selected'
    | 'baraja_music_bingo_grid_size_selected'
    | 'baraja_music_bingo_preview_generated'
    | 'baraja_music_bingo_price_viewed'
    | 'baraja_music_bingo_playlist_opened'
    | 'baraja_music_bingo_order_started'
    | 'baraja_music_bingo_checkout_started',
  properties: Record<string, unknown> = {}
) {
  trackBarajaEvent(event, {
    route: CREATOR_ROUTE,
    surface: CREATOR_SURFACE,
    ...properties,
  });
}

type SpotifyImportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      authStatus?: SpotifyImportAuthStatus;
      playlist: SpotifyImportedPlaylistPreview;
      songCount: number;
    }
  | { status: 'fallback'; message: string };

type SpotifyConnectionState =
  | { status: 'checking'; configured: false; connected: false }
  | { status: 'ready'; configured: boolean; connected: boolean };

type PlaylistModalTab = 'baraja' | 'spotify' | 'url';
type CreatorWizardStep = 1 | 2 | 3;

type SpotifyUserPlaylistsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; playlists: SpotifyUserPlaylistPreview[] }
  | { status: 'error'; message: string };

interface SpotifyImportedTrackPreview {
  id: string | null;
  title: string;
  artistDisplayName: string;
  imageUrl: string | null;
}

interface SpotifyImportedPlaylistPreview {
  id?: string;
  name: string;
  description?: string | null;
  ownerDisplayName?: string | null;
  spotifyUrl?: string;
  coverImageUrl?: string | null;
  importedTrackCount: number;
  totalTracks: number | null;
  importSource?: 'web_api' | 'public_page';
  isPartial?: boolean;
  tracks: SpotifyImportedTrackPreview[];
}

interface SpotifyImportAuthStatus {
  connected: boolean;
  attempted: boolean;
  fallbackReason?: string;
  fallbackStatus?: number;
}

interface SpotifyPlaylistImportSuccess {
  ok: true;
  playlist: SpotifyImportedPlaylistPreview;
  spotifyAuth?: SpotifyImportAuthStatus;
  musicBingoSongs: string[];
}

interface SpotifyPlaylistImportFailure {
  ok: false;
  reason: string;
  message: string;
}

type SpotifyPlaylistImportResponse = SpotifyPlaylistImportSuccess | SpotifyPlaylistImportFailure;

interface SpotifySessionResponse {
  configured: boolean;
  connected: boolean;
}

interface SpotifyUserPlaylistPreview {
  id: string;
  name: string;
  description: string | null;
  ownerDisplayName: string | null;
  spotifyUrl: string;
  coverImageUrl: string | null;
  totalTracks: number | null;
  isCollaborative: boolean;
  isPublic: boolean | null;
}

type SpotifyUserPlaylistsResponse =
  | { ok: true; playlists: SpotifyUserPlaylistPreview[] }
  | { ok: false; reason: string; message: string };

interface ActivePlaylistSummary {
  title: string;
  eyebrow: string;
  meta: string;
  coverImageUrl: string | null;
  fallbackInitials: string;
}

type PlaylistCatalogPickerItem =
  | { kind: 'theme'; theme: MusicBingoTheme }
  | { kind: 'synced_collection'; collection: SyncedMusicBingoCatalogCollection };

interface SpotifyUserPlaylistsCachePayload {
  cachedAt: number;
  playlists: SpotifyUserPlaylistPreview[];
}

interface SpotifyPlaylistImportCachePayload {
  cachedAt: number;
  response: SpotifyPlaylistImportSuccess;
}

async function readSpotifyImportResponse(response: Response): Promise<SpotifyPlaylistImportResponse> {
  try {
    const payload = await response.json() as unknown;
    if (isSpotifyImportResponse(payload)) {
      return payload;
    }
  } catch {
    // Fall through to a safe user-facing failure below.
  }

  return {
    ok: false,
    reason: response.ok ? 'spotify_error' : 'network_error',
    message: 'El importador de Spotify no devolvio una respuesta valida.',
  };
}

async function readSpotifyUserPlaylistsResponse(response: Response): Promise<SpotifyUserPlaylistsResponse> {
  try {
    const payload = await response.json() as unknown;
    if (isSpotifyUserPlaylistsResponse(payload)) {
      return payload;
    }
  } catch {
    // Fall through to safe failure below.
  }

  return {
    ok: false,
    reason: response.ok ? 'spotify_error' : 'network_error',
    message: 'No pudimos leer tus playlists de Spotify.',
  };
}

async function readSpotifySessionResponse(response: Response): Promise<SpotifySessionResponse> {
  try {
    const payload = await response.json() as unknown;
    if (
      isRecord(payload) &&
      typeof payload.configured === 'boolean' &&
      typeof payload.connected === 'boolean'
    ) {
      return {
        configured: payload.configured,
        connected: payload.connected,
      };
    }
  } catch {
    // Use a closed state below if the status endpoint is unavailable.
  }

  return {
    configured: false,
    connected: false,
  };
}

function readCachedSpotifyUserPlaylists(): SpotifyUserPlaylistPreview[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(SPOTIFY_USER_PLAYLISTS_CACHE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as unknown;
    if (!isSpotifyUserPlaylistsCachePayload(payload)) return null;
    if (Date.now() - payload.cachedAt > SPOTIFY_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(SPOTIFY_USER_PLAYLISTS_CACHE_KEY);
      return null;
    }

    return payload.playlists;
  } catch {
    return null;
  }
}

function writeCachedSpotifyUserPlaylists(playlists: SpotifyUserPlaylistPreview[]) {
  if (typeof window === 'undefined') return;

  try {
    const payload: SpotifyUserPlaylistsCachePayload = {
      cachedAt: Date.now(),
      playlists,
    };
    window.sessionStorage.setItem(SPOTIFY_USER_PLAYLISTS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Session cache is only an optimization.
  }
}

function clearCachedSpotifyUserPlaylists() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(SPOTIFY_USER_PLAYLISTS_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function readCachedSpotifyPlaylistImport(playlistUrl: string): SpotifyPlaylistImportSuccess | null {
  if (typeof window === 'undefined') return null;

  try {
    const cacheKey = getSpotifyPlaylistImportCacheKey(playlistUrl);
    if (!cacheKey) return null;

    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;

    const payload = JSON.parse(raw) as unknown;
    if (!isSpotifyPlaylistImportCachePayload(payload)) return null;
    if (Date.now() - payload.cachedAt > SPOTIFY_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    return payload.response;
  } catch {
    return null;
  }
}

function writeCachedSpotifyPlaylistImport(playlistUrl: string, response: SpotifyPlaylistImportSuccess) {
  if (typeof window === 'undefined') return;

  try {
    const cacheKey = getSpotifyPlaylistImportCacheKey(playlistUrl);
    if (!cacheKey) return;

    const payload: SpotifyPlaylistImportCachePayload = {
      cachedAt: Date.now(),
      response,
    };
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Session cache is only an optimization.
  }
}

function getSpotifyPlaylistImportCacheKey(playlistUrl: string): string | null {
  const playlistId = parseSpotifyPlaylistId(playlistUrl);
  return playlistId ? `${SPOTIFY_PLAYLIST_IMPORT_CACHE_PREFIX}:${playlistId}` : null;
}

function isSpotifyImportResponse(value: unknown): value is SpotifyPlaylistImportResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;

  if (value.ok === false) {
    return typeof value.reason === 'string' && typeof value.message === 'string';
  }

  const playlist = isRecord(value.playlist) ? value.playlist : null;
  return (
    Boolean(playlist) &&
    typeof playlist?.name === 'string' &&
    typeof playlist?.importedTrackCount === 'number' &&
    (typeof playlist?.totalTracks === 'number' || playlist?.totalTracks === null) &&
    (
      playlist?.importSource === undefined ||
      playlist.importSource === 'web_api' ||
      playlist.importSource === 'public_page'
    ) &&
    (playlist?.isPartial === undefined || typeof playlist?.isPartial === 'boolean') &&
    Array.isArray(playlist?.tracks) &&
    playlist.tracks.every(isSpotifyImportedTrackPreview) &&
    (value.spotifyAuth === undefined || isSpotifyImportAuthStatus(value.spotifyAuth)) &&
    Array.isArray(value.musicBingoSongs) &&
    value.musicBingoSongs.every((song) => typeof song === 'string')
  );
}

function isSpotifyImportAuthStatus(value: unknown): value is SpotifyImportAuthStatus {
  if (!isRecord(value)) return false;

  return (
    typeof value.connected === 'boolean' &&
    typeof value.attempted === 'boolean' &&
    (value.fallbackReason === undefined || typeof value.fallbackReason === 'string') &&
    (value.fallbackStatus === undefined || typeof value.fallbackStatus === 'number')
  );
}

function isSpotifyUserPlaylistsResponse(value: unknown): value is SpotifyUserPlaylistsResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;

  if (value.ok === false) {
    return typeof value.reason === 'string' && typeof value.message === 'string';
  }

  return Array.isArray(value.playlists) && value.playlists.every(isSpotifyUserPlaylistPreview);
}

function isSpotifyUserPlaylistPreview(value: unknown): value is SpotifyUserPlaylistPreview {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    (typeof value.ownerDisplayName === 'string' || value.ownerDisplayName === null) &&
    typeof value.spotifyUrl === 'string' &&
    (typeof value.coverImageUrl === 'string' || value.coverImageUrl === null) &&
    (typeof value.totalTracks === 'number' || value.totalTracks === null) &&
    typeof value.isCollaborative === 'boolean' &&
    (typeof value.isPublic === 'boolean' || value.isPublic === null)
  );
}

function isSpotifyUserPlaylistsCachePayload(value: unknown): value is SpotifyUserPlaylistsCachePayload {
  return (
    isRecord(value) &&
    typeof value.cachedAt === 'number' &&
    Array.isArray(value.playlists) &&
    value.playlists.every(isSpotifyUserPlaylistPreview)
  );
}

function isSpotifyPlaylistImportCachePayload(value: unknown): value is SpotifyPlaylistImportCachePayload {
  return (
    isRecord(value) &&
    typeof value.cachedAt === 'number' &&
    isSpotifyImportResponse(value.response) &&
    value.response.ok === true
  );
}

function isSpotifyImportedTrackPreview(value: unknown): value is SpotifyImportedTrackPreview {
  if (!isRecord(value)) return false;

  return (
    (typeof value.id === 'string' || value.id === null) &&
    typeof value.title === 'string' &&
    typeof value.artistDisplayName === 'string' &&
    (typeof value.imageUrl === 'string' || value.imageUrl === null)
  );
}

function getSpotifyImportFallbackMessage(result: SpotifyPlaylistImportFailure): string {
  switch (result.reason) {
    case 'not_configured':
      return 'El importador de Spotify todavia no esta configurado en este entorno.';
    case 'access_denied':
      return 'Spotify no permite leer esta playlist con la conexion configurada.';
    case 'rate_limited':
      return 'Spotify limito temporalmente la importacion.';
    case 'invalid_url':
      return 'Pega una URL valida de playlist de Spotify.';
    default:
      return 'No pudimos importar esta playlist desde Spotify.';
  }
}

function getSelectedSpotifyUserPlaylist(
  playlistUrl: string,
  state: SpotifyUserPlaylistsState
): SpotifyUserPlaylistPreview | null {
  if (state.status !== 'success') return null;

  const playlistId = parseSpotifyPlaylistId(playlistUrl);
  if (!playlistId) return null;

  return state.playlists.find((playlist) => playlist.id === playlistId) ?? null;
}

function getSyncedCollectionById(
  collections: SyncedMusicBingoCatalogCollection[],
  collectionId: string | null
): SyncedMusicBingoCatalogCollection | null {
  if (!collectionId) return null;
  return collections.find((collection) => collection.id === collectionId) ?? null;
}

function getSyncedCollectionByPlaylistUrl(
  collections: SyncedMusicBingoCatalogCollection[],
  playlistUrl: string
): SyncedMusicBingoCatalogCollection | null {
  const trimmedPlaylistUrl = playlistUrl.trim();
  if (!trimmedPlaylistUrl) return null;

  const playlistId = parseSpotifyPlaylistId(trimmedPlaylistUrl);
  return collections.find((collection) => {
    if (collection.spotifyUrl === trimmedPlaylistUrl) return true;
    return Boolean(playlistId && collection.spotifyPlaylistId === playlistId);
  }) ?? null;
}

function getPlaylistCatalogPickerItems(
  syncedCollections: SyncedMusicBingoCatalogCollection[]
): PlaylistCatalogPickerItem[] {
  if (syncedCollections.length > 0) {
    return syncedCollections.map((collection) => ({
      kind: 'synced_collection',
      collection,
    }));
  }

  return MUSIC_BINGO_MVP_THEMES.map((theme) => ({
    kind: 'theme',
    theme,
  }));
}

function getPickerItemId(item: PlaylistCatalogPickerItem): string {
  return item.kind === 'theme' ? item.theme.id : item.collection.id;
}

function getPickerItemTitle(item: PlaylistCatalogPickerItem): string {
  return item.kind === 'theme'
    ? item.theme.playlist?.title ?? item.theme.title
    : item.collection.title;
}

function getPickerItemSpotifyUrl(item: PlaylistCatalogPickerItem): string {
  return item.kind === 'theme'
    ? item.theme.playlist?.url ?? ''
    : item.collection.spotifyUrl ?? '';
}

function formatPlaylistBoardSizes(boardSizes: MusicBingoBoardSize[]): string {
  return boardSizes.map((boardSize) => `${boardSize}x${boardSize}`).join(' / ');
}

function getPickerItemSearchText(item: PlaylistCatalogPickerItem): string {
  if (item.kind === 'theme') {
    const theme = item.theme;
    return [
      theme.title,
      theme.summary,
      theme.playlist?.title,
      theme.catalog.categoryLabel,
      theme.catalog.genreLabel,
      theme.catalog.energyLabel,
      theme.catalog.decadeLabel,
      theme.catalog.useCaseLabel,
      theme.catalog.occasionLabels.join(' '),
      theme.catalog.searchTerms.join(' '),
      theme.tags.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  const collection = item.collection;
  return [
    collection.title,
    collection.description,
    collection.categoryLabel,
    collection.genreLabel,
    collection.energyLabel,
    collection.decadeLabel,
    collection.useCaseLabel,
    collection.occasionLabels.join(' '),
    collection.searchTerms.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildSpotifyImportStateFromSyncedCollection(
  collection: SyncedMusicBingoCatalogCollection
): Extract<SpotifyImportState, { status: 'success' }> {
  const songCounts = getSyncedMusicBingoCollectionSongCounts(collection);
  const totalTracks = Math.max(
    collection.songCount,
    songCounts.importedSongCount,
    songCounts.usableSongCount
  );

  return {
    status: 'success',
    playlist: {
      id: collection.spotifyPlaylistId ?? collection.id,
      name: collection.title,
      description: collection.description,
      ownerDisplayName: 'Baraja',
      spotifyUrl: collection.spotifyUrl ?? undefined,
      coverImageUrl: collection.coverImageUrl,
      importedTrackCount: songCounts.importedSongCount,
      totalTracks,
      importSource: 'web_api',
      isPartial: songCounts.importedSongCount < totalTracks,
      tracks: collection.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artistDisplayName: track.artistDisplayName,
        imageUrl: track.imageUrl,
      })),
    },
    songCount: songCounts.usableSongCount,
  };
}

function buildActivePlaylistSummary(input: {
  playlistUrl: string;
  source: MusicBingoCreatorSongSource;
  theme: MusicBingoTheme;
  isCuratedSelection: boolean;
  spotifyImportState: SpotifyImportState;
  selectedSpotifyPlaylist: SpotifyUserPlaylistPreview | null;
  connectionLabel: string;
}): ActivePlaylistSummary {
  if (input.isCuratedSelection) {
    const themePlaylist = input.source === 'baraja_theme' ? input.theme.playlist : undefined;
    const successfulImport = input.spotifyImportState.status === 'success'
      ? input.spotifyImportState
      : null;
    const usableSongCount = successfulImport
      ? successfulImport.songCount
      : getMusicBingoUsableSongPool(input.theme.songs).usableSongs.length;
    return {
      title: successfulImport?.playlist.name ?? themePlaylist?.title ?? input.theme.title,
      eyebrow: 'Coleccion Baraja',
      meta: `${usableSongCount} canciones - ${input.connectionLabel}`,
      coverImageUrl:
        successfulImport?.playlist.coverImageUrl ??
        themePlaylist?.coverImageUrl ??
        input.theme.songs[0]?.artworkUrl ??
        null,
      fallbackInitials: getPlaylistInitials(
        successfulImport?.playlist.name ?? themePlaylist?.title ?? input.theme.title
      ),
    };
  }

  if (input.spotifyImportState.status === 'success') {
    const playlist = input.spotifyImportState.playlist;
    const usableTrackCount = input.spotifyImportState.songCount;
    const importedTrackCount = playlist.importedTrackCount;
    const totalTrackCount = playlist.totalTracks ?? importedTrackCount;
    const importedLabel = getSpotifyImportedSongCountLabel({
      usableTrackCount,
      importedTrackCount,
      totalTrackCount,
      isPartial: playlist.isPartial === true,
    });
    return {
      title: playlist.name,
      eyebrow: playlist.ownerDisplayName ?? 'Playlist de Spotify',
      meta: `${importedLabel} - ${input.connectionLabel}`,
      coverImageUrl: playlist.coverImageUrl ?? playlist.tracks[0]?.imageUrl ?? null,
      fallbackInitials: getPlaylistInitials(playlist.name),
    };
  }

  if (input.selectedSpotifyPlaylist) {
    const playlist = input.selectedSpotifyPlaylist;
    return {
      title: playlist.name,
      eyebrow: playlist.ownerDisplayName ?? 'Tu Spotify',
      meta: `${playlist.totalTracks ?? '-'} canciones - ${input.connectionLabel}`,
      coverImageUrl: playlist.coverImageUrl,
      fallbackInitials: getPlaylistInitials(playlist.name),
    };
  }

  const playlistId = parseSpotifyPlaylistId(input.playlistUrl);
  return {
    title: playlistId ? 'Playlist de Spotify' : 'Sin playlist seleccionada',
    eyebrow: playlistId ? 'Importacion pendiente' : 'Elegir la música',
    meta: playlistId
      ? `Esperando metadata - ${input.connectionLabel}`
      : 'Elegi una coleccion Baraja o una playlist de Spotify.',
    coverImageUrl: null,
    fallbackInitials: playlistId ? 'SP' : 'BM',
  };
}

function getSpotifyImportedSongCountLabel(input: {
  usableTrackCount: number;
  importedTrackCount: number;
  totalTrackCount: number;
  isPartial: boolean;
}): string {
  if (input.isPartial) {
    return `${input.usableTrackCount} canciones únicas (${input.importedTrackCount} importadas de ${input.totalTrackCount})`;
  }

  if (input.usableTrackCount !== input.importedTrackCount) {
    return `${input.usableTrackCount} canciones únicas (${input.importedTrackCount} importadas)`;
  }

  return `${input.usableTrackCount} canciones`;
}

function getUsableSongLineCount(songLines: string[]): number {
  return getMusicBingoUsableSongPool(
    parseMusicBingoManualSongs(songLines.join('\n')).songs
  ).usableSongs.length;
}

function getSpotifyConnectionLabel(spotifyConnectionState: SpotifyConnectionState): string {
  return spotifyConnectionState.status === 'ready' && spotifyConnectionState.connected
    ? 'Spotify conectado'
    : 'Spotify opcional';
}

function getMusicBingoSpotifyPlaylists(playlists: SpotifyUserPlaylistPreview[]): SpotifyUserPlaylistPreview[] {
  return playlists.filter(isMusicBingoSpotifyPlaylist);
}

function isMusicBingoSpotifyPlaylist(playlist: SpotifyUserPlaylistPreview): boolean {
  const text = [
    playlist.name,
    playlist.description ?? '',
  ].join(' ').toLowerCase();

  return BARAJA_MUSIC_BINGO_PLAYLIST_MARKERS.some((marker) => text.includes(marker));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCheckoutUnavailableReason(input: {
  canPreview: boolean;
  playlistFit: MusicBingoPlaylistFitReport;
  isCuratedSelection: boolean;
  hasSpotifyPlaylistId: boolean;
  priceMode: string;
  hasValidEmail: boolean;
}): string {
  if (!input.canPreview) return 'Faltan canciones para armar el PDF.';
  if (!input.playlistFit.scenarioReady) {
	    return `Para ${input.playlistFit.selectedCardCount} cartones, esta playlist necesita ${input.playlistFit.scenarioMinimum} canciones. Sumá ${input.playlistFit.songsNeededForScenario}, bajá cartones o usá un formato más chico.`;
  }
  if (input.priceMode === 'proposal') return 'Este caso necesita propuesta antes de pagar.';
  if (!input.isCuratedSelection && !input.hasSpotifyPlaylistId) {
    return 'Para pagar online necesitamos una playlist de Spotify recuperable.';
  }
	  if (!input.hasValidEmail) return 'Dejanos un email válido para enviarte el PDF.';
  return '';
}

function isValidCheckoutEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function readSavedCheckoutEmail() {
  if (typeof window === 'undefined') return '';

  try {
    const savedEmail = window.localStorage.getItem(CHECKOUT_EMAIL_STORAGE_KEY) ?? '';
    return isValidCheckoutEmail(savedEmail) ? savedEmail.trim() : '';
  } catch {
    return '';
  }
}

function saveCheckoutEmail(email: string) {
  const trimmedEmail = email.trim();
  if (!isValidCheckoutEmail(trimmedEmail) || typeof window === 'undefined') {
    return '';
  }

  try {
    window.localStorage.setItem(CHECKOUT_EMAIL_STORAGE_KEY, trimmedEmail);
  } catch {
    return '';
  }

  return trimmedEmail;
}

function buildValidationPdfFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'bingo-musical';
  return `${slug}-prueba.pdf`;
}

function toCheckoutPackSnapshot(
  pack: MusicBingoPrintPack
): BarajaMusicBingoCheckoutPackSnapshot {
  return {
    title: pack.title,
    subtitle: pack.subtitle,
    cardCount: pack.cardCount,
    boardSize: pack.boardSize,
    songCount: pack.songCount,
    freeSpace: pack.freeSpace,
    sourceLabel: pack.sourceLabel,
    priceLabel: pack.priceLabel,
    playlist: pack.playlist ?? null,
    cards: pack.cards,
    controlSheet: pack.controlSheet,
    playlistFit: pack.playlistFit,
    eventRuleProfile: pack.eventRuleProfile,
    setupSteps: pack.setupSteps,
    playRules: pack.playRules,
    printGuide: pack.printGuide,
    legalSummary: pack.legalSummary,
  };
}

export default function MusicBingoCreator() {
  const location = useLocation();
  const creatorEntry = useMemo(
    () => getMusicBingoCreatorEntry(location.search),
    [location.search]
  );
  const initialTheme = getInitialThemeFromSearch(location.search);
  const initialCardCount = getInitialCardCountFromSearch(location.search) ?? DEFAULT_CARD_COUNT;
  const initialSpotifyPlaylistUrl = new URLSearchParams(location.search).get('spotifyPlaylistUrl') ?? '';
  const shouldOpenPlaylistPicker = creatorEntry === 'playlist' && !initialSpotifyPlaylistUrl;
  const themeParam = useMemo(
    () => new URLSearchParams(location.search).get('tema') ?? '',
    [location.search]
  );
  const initialCatalogCollectionId = useMemo(
    () => new URLSearchParams(location.search).get('catalogCollectionId') ?? '',
    [location.search]
  );
  const initialPlaylistUrl = initialCatalogCollectionId
    ? ''
    : initialSpotifyPlaylistUrl ||
      (themeParam ? initialTheme.playlist?.url || DEFAULT_PLAYLIST_URL : '');
  const [source, setSource] = useState<MusicBingoCreatorSongSource>(
    initialSpotifyPlaylistUrl || initialCatalogCollectionId || !themeParam ? 'manual' : 'baraja_theme'
  );
  const [wizardStep, setWizardStep] = useState<CreatorWizardStep>(
    themeParam && !initialSpotifyPlaylistUrl && !initialCatalogCollectionId ? 2 : 1
  );
  const [themeId, setThemeId] = useState(initialTheme.id);
  const [selectedSyncedCollectionId, setSelectedSyncedCollectionId] = useState(initialCatalogCollectionId);
  const [gameName, setGameName] = useState(
    themeParam ? initialTheme.suggestedGameName : 'Bingo musical Baraja'
  );
  const useContext = DEFAULT_USE_CONTEXT;
  const [playlistUrl, setPlaylistUrl] = useState(initialPlaylistUrl);
  const [manualSongs, setManualSongs] = useState('');
  const [spotifyImportState, setSpotifyImportState] = useState<SpotifyImportState>({ status: 'idle' });
  const [spotifyConnectionState, setSpotifyConnectionState] = useState<SpotifyConnectionState>({
    status: 'checking',
    configured: false,
    connected: false,
  });
  const [cardCount, setCardCount] = useState(initialCardCount);
  const [boardSize, setBoardSize] = useState<MusicBingoBoardSize>(5);
  const [freeSpace, setFreeSpace] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(shouldOpenPlaylistPicker);
  const [playlistModalTab, setPlaylistModalTab] = useState<PlaylistModalTab>(
    shouldOpenPlaylistPicker ? 'spotify' : 'baraja'
  );
  const [showAllCardCounts, setShowAllCardCounts] = useState(
    !MUSIC_BINGO_PRIMARY_CARD_COUNTS.includes(
      initialCardCount as (typeof MUSIC_BINGO_PRIMARY_CARD_COUNTS)[number]
    )
  );
  const [catalogSearch, setCatalogSearch] = useState('');
  const [playlistUrlDraft, setPlaylistUrlDraft] = useState(initialPlaylistUrl);
  const [spotifyUserPlaylistsState, setSpotifyUserPlaylistsState] = useState<SpotifyUserPlaylistsState>({ status: 'idle' });
  const [spotifyUserPlaylistsRetryKey, setSpotifyUserPlaylistsRetryKey] = useState(0);
  const [syncedCatalogState, setSyncedCatalogState] = useState<SyncedMusicBingoCatalogState>({ status: 'idle' });
  const [customerEmail, setCustomerEmail] = useState(readSavedCheckoutEmail);
  const [checkoutState, setCheckoutState] = useState<
    { status: 'idle' | 'loading' | 'error'; message?: string }
  >({ status: 'idle' });
  const [validationPdfState, setValidationPdfState] = useState<
    { status: 'idle' | 'loading' | 'error'; message?: string }
  >({ status: 'idle' });
  const creatorStartedTracked = useRef(false);
  const gameNameInputRef = useRef<HTMLInputElement>(null);
  const lastImportedPlaylistUrlRef = useRef('');
  const hydratedCatalogCollectionRef = useRef('');
  const spotifyUserPlaylistsLoadRef = useRef<'idle' | 'loading' | 'loaded'>('idle');

  const theme = useMemo(() => getThemeById(themeId), [themeId]);
  const syncedCatalogCollections = useMemo(
    () => (syncedCatalogState.status === 'success' ? syncedCatalogState.collections : []),
    [syncedCatalogState]
  );
  const catalogPickerItems = useMemo(
    () => getPlaylistCatalogPickerItems(syncedCatalogCollections),
    [syncedCatalogCollections]
  );
  const manualParse = useMemo(() => parseMusicBingoManualSongs(manualSongs), [manualSongs]);
  const songs = useMemo(
    () => (source === 'baraja_theme' ? theme.songs : manualParse.songs),
    [manualParse.songs, source, theme.songs]
  );
  const validation = useMemo(
    () => validateMusicBingoDraftSongs(songs, freeSpace, boardSize, { cardCount }),
    [boardSize, cardCount, freeSpace, songs]
  );
  const musicBingoSeed = useMemo(
    () => `${source}:${themeId}:${gameName}:${cardCount}:${boardSize}:${freeSpace}`,
    [boardSize, cardCount, freeSpace, gameName, source, themeId]
  );
  const generated = useMemo(
    () =>
      generateMusicBingoCards({
        title: gameName.trim() || 'Bingo Musical Baraja',
        songs,
        cardCount,
        boardSize,
        freeSpace,
        seed: musicBingoSeed,
      }),
    [boardSize, cardCount, freeSpace, gameName, musicBingoSeed, songs]
  );
  const isCuratedSelection = isCuratedMusicBingoSelection(source, selectedSyncedCollectionId);
  const hasSelectedRepertoire =
    isCuratedSelection || spotifyImportState.status === 'success';
  const pricingSongSource = getMusicBingoPricingSongSource({
    source,
    selectedSyncedCollectionId,
  });
  const priceQuote = useMemo(
    () => getMusicBingoPriceQuote(cardCount, useContext, pricingSongSource),
    [cardCount, pricingSongSource, useContext]
  );
  const playlistReference = useMemo<MusicBingoPlaylistReference | undefined>(() => {
    const trimmedUrl = playlistUrl.trim();
    if (!trimmedUrl) return undefined;

    if (source === 'baraja_theme' && theme.playlist?.url === trimmedUrl) {
      return theme.playlist;
    }

    if (spotifyImportState.status === 'success') {
      return {
        provider: 'spotify',
        title: spotifyImportState.playlist.name,
        url: trimmedUrl,
        note: 'Playlist pública compartida por el organizador. Baraja no vende música ni derechos de reproducción.',
      };
    }

    return {
      provider: 'spotify',
      title: 'Playlist propia',
      url: trimmedUrl,
      note: 'Playlist pública compartida por el organizador. Baraja no vende música ni derechos de reproducción.',
    };
  }, [playlistUrl, source, spotifyImportState, theme.playlist]);
  const printPack = useMemo(
    () =>
      buildMusicBingoPrintPack({
        title: gameName.trim() || 'Bingo Musical Baraja',
        songs,
        cardCount,
        boardSize,
        freeSpace,
        seed: musicBingoSeed,
        useContext,
        sourceLabel: getSourceLabel(source, theme, isCuratedSelection),
        priceLabel: priceQuote.label,
        playlist: playlistReference,
      }),
    [
      boardSize,
      cardCount,
      freeSpace,
      gameName,
      musicBingoSeed,
      playlistReference,
      priceQuote.label,
      songs,
      source,
      theme,
      isCuratedSelection,
      useContext,
    ]
  );
  const filteredCatalogItems = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalogPickerItems;

    return catalogPickerItems.filter((candidate) =>
      getPickerItemSearchText(candidate).includes(query)
    );
  }, [catalogPickerItems, catalogSearch]);
  const selectedCatalogItemId =
    selectedSyncedCollectionId || (source === 'baraja_theme' ? theme.id : '');
  const customSpotifyPlaylistId = useMemo(() => parseSpotifyPlaylistId(playlistUrl), [playlistUrl]);
  const spotifyConnectionLabel = getSpotifyConnectionLabel(spotifyConnectionState);
  const selectedSpotifyUserPlaylist = useMemo(
    () => getSelectedSpotifyUserPlaylist(playlistUrl, spotifyUserPlaylistsState),
    [playlistUrl, spotifyUserPlaylistsState]
  );
  const activePlaylistSummary = useMemo(
    () =>
      buildActivePlaylistSummary({
        playlistUrl,
        source,
        theme,
        isCuratedSelection,
        spotifyImportState,
        selectedSpotifyPlaylist: selectedSpotifyUserPlaylist,
        connectionLabel: spotifyConnectionLabel,
      }),
    [
      playlistUrl,
      source,
      theme,
      isCuratedSelection,
      spotifyImportState,
      selectedSpotifyUserPlaylist,
      spotifyConnectionLabel,
    ]
  );
  const spotifyConnectHref = useMemo(() => {
    const returnParams = new URLSearchParams();
    const trimmedPlaylistUrl = playlistUrl.trim();
    if (creatorEntry === 'playlist') returnParams.set('entry', 'playlist');
    if (trimmedPlaylistUrl) {
      returnParams.set('spotifyPlaylistUrl', trimmedPlaylistUrl);
    }
    if (cardCount !== DEFAULT_CARD_COUNT) {
      returnParams.set('cartones', String(cardCount));
    }
    const returnTo = `${CREATOR_ROUTE}${returnParams.toString() ? `?${returnParams.toString()}` : ''}`;
    const authParams = new URLSearchParams({ returnTo });
    return `/api/spotify/auth/start?${authParams.toString()}`;
  }, [cardCount, creatorEntry, playlistUrl]);
  const trackingSource = getMusicBingoCheckoutSource({
    source,
    selectedSyncedCollectionId,
    spotifyImportSucceeded: spotifyImportState.status === 'success',
    hasSpotifyPlaylistUrl: Boolean(customSpotifyPlaylistId),
  });
  const commercialThemeId = getMusicBingoCommercialThemeId({
    source,
    selectedSyncedCollectionId,
    themeId: theme.id,
  });
  const hasValidCheckoutEmail = isValidCheckoutEmail(customerEmail);
  const canUseMercadoPagoCheckout =
    validation.canPreview &&
    validation.playlistFit.scenarioReady &&
    priceQuote.mode !== 'proposal' &&
    (isCuratedSelection || Boolean(customSpotifyPlaylistId)) &&
    hasValidCheckoutEmail;
  const checkoutUnavailableReason = getCheckoutUnavailableReason({
    canPreview: validation.canPreview,
    playlistFit: validation.playlistFit,
    isCuratedSelection,
    hasSpotifyPlaylistId: Boolean(customSpotifyPlaylistId),
    priceMode: priceQuote.mode,
    hasValidEmail: hasValidCheckoutEmail,
  });
  const previewCard = generated.cards[0];
  const canDownloadValidationPdf =
    import.meta.env.DEV && validation.canPreview && printPack.cards.length > 0;
  const offeringId = getOfferingId(source, theme, useContext, selectedSyncedCollectionId);
  const orderMessage = buildOrderMessage({
    gameName: gameName.trim() || 'Bingo Musical Baraja',
    useContext,
    source,
    theme,
    isCuratedSelection,
    songs: validation.usableSongs,
    cardCount,
    freeSpace,
    boardSize,
    priceLabel: priceQuote.label,
    playlist: playlistReference,
    playlistFit: validation.playlistFit,
    eventRuleProfile: printPack.eventRuleProfile,
  });
	  useEffect(() => {
	    const nextTheme = getExplicitThemeById(themeParam);
	    if (!nextTheme || nextTheme.id === themeId) return;

    setThemeId(nextTheme.id);
    setSelectedSyncedCollectionId('');
    setGameName(nextTheme.suggestedGameName);
    setPlaylistUrl(nextTheme.playlist?.url ?? '');
    lastImportedPlaylistUrlRef.current = '';
    setSpotifyImportState({ status: 'idle' });
    setIsCatalogOpen(false);
    if (source !== 'baraja_theme') {
      setSource('baraja_theme');
    }
    trackCreatorEvent('baraja_music_bingo_song_source_selected', {
      source: 'curated_spotify',
      use_context: useContext,
      theme_id: nextTheme.id,
	    });
	  }, [source, themeId, themeParam, useContext]);

	  useEffect(() => {
	    const nextCardCount = getInitialCardCountFromSearch(location.search);
	    if (!nextCardCount || nextCardCount === cardCount) return;
	    setCardCount(nextCardCount);
	  }, [cardCount, location.search]);

	  useEffect(() => {
    const controller = new AbortController();
    setSyncedCatalogState({ status: 'loading' });

    void (async () => {
      try {
        const collections = await fetchSyncedMusicBingoCatalog(controller.signal);
        setSyncedCatalogState({ status: 'success', collections });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSyncedCatalogState({
          status: 'error',
          message: 'No pudimos leer el catalogo sincronizado.',
        });
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (creatorStartedTracked.current) return;
    creatorStartedTracked.current = true;

    trackCreatorEvent('baraja_music_bingo_creator_started', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      theme_id: commercialThemeId,
    });
  }, [boardSize, cardCount, commercialThemeId, trackingSource, useContext]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/spotify/session', {
          credentials: 'include',
        });
        const session = await readSpotifySessionResponse(response);
        if (!cancelled) {
          if (!session.connected) {
            clearCachedSpotifyUserPlaylists();
          }
          setSpotifyConnectionState({
            status: 'ready',
            configured: session.configured,
            connected: session.connected,
          });
        }
      } catch {
        if (!cancelled) {
          clearCachedSpotifyUserPlaylists();
          setSpotifyConnectionState({
            status: 'ready',
            configured: false,
            connected: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCatalogOpen || playlistModalTab !== 'spotify') return;
    if (spotifyConnectionState.status !== 'ready' || !spotifyConnectionState.connected) return;
    if (spotifyUserPlaylistsLoadRef.current !== 'idle') return;

    let cancelled = false;
    const cachedPlaylists = readCachedSpotifyUserPlaylists();
    if (cachedPlaylists) {
      spotifyUserPlaylistsLoadRef.current = 'loaded';
      setSpotifyUserPlaylistsState({
        status: 'success',
        playlists: cachedPlaylists,
      });
      return;
    }

    spotifyUserPlaylistsLoadRef.current = 'loading';
    setSpotifyUserPlaylistsState({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetch(`/api/spotify/me/playlists?maxPlaylists=${SPOTIFY_USER_PLAYLISTS_REQUEST_LIMIT}`, {
          credentials: 'include',
        });
        const result = await readSpotifyUserPlaylistsResponse(response);
        if (cancelled) return;
        spotifyUserPlaylistsLoadRef.current = 'loaded';
        if (result.ok) {
          writeCachedSpotifyUserPlaylists(result.playlists);
          setSpotifyUserPlaylistsState({
            status: 'success',
            playlists: result.playlists,
          });
          return;
        }

        setSpotifyUserPlaylistsState({
          status: 'error',
          message: result.message,
        });
      } catch {
        if (cancelled) return;
        spotifyUserPlaylistsLoadRef.current = 'loaded';
        setSpotifyUserPlaylistsState({
          status: 'error',
          message: 'No pudimos conectar con Spotify para leer tus playlists.',
        });
      }
    })();

    return () => {
      cancelled = true;
      if (spotifyUserPlaylistsLoadRef.current === 'loading') {
        spotifyUserPlaylistsLoadRef.current = 'idle';
      }
    };
  }, [
    isCatalogOpen,
    playlistModalTab,
    spotifyConnectionState.connected,
    spotifyConnectionState.status,
    spotifyUserPlaylistsRetryKey,
  ]);

  useEffect(() => {
    trackCreatorEvent('baraja_music_bingo_songs_validated', {
      source: trackingSource,
      use_context: useContext,
      song_count: validation.usableSongs.length,
      required_song_count: validation.requiredSongCount,
      warning_count: validation.warnings.length,
      can_preview: validation.canPreview,
      board_size: boardSize,
      has_free_space: freeSpace,
    });
  }, [
    boardSize,
    freeSpace,
    trackingSource,
    useContext,
    validation.canPreview,
    validation.requiredSongCount,
    validation.usableSongs.length,
    validation.warnings.length,
  ]);

  useEffect(() => {
    if (!validation.canPreview || !previewCard) return;

    trackCreatorEvent('baraja_music_bingo_preview_generated', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      song_count: validation.usableSongs.length,
      has_free_space: freeSpace,
      theme_id: commercialThemeId,
    });
  }, [
    cardCount,
    boardSize,
    freeSpace,
    previewCard,
    trackingSource,
    commercialThemeId,
    useContext,
    validation.canPreview,
    validation.usableSongs.length,
  ]);

  useEffect(() => {
    if (!validation.canPreview) return;

    trackCreatorEvent('baraja_music_bingo_price_viewed', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      price_label: priceQuote.label,
      price_mode: priceQuote.mode,
    });
  }, [
    cardCount,
    boardSize,
    priceQuote.label,
    priceQuote.mode,
    trackingSource,
    useContext,
    validation.canPreview,
  ]);

  useEffect(() => {
    const trimmedPlaylistUrl = playlistUrl.trim();
    if (source !== 'manual' || !customSpotifyPlaylistId) {
      return;
    }

    if (lastImportedPlaylistUrlRef.current === trimmedPlaylistUrl) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const cachedImport = readCachedSpotifyPlaylistImport(trimmedPlaylistUrl);
      if (cachedImport && cachedImport.musicBingoSongs.length > 0) {
        const usableSongCount = getUsableSongLineCount(cachedImport.musicBingoSongs);
        setManualSongs(cachedImport.musicBingoSongs.join('\n'));
        lastImportedPlaylistUrlRef.current = trimmedPlaylistUrl;
        setSpotifyImportState({
          status: 'success',
          authStatus: cachedImport.spotifyAuth,
          playlist: cachedImport.playlist,
          songCount: usableSongCount,
        });
        setWizardStep(2);
        return;
      }

      setSpotifyImportState({ status: 'loading' });

      try {
        const response = await fetch('/api/spotify/playlist', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ playlistUrl: trimmedPlaylistUrl, maxTracks: 500 }),
          signal: controller.signal,
        });
        const result = await readSpotifyImportResponse(response);

        if (result.ok && result.musicBingoSongs.length > 0) {
          const usableSongCount = getUsableSongLineCount(result.musicBingoSongs);
          setManualSongs(result.musicBingoSongs.join('\n'));
          lastImportedPlaylistUrlRef.current = trimmedPlaylistUrl;
          writeCachedSpotifyPlaylistImport(trimmedPlaylistUrl, result);
          setSpotifyImportState({
            status: 'success',
            authStatus: result.spotifyAuth,
            playlist: result.playlist,
            songCount: usableSongCount,
          });
          setWizardStep(2);
          return;
        }

        setSpotifyImportState({
          status: 'fallback',
          message: result.ok
            ? 'Spotify no devolvio canciones usables para esta playlist.'
            : getSpotifyImportFallbackMessage(result),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSpotifyImportState({
          status: 'fallback',
          message: 'No pudimos conectar con el importador de Spotify.',
        });
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [customSpotifyPlaylistId, playlistUrl, source]);

  function selectTheme(nextTheme: MusicBingoTheme) {
    setThemeId(nextTheme.id);
    setSelectedSyncedCollectionId('');
    setGameName(nextTheme.suggestedGameName);
    setPlaylistUrl(nextTheme.playlist?.url ?? '');
    lastImportedPlaylistUrlRef.current = '';
    setSpotifyImportState({ status: 'idle' });
    setIsCatalogOpen(false);
    setWizardStep(2);
    if (source !== 'baraja_theme') {
      setSource('baraja_theme');
    }
    trackCreatorEvent('baraja_music_bingo_song_source_selected', {
      source: 'curated_spotify',
      use_context: useContext,
      theme_id: nextTheme.id,
    });
  }

  const selectSyncedCatalogCollection = useCallback((
    collection: SyncedMusicBingoCatalogCollection,
    options: { trackSelection?: boolean } = {}
  ) => {
    const syncedSongs = formatSyncedMusicBingoSongs(collection);
    const syncedPlaylistUrl = collection.spotifyUrl ?? '';

    setSelectedSyncedCollectionId(collection.id);
    setThemeId(DEFAULT_THEME.id);
    setGameName(collection.title);
    setPlaylistUrl(syncedPlaylistUrl);
    setPlaylistUrlDraft(syncedPlaylistUrl);
    setManualSongs(syncedSongs.join('\n'));
    lastImportedPlaylistUrlRef.current = syncedPlaylistUrl.trim();
    setSpotifyImportState(buildSpotifyImportStateFromSyncedCollection(collection));
    setIsCatalogOpen(false);
    setWizardStep(2);
    if (source !== 'manual') {
      setSource('manual');
    }
    if (options.trackSelection === false) return;

    trackCreatorEvent('baraja_music_bingo_song_source_selected', {
      source: 'curated_spotify',
      use_context: useContext,
      theme_id: collection.id,
      catalog_source: 'd1_sync',
      song_count: syncedSongs.length,
    });
  }, [source, useContext]);

  function openPlaylistModal(tab: PlaylistModalTab = 'baraja') {
    setCatalogSearch('');
    setPlaylistUrlDraft(playlistUrl);
    setPlaylistModalTab(tab);
    setIsCatalogOpen(true);
    trackCreatorEvent('baraja_music_bingo_playlist_opened', {
      source: trackingSource,
      use_context: useContext,
      theme_id: commercialThemeId,
      tab,
    });
  }

  function selectSpotifyUserPlaylist(spotifyPlaylist: SpotifyUserPlaylistPreview) {
    updatePlaylistUrl(spotifyPlaylist.spotifyUrl);
    setIsCatalogOpen(false);
  }

  function usePlaylistUrlDraft() {
    updatePlaylistUrl(playlistUrlDraft);
    setIsCatalogOpen(false);
  }

  function updatePlaylistUrl(nextPlaylistUrl: string) {
    const matchingSyncedCollection = getSyncedCollectionByPlaylistUrl(
      syncedCatalogCollections,
      nextPlaylistUrl
    );
    if (matchingSyncedCollection) {
      selectSyncedCatalogCollection(matchingSyncedCollection);
      return;
    }

    setPlaylistUrl(nextPlaylistUrl);
    lastImportedPlaylistUrlRef.current = '';

    const matchingTheme = getThemeByPlaylistUrl(nextPlaylistUrl);
    if (matchingTheme) {
      setThemeId(matchingTheme.id);
      setSelectedSyncedCollectionId('');
      setGameName(matchingTheme.suggestedGameName);
      setSpotifyImportState({ status: 'idle' });
      setWizardStep(2);
      if (source !== 'baraja_theme') setSource('baraja_theme');
      return;
    }

    setSelectedSyncedCollectionId('');
    setSpotifyImportState({ status: 'idle' });

    if (source !== 'manual') {
      setSource('manual');
      trackCreatorEvent('baraja_music_bingo_song_source_selected', {
        source: 'custom_spotify',
        use_context: useContext,
        theme_id: 'custom_playlist_url',
      });
    }
  }

  function updateManualSongs(nextManualSongs: string) {
    if (selectedSyncedCollectionId) {
      setSelectedSyncedCollectionId('');
      trackCreatorEvent('baraja_music_bingo_song_source_selected', {
        source: 'manual_fallback',
        use_context: useContext,
        theme_id: 'manual_song_edit',
      });
    }

    setManualSongs(nextManualSongs);
  }

  useEffect(() => {
    const collection = getSyncedCollectionById(syncedCatalogCollections, initialCatalogCollectionId);
    if (!collection || hydratedCatalogCollectionRef.current === collection.id) return;

    const selectionTimer = window.setTimeout(() => {
      if (hydratedCatalogCollectionRef.current === collection.id) return;

      hydratedCatalogCollectionRef.current = collection.id;
      selectSyncedCatalogCollection(collection);
    }, 0);

    return () => window.clearTimeout(selectionTimer);
  }, [initialCatalogCollectionId, selectSyncedCatalogCollection, syncedCatalogCollections]);

  function selectCardCount(nextCardCount: number) {
    setCardCount(nextCardCount);
    trackCreatorEvent('baraja_music_bingo_card_count_selected', {
      source: trackingSource,
      use_context: useContext,
      card_count: nextCardCount,
      board_size: boardSize,
      has_free_space: freeSpace,
    });
  }

  function reopenRepertoireStep() {
    setWizardStep(1);
    openPlaylistModal('baraja');
  }

  function reopenCardCountStep() {
    setWizardStep(2);
  }

  function advanceToPreviewAndCheckout() {
    if (!validation.canPreview) return;

    setWizardStep(3);
    window.requestAnimationFrame(() => {
      document.getElementById('music-bingo-preview-checkout')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function selectBoardSize(nextBoardSize: MusicBingoBoardSize) {
    if (nextBoardSize === boardSize) return;

    setBoardSize(nextBoardSize);
    trackCreatorEvent('baraja_music_bingo_grid_size_selected', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: nextBoardSize,
      has_free_space: freeSpace,
    });
  }

  function trackOrderStart() {
    trackCreatorEvent('baraja_music_bingo_order_started', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      song_count: validation.usableSongs.length,
      has_free_space: freeSpace,
      offering_id: offeringId,
      price_label: priceQuote.label,
      price_mode: priceQuote.mode,
      theme_id: commercialThemeId,
    });
    trackBarajaEvent('baraja_inquiry_started', {
      campaign_id: 'music_bingo',
      cta_id: 'music_bingo_creator_order',
      cta_kind: 'whatsapp',
      href_type: 'wa_me',
      offer_id: offeringId,
      offer_type: priceQuote.mode,
      source: trackingSource,
      surface: CREATOR_SURFACE,
    });
  }

  async function handleValidationPdfDownload() {
    if (!validation.canPreview || printPack.cards.length === 0) {
      setValidationPdfState({
        status: 'error',
        message: 'Genera una preview valida antes de descargar el PDF.',
      });
      return;
    }

    setValidationPdfState({ status: 'loading' });

    try {
      const blob = await createBarajaMusicBingoValidationPdf(
        toCheckoutPackSnapshot(printPack)
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = buildValidationPdfFilename(printPack.title);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setValidationPdfState({ status: 'idle' });
    } catch (error) {
      const message = error instanceof BarajaMusicBingoCheckoutError
        ? error.message
        : 'No pudimos generar el PDF local. Revisa que la funcion local este corriendo.';
      console.warn('[baraja] Local music bingo PDF validation failed', error);
      setValidationPdfState({ status: 'error', message });
    }
  }

  async function handleCheckout() {
    if (!canUseMercadoPagoCheckout) {
      setCheckoutState({
        status: 'error',
        message: checkoutUnavailableReason || 'Este pack todavia no puede pagarse online.',
      });
      return;
    }

    setCheckoutState({ status: 'loading' });

    trackCreatorEvent('baraja_music_bingo_checkout_started', {
      provider: 'mercado_pago',
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      song_count: validation.usableSongs.length,
      has_free_space: freeSpace,
      offering_id: offeringId,
      price_label: priceQuote.label,
      price_mode: priceQuote.mode,
      theme_id: commercialThemeId,
    });

    try {
      const checkout = await startBarajaMusicBingoCheckout({
        cardCount,
        boardSize,
        freeSpace,
        songCount: validation.usableSongs.length,
        source: trackingSource,
        useContext,
        offeringId,
        themeId: commercialThemeId,
        playlistId:
          source === 'baraja_theme'
            ? parseSpotifyPlaylistId(theme.playlist?.url ?? '')
            : customSpotifyPlaylistId,
        customerEmail: customerEmail.trim(),
        analyticsDistinctId: getBarajaAnalyticsDistinctId(),
        acquisitionContext: getBarajaAcquisitionContext(),
        packSnapshot: toCheckoutPackSnapshot(printPack),
      });
      saveCheckoutEmail(customerEmail);

      trackBarajaEvent('baraja_checkout_started', {
        campaign_id: 'music_bingo',
        cta_id: 'music_bingo_creator_checkout',
        cta_kind: 'checkout',
        href_type: 'provider_redirect',
        provider: checkout.provider,
        offer_id: checkout.purchase.offeringId,
        offer_type: checkout.purchase.priceMode,
        source: trackingSource,
        surface: CREATOR_SURFACE,
        card_count: checkout.purchase.cardCount,
        board_size: checkout.purchase.boardSize,
        song_count: checkout.purchase.songCount,
        price_mode: checkout.purchase.priceMode,
      });

      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      const message = error instanceof BarajaMusicBingoCheckoutError
        ? error.message
        : 'No pudimos iniciar Mercado Pago. Proba de nuevo.';
      const safeErrorCode = error instanceof BarajaMusicBingoCheckoutError
        ? `checkout_${error.status}`
        : 'checkout_unknown';

      setCheckoutState({ status: 'error', message });
      trackBarajaEvent('baraja_checkout_failed', {
        campaign_id: 'music_bingo',
        cta_id: 'music_bingo_creator_checkout',
        cta_kind: 'checkout',
        provider: 'mercado_pago',
        safe_error_code: safeErrorCode,
        offer_id: offeringId,
        offer_type: priceQuote.mode,
        source: trackingSource,
        surface: CREATOR_SURFACE,
        card_count: cardCount,
        board_size: boardSize,
        song_count: validation.usableSongs.length,
      });
    }
  }

  return (
    <main className="baraja-music-creator baraja-music-creator-app">
      <CreatorNav />

      <section className="baraja-creator-app-layout" aria-label="Creador de bingo musical">
        <section className="baraja-creator-workspace">
          <section className="baraja-creator-workspace-shell" aria-label="Configuracion del juego">
            <section className="baraja-creator-setup-panel">
              <section
                className={`baraja-creator-step ${wizardStep > 1 ? 'is-complete' : 'is-active'}`}
                id="playlist-catalog"
                aria-label="Música"
              >
                <CreatorStepHeading
                  step="1"
                  title="Música"
                  summary={wizardStep > 1 ? activePlaylistSummary.title : undefined}
                  onEdit={wizardStep > 1 ? reopenRepertoireStep : undefined}
                />

                {wizardStep === 1 ? (
                  <>
                    <PlaylistUrlReview
                      activePlaylist={activePlaylistSummary}
                      onOpenSelector={() => openPlaylistModal('baraja')}
                    />

                    {source === 'baraja_theme' ? (
                      <PlaylistTrackList theme={theme} />
                    ) : (
                      <section className="baraja-spotify-import-stack">
                        <SpotifyPlaylistPreviewCard state={spotifyImportState} />
                        <SpotifyImportNotice
                          state={spotifyImportState}
                          spotifyConnectHref={spotifyConnectHref}
                          spotifyConnectionState={spotifyConnectionState}
                        />
                        <ManualImportPanel
                          songs={manualSongs}
                          onSongsChange={updateManualSongs}
                        />
                      </section>
                    )}
                    {hasSelectedRepertoire ? (
                      <button
                        type="button"
                        className="baraja-wizard-continue"
                        onClick={() => setWizardStep(2)}
                      >
                        Continuar con esta playlist
                      </button>
                    ) : null}
                  </>
                ) : null}
              </section>

              {wizardStep > 1 ? (
                <section
                  className={`baraja-creator-step ${wizardStep > 2 ? 'is-complete' : 'is-active'}`}
                  aria-label="Cartones"
                >
                  <CreatorStepHeading
                    step="2"
                    title="Cartones"
                    summary={wizardStep > 2 ? `${cardCount} cartones - ${priceQuote.label}` : undefined}
                    onEdit={wizardStep > 2 ? reopenCardCountStep : undefined}
                  />

                  {wizardStep === 2 ? (
                    <>
                      <div className="baraja-count-editor">
                        <div className="baraja-count-readout">
                          <div>
                            <strong>{cardCount}</strong>
                            <span>Cartones</span>
                          </div>
                          <div className="baraja-count-price">
                            <b>{priceQuote.label}</b>
                            <small>{priceQuote.summary}</small>
                          </div>
                        </div>
                        <CardCountFitNotice playlistFit={validation.playlistFit} />
                        <div className="baraja-count-options" aria-label="Cantidad de cartones">
                          {(showAllCardCounts
                            ? MUSIC_BINGO_CARD_COUNT_OPTIONS
                            : MUSIC_BINGO_CARD_COUNT_OPTIONS.filter((option) =>
                                MUSIC_BINGO_PRIMARY_CARD_COUNTS.includes(
                                  option.cardCount as (typeof MUSIC_BINGO_PRIMARY_CARD_COUNTS)[number]
                                )
                              )
                          ).map((option) => (
                            <button
                              key={option.cardCount}
                              type="button"
                              aria-pressed={cardCount === option.cardCount}
                              className={cardCount === option.cardCount ? 'is-selected' : ''}
                              onClick={() => selectCardCount(option.cardCount)}
                            >
                              <strong>{option.cardCount}</strong>
                              <span>cartones</span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="baraja-card-count-more"
                          aria-expanded={showAllCardCounts}
                          onClick={() => setShowAllCardCounts((current) => !current)}
                        >
                          {showAllCardCounts ? 'Ver opciones comunes' : 'Más cantidad'}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="baraja-wizard-continue"
                        disabled={!validation.canPreview}
                        onClick={advanceToPreviewAndCheckout}
                      >
                        Ver preview y comprar
                      </button>
                    </>
                  ) : null}
                </section>
              ) : null}

              {wizardStep > 1 ? (
                <details className="baraja-creator-personalization">
                  <summary>Personalizar</summary>
                  <div>
                    <label className="baraja-toggle-row baraja-compact-toggle baraja-inline-free-space">
                      <input
                        type="checkbox"
                        checked={freeSpace}
                        onChange={(event) => setFreeSpace(event.target.checked)}
                      />
                      <span>
                        <strong>Casillero libre</strong>
                        <small>Centro Baraja activado</small>
                      </span>
                    </label>
                    <PreviewFormatControls
                      boardSize={boardSize}
                      requiredSongCount={validation.requiredSongCount}
                      onBoardSizeChange={selectBoardSize}
                    />
                    <label className="baraja-field" aria-label="Nombre del juego">
                      <span>Nombre del juego</span>
                      <input
                        ref={gameNameInputRef}
                        value={gameName}
                        onChange={(event) => setGameName(event.target.value)}
                        placeholder="Noche Rock Argentino"
                      />
                    </label>
                  </div>
                </details>
              ) : null}
            </section>

            <aside
              className="baraja-creator-preview-order"
              id="music-bingo-preview-checkout"
              aria-label="Vista previa y pedido"
            >
              {wizardStep === 3 ? (
                <>
                  <section className="baraja-creator-preview-stage" aria-label="Vista previa del pack">
                    <div className="baraja-creator-preview-head">
                      <div>
                        <p className="baraja-kicker">Vista previa</p>
                        <h2>{gameName || 'Bingo Musical Baraja'}</h2>
                      </div>
                      <span>
                        {validation.usableSongs.length} canciones / {cardCount} cartones
                      </span>
                    </div>

                    {validation.canPreview && previewCard ? (
                      <PdfPreview key={getPreviewCardKey(previewCard)} card={previewCard} />
                    ) : (
                      <div className="baraja-preview-empty">
                        <strong>Faltan canciones para generar preview.</strong>
                        <span>{validation.errors[0] ?? 'Completa la lista o elegi una tematica Baraja.'}</span>
                      </div>
                    )}
                  </section>

                  <CheckoutReview
                    cardCount={cardCount}
                    priceLabel={priceQuote.label}
                    canPreview={validation.canPreview}
                    canCheckout={canUseMercadoPagoCheckout}
                    checkoutState={checkoutState}
                    checkoutUnavailableReason={checkoutUnavailableReason}
                    validationPdfState={validationPdfState}
                    canDownloadValidationPdf={canDownloadValidationPdf}
                    customerEmail={customerEmail}
                    onCustomerEmailChange={setCustomerEmail}
                    customerEmailPlaceholder={DEFAULT_CHECKOUT_EMAIL_PLACEHOLDER}
                    supportHref={getBarajaInquiryHref(orderMessage)}
                    onCheckout={() => void handleCheckout()}
                    onDownloadValidationPdf={() => void handleValidationPdfDownload()}
                    onSupport={trackOrderStart}
                  />
                </>
              ) : (
                <CreatorCheckoutPending step={wizardStep} />
              )}
            </aside>
          </section>
        </section>
      </section>
      <PlaylistCatalogModal
        isOpen={isCatalogOpen}
        activeTab={playlistModalTab}
        search={catalogSearch}
        items={filteredCatalogItems}
        selectedItemId={selectedCatalogItemId}
        catalogStatus={syncedCatalogState.status}
        spotifyConnectHref={spotifyConnectHref}
        spotifyConnectionState={spotifyConnectionState}
        spotifyUserPlaylistsState={spotifyUserPlaylistsState}
        playlistUrlDraft={playlistUrlDraft}
        onActiveTabChange={setPlaylistModalTab}
        onSearchChange={setCatalogSearch}
        onSelectItem={(item) => {
          if (item.kind === 'theme') {
            selectTheme(item.theme);
            return;
          }
          selectSyncedCatalogCollection(item.collection);
        }}
        onSelectSpotifyPlaylist={selectSpotifyUserPlaylist}
        onPlaylistUrlDraftChange={setPlaylistUrlDraft}
        onUsePlaylistUrl={usePlaylistUrlDraft}
        onRetrySpotifyPlaylists={() => {
          clearCachedSpotifyUserPlaylists();
          spotifyUserPlaylistsLoadRef.current = 'idle';
          setSpotifyUserPlaylistsState({ status: 'idle' });
          setSpotifyUserPlaylistsRetryKey((current) => current + 1);
        }}
        onClose={() => setIsCatalogOpen(false)}
      />
    </main>
  );
}

function CardCountFitNotice({
  playlistFit,
}: {
  playlistFit: MusicBingoPlaylistFitReport;
}) {
  const className = playlistFit.scenarioReady
    ? 'baraja-count-helper is-ready'
    : playlistFit.canFillCard
      ? 'baraja-count-helper is-warning'
      : 'baraja-count-helper is-blocked';
  const message = playlistFit.scenarioReady
    ? `Listo para jugar: ${playlistFit.usableSongCount} canciones para ${playlistFit.selectedCardCount} cartones.`
    : playlistFit.canFillCard
      ? `Podés ver el preview. Para pagar, sumá ${playlistFit.songsNeededForScenario} canciones o elegí menos cartones.`
      : `Este formato necesita ${playlistFit.hardMinimum} canciones distintas.`;

  return (
    <section className={className} aria-label="Fit entre canciones y cartones">
      <p>{message}</p>
    </section>
  );
}

function PreviewFormatControls({
  boardSize,
  requiredSongCount,
  onBoardSizeChange,
}: {
  boardSize: MusicBingoBoardSize;
  requiredSongCount: number;
  onBoardSizeChange: (boardSize: MusicBingoBoardSize) => void;
}) {
  return (
    <section className="baraja-preview-format-controls" aria-label="Formato del PDF">
      <header>
        <div>
          <span>Formato del PDF</span>
          <strong>{boardSize} x {boardSize}</strong>
        </div>
          <small>{requiredSongCount} canciones por cartón</small>
      </header>
      <div role="group" aria-label="Tamaño de grilla">
        {MUSIC_BINGO_BOARD_SIZE_OPTIONS.map((option) => (
          <button
            key={option.boardSize}
            type="button"
            className={boardSize === option.boardSize ? 'is-selected' : ''}
            onClick={() => onBoardSizeChange(option.boardSize)}
          >
            {option.boardSize} x {option.boardSize}
          </button>
        ))}
      </div>
    </section>
  );
}

function CreatorCheckoutPending({ step }: { step: CreatorWizardStep }) {
  const message = step === 1
    ? 'Elegí la música para continuar.'
    : 'Confirmá la cantidad para ver tu bingo.';

  return (
    <section className="baraja-creator-checkout-pending" aria-live="polite">
      <span>Paso 3</span>
      <strong>{message}</strong>
    </section>
  );
}

function CreatorStepHeading({
  step,
  title,
  summary,
  onEdit,
}: {
  step: string;
  title: string;
  summary?: string;
  onEdit?: () => void;
}) {
  return (
    <div className="baraja-creator-step-head">
      <span>{step}</span>
      <div>
        <h2>{title}</h2>
        {summary ? <small>{summary}</small> : null}
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit}>
          Editar
        </button>
      ) : null}
    </div>
  );
}

function PlaylistUrlReview({
  activePlaylist,
  onOpenSelector,
}: {
  activePlaylist: ActivePlaylistSummary;
  onOpenSelector: () => void;
}) {
  return (
    <section className="baraja-playlist-url-review" aria-label="Música del bingo">
      <div className="baraja-playlist-active-row">
        <div className="baraja-playlist-active-art" aria-hidden="true">
          {activePlaylist.coverImageUrl ? (
            <img src={activePlaylist.coverImageUrl} alt="" loading="eager" decoding="async" />
          ) : (
            <i>{activePlaylist.fallbackInitials}</i>
          )}
        </div>
        <div className="baraja-playlist-active-copy">
          <span>{activePlaylist.eyebrow}</span>
          <strong>{activePlaylist.title}</strong>
          <small>{activePlaylist.meta}</small>
        </div>
        <button type="button" onClick={onOpenSelector}>
          <SpotifyLogoMark />
          Cambiar
        </button>
      </div>
      <p>Elegí una colección Baraja o tu playlist de Spotify.</p>
    </section>
  );
}

function SpotifyLogoMark() {
  return <BrandIcon name="spotify" className="baraja-spotify-logo" />;
}

function SpotifyPlaylistEmbed({
  playlistUrl,
  playlistName,
}: {
  playlistUrl: string;
  playlistName: string;
}) {
  const playlistId = parseSpotifyPlaylistId(playlistUrl);
  if (!playlistId) return null;

  return (
    <div className="baraja-spotify-playlist-embed">
      <iframe
        title={`Escuchar ${playlistName} en Spotify`}
        src={`https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}?utm_source=generator`}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function SpotifyPlaylistSelectorPreview({
  playlistUrl,
  playlistName,
  onClose,
}: {
  playlistUrl: string;
  playlistName: string;
  onClose: () => void;
}) {
  return (
    <section className="baraja-playlist-selector-preview" aria-label={`Escuchar ${playlistName}`}>
      <header>
        <strong>{playlistName}</strong>
        <button type="button" onClick={onClose}>Ocultar escucha</button>
      </header>
      <SpotifyPlaylistEmbed playlistUrl={playlistUrl} playlistName={playlistName} />
    </section>
  );
}

function SpotifyImportNotice({
  state,
  spotifyConnectHref,
  spotifyConnectionState,
}: {
  state: SpotifyImportState;
  spotifyConnectHref: string;
  spotifyConnectionState: SpotifyConnectionState;
}) {
  if (state.status === 'idle') return null;

  const className = `baraja-spotify-import-status is-${state.status}`;
  const canConnectSpotify =
    spotifyConnectionState.status === 'ready' &&
    spotifyConnectionState.configured &&
    !spotifyConnectionState.connected;
  const connectedAccountCouldNotReadPlaylist =
    state.status === 'success' &&
    state.authStatus?.connected === true &&
    state.authStatus.attempted === true &&
    typeof state.authStatus.fallbackReason === 'string' &&
    state.playlist.importSource === 'public_page';
  if (state.status === 'loading') {
    return (
      <p className={className} role="status">
        Importando canciones desde Spotify...
      </p>
    );
  }

  if (state.status === 'success') {
    if (state.playlist.isPartial === true) {
      const totalTrackCount = state.playlist.totalTracks ?? state.songCount;
      return (
	      <p className="baraja-spotify-import-status is-partial" role="status">
	          Importamos {state.songCount} de {totalTrackCount} canciones.
	          {' '}
	          {connectedAccountCouldNotReadPlaylist ? (
	            'Para completar la playlist, usá una creada por vos o agregate como colaborador.'
	          ) : canConnectSpotify ? (
	            <>
	              <a href={spotifyConnectHref}>Conectá Spotify</a> o pegá las canciones manualmente.
	            </>
	          ) : (
	            'También podés pegar la lista manualmente.'
	          )}
	        </p>
      );
    }

    return (
      <p className="sr-only" role="status">
        Importamos {state.songCount} canciones de {state.playlist.name}.
      </p>
    );
  }

  return (
    <p className={className} role="status">
      {state.message}{' '}
      {canConnectSpotify ? (
        <>
	          <a href={spotifyConnectHref}>Conectá Spotify</a> o usá la carga manual para continuar.
	        </>
	      ) : (
	        'Podés usar la carga manual para continuar.'
	      )}
    </p>
  );
}

function ManualImportPanel({
  songs,
  onSongsChange,
}: {
  songs: string;
  onSongsChange: (songs: string) => void;
}) {
  return (
    <section className="baraja-manual-import" aria-label="Carga manual de canciones">
      <details>
        <summary className="baraja-manual-import-toggle">Cargar canciones manualmente</summary>
        <label className="baraja-field baraja-manual-import-field">
          <span>Canciones manuales</span>
          <textarea
            value={songs}
            onChange={(event) => onSongsChange(event.target.value)}
            placeholder={'Soda Stereo - De musica ligera\nLos Redondos - Jijiji\nCharly Garcia - Demoliendo hoteles'}
            rows={6}
          />
          <small>
            Una canción por línea: artista - canción. Si hay URL de Spotify,
            queda guardada en el pedido.
          </small>
        </label>
      </details>
    </section>
  );
}

function SpotifyPlaylistPreviewCard({ state }: { state: SpotifyImportState }) {
  if (state.status !== 'success') return null;

  const { playlist } = state;
  const totalTrackCount = playlist.totalTracks ?? playlist.importedTrackCount;
  const trackCountLabel = playlist.isPartial === true
    ? `${playlist.importedTrackCount} de ${totalTrackCount} canciones importadas`
    : `${playlist.importedTrackCount} canciones importadas`;

  return (
    <details className="baraja-spotify-playlist-details" aria-label="Playlist importada">
        <summary>Ver {trackCountLabel}</summary>
        <div className="baraja-spotify-playlist-scroll">
          {playlist.tracks.map((track, index) => (
            <article className="baraja-spotify-preview-track" key={`${track.id ?? track.title}:${index}`}>
              {track.imageUrl ? (
                <img
                  src={track.imageUrl}
                  alt=""
                  loading={index < 8 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ) : (
                <i aria-hidden="true">{getSpotifyTrackInitials(track)}</i>
              )}
              <div>
                <strong>{track.title}</strong>
                <span>{track.artistDisplayName}</span>
              </div>
            </article>
          ))}
        </div>
    </details>
  );
}

function getSpotifyTrackInitials(track: SpotifyImportedTrackPreview): string {
  const titleInitial = track.title.trim()[0] ?? 'S';
  const artistInitial = track.artistDisplayName.trim()[0] ?? 'P';
  return `${titleInitial}${artistInitial}`.toUpperCase();
}

function PlaylistCatalogModal({
  isOpen,
  activeTab,
  search,
  items,
  selectedItemId,
  catalogStatus,
  spotifyConnectHref,
  spotifyConnectionState,
  spotifyUserPlaylistsState,
  playlistUrlDraft,
  onActiveTabChange,
  onSearchChange,
  onSelectItem,
  onSelectSpotifyPlaylist,
  onPlaylistUrlDraftChange,
  onUsePlaylistUrl,
  onRetrySpotifyPlaylists,
  onClose,
}: {
  isOpen: boolean;
  activeTab: PlaylistModalTab;
  search: string;
  items: PlaylistCatalogPickerItem[];
  selectedItemId: string;
  catalogStatus: SyncedMusicBingoCatalogState['status'];
  spotifyConnectHref: string;
  spotifyConnectionState: SpotifyConnectionState;
  spotifyUserPlaylistsState: SpotifyUserPlaylistsState;
  playlistUrlDraft: string;
  onActiveTabChange: (tab: PlaylistModalTab) => void;
  onSearchChange: (search: string) => void;
  onSelectItem: (item: PlaylistCatalogPickerItem) => void;
  onSelectSpotifyPlaylist: (playlist: SpotifyUserPlaylistPreview) => void;
  onPlaylistUrlDraftChange: (playlistUrl: string) => void;
  onUsePlaylistUrl: () => void;
  onRetrySpotifyPlaylists: () => void;
  onClose: () => void;
}) {
  const [previewedPlaylistUrl, setPreviewedPlaylistUrl] = useState<string | null>(null);
  const canPreviewDraftPlaylist = Boolean(parseSpotifyPlaylistId(playlistUrlDraft));
  const previewedCatalogItem = previewedPlaylistUrl
    ? items.find((candidate) => getPickerItemSpotifyUrl(candidate) === previewedPlaylistUrl) ?? null
    : null;

  useEffect(() => {
    if (!isOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="baraja-playlist-modal-backdrop" role="presentation">
      <section
        className="baraja-playlist-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Selector rápido de playlists"
      >
        <header>
          <div>
	            <h2>Elegí la música</h2>
	            <p>Elegí una colección Baraja, una playlist de Spotify o una URL.</p>
          </div>
          <button type="button" aria-label="Cerrar selector" onClick={onClose}>
            x
          </button>
        </header>

        <div className="baraja-playlist-modal-tabs" role="tablist" aria-label="Fuentes de playlist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'baraja'}
            className={activeTab === 'baraja' ? 'is-selected' : ''}
            onClick={() => onActiveTabChange('baraja')}
          >
	            Colecciones
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'spotify'}
            className={activeTab === 'spotify' ? 'is-selected' : ''}
            onClick={() => onActiveTabChange('spotify')}
          >
	            Mis playlists
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'url'}
            className={activeTab === 'url' ? 'is-selected' : ''}
            onClick={() => onActiveTabChange('url')}
          >
	            Pegar enlace
          </button>
        </div>

        {activeTab === 'baraja' ? (
          <section className="baraja-playlist-modal-pane" role="tabpanel">
            <label className="baraja-playlist-modal-search">
              <span>Buscar playlist</span>
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar por titulo, ocasion o energia"
                autoFocus
              />
            </label>

            {catalogStatus === 'loading' ? (
              <p className="baraja-spotify-user-playlists-summary">Actualizando catalogo Baraja...</p>
            ) : null}

            {previewedCatalogItem ? (
              <SpotifyPlaylistSelectorPreview
                playlistUrl={previewedPlaylistUrl ?? ''}
                playlistName={getPickerItemTitle(previewedCatalogItem)}
                onClose={() => setPreviewedPlaylistUrl(null)}
              />
            ) : null}

            {items.length > 0 ? (
              <div className="baraja-playlist-modal-grid">
                {items.map((candidate) => {
                  const id = getPickerItemId(candidate);
                  const isTheme = candidate.kind === 'theme';
                  const title = getPickerItemTitle(candidate);
                  const subtitle = isTheme
                    ? candidate.theme.title
                    : candidate.collection.genreLabel;
                  const summary = isTheme
                    ? candidate.theme.summary
                    : candidate.collection.description;
                  const categoryLabel = isTheme
                    ? candidate.theme.catalog.categoryLabel
                    : candidate.collection.categoryLabel;
                  const energyLabel = isTheme
                    ? candidate.theme.catalog.energyLabel
                    : candidate.collection.energyLabel;
                  const decadeOrGenreLabel = isTheme
                    ? candidate.theme.catalog.decadeLabel ?? candidate.theme.catalog.genreLabel
                    : candidate.collection.decadeLabel ?? candidate.collection.genreLabel;
                  const songCount = isTheme
                    ? candidate.theme.songs.length
                    : candidate.collection.songCount;
                  const boardSizeLabel = formatPlaylistBoardSizes(
                    isTheme
                      ? candidate.theme.catalog.supportedBoardSizes
                      : candidate.collection.supportedBoardSizes
                  );
                  const coverImageUrl = isTheme
                    ? candidate.theme.playlist?.coverImageUrl ?? candidate.theme.songs[0]?.artworkUrl ?? null
                    : candidate.collection.coverImageUrl ?? candidate.collection.tracks[0]?.imageUrl ?? null;
                  const playlistUrl = getPickerItemSpotifyUrl(candidate);
                  const canPreviewPlaylist = Boolean(parseSpotifyPlaylistId(playlistUrl));

                  return (
                    <article
                      className={id === selectedItemId ? 'is-selected' : ''}
                      key={`${candidate.kind}:${id}`}
                    >
                      <div className="baraja-playlist-modal-art" aria-hidden="true">
                        {coverImageUrl ? (
                          <img
                            src={coverImageUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                        <span>{categoryLabel}</span>
                      </div>
                      <div>
                        <div className="baraja-playlist-modal-card-head">
                          <small>{categoryLabel}</small>
                          <strong>{title}</strong>
                          <span>{subtitle}</span>
                        </div>
                        <div className="baraja-playlist-modal-statline" aria-label="Resumen de la playlist">
                          <strong>{songCount}</strong>
                          <span>canciones</span>
                          <i aria-hidden="true" />
                          <span>{boardSizeLabel}</span>
                        </div>
                        <div className="baraja-playlist-modal-meta" aria-label="Datos de la playlist">
                          <span>{energyLabel}</span>
                          <span>{decadeOrGenreLabel}</span>
                          <span>{categoryLabel}</span>
                        </div>
                        <p>{summary}</p>
                        <div className="baraja-playlist-modal-card-actions">
                          {canPreviewPlaylist && previewedPlaylistUrl !== playlistUrl ? (
                            <button
                              type="button"
                              className="baraja-playlist-listen"
                              onClick={() => setPreviewedPlaylistUrl(playlistUrl)}
                            >
                              Escuchar
                            </button>
                          ) : null}
                          <button type="button" onClick={() => onSelectItem(candidate)}>
                            Usar esta playlist
                            <span aria-hidden="true">&gt;</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <section className="baraja-playlist-modal-empty" aria-label="Sin playlists">
                <strong>No hay playlists con esa búsqueda.</strong>
                <p>Proba con rock, cumbia, pop, fiesta o nostalgia.</p>
              </section>
            )}
            <Link className="baraja-playlist-modal-catalog-link" to={CATALOG_ROUTE}>
              Abrir catalogo completo
            </Link>
          </section>
        ) : null}

        {activeTab === 'spotify' ? (
          <SpotifyUserPlaylistsPane
            spotifyConnectHref={spotifyConnectHref}
            spotifyConnectionState={spotifyConnectionState}
            state={spotifyUserPlaylistsState}
            onRetry={onRetrySpotifyPlaylists}
            onSelectPlaylist={onSelectSpotifyPlaylist}
            previewedPlaylistUrl={previewedPlaylistUrl}
            onTogglePreview={(playlistUrl) => setPreviewedPlaylistUrl((current) => (
              current === playlistUrl ? null : playlistUrl
            ))}
          />
        ) : null}

        {activeTab === 'url' ? (
          <section className="baraja-playlist-modal-pane baraja-playlist-url-pane" role="tabpanel">
            <label className="baraja-field">
	                <span>Enlace de Spotify</span>
              <input
                value={playlistUrlDraft}
                onChange={(event) => onPlaylistUrlDraftChange(event.target.value)}
                placeholder="https://open.spotify.com/playlist/1234567890"
              />
	              <small>Puede ser una playlist propia, colaborativa o pública.</small>
            </label>
            <div className="baraja-playlist-url-actions">
              {canPreviewDraftPlaylist ? (
                <button
                  type="button"
                  className="baraja-playlist-listen"
                  aria-pressed={previewedPlaylistUrl === playlistUrlDraft}
                  onClick={() => setPreviewedPlaylistUrl((current) => (
                    current === playlistUrlDraft ? null : playlistUrlDraft
                  ))}
                >
                  {previewedPlaylistUrl === playlistUrlDraft ? 'Ocultar escucha' : 'Escuchar'}
                </button>
              ) : null}
              <button type="button" onClick={onUsePlaylistUrl}>
                Usar esta URL
                <span aria-hidden="true">&gt;</span>
              </button>
            </div>
            {canPreviewDraftPlaylist && previewedPlaylistUrl === playlistUrlDraft ? (
              <SpotifyPlaylistEmbed playlistUrl={playlistUrlDraft} playlistName="esta playlist" />
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}

function SpotifyUserPlaylistsPane({
  spotifyConnectHref,
  spotifyConnectionState,
  state,
  onRetry,
  onSelectPlaylist,
  previewedPlaylistUrl,
  onTogglePreview,
}: {
  spotifyConnectHref: string;
  spotifyConnectionState: SpotifyConnectionState;
  state: SpotifyUserPlaylistsState;
  onRetry: () => void;
  onSelectPlaylist: (playlist: SpotifyUserPlaylistPreview) => void;
  previewedPlaylistUrl: string | null;
  onTogglePreview: (playlistUrl: string) => void;
}) {
  if (spotifyConnectionState.status === 'checking') {
    return (
      <section className="baraja-playlist-modal-empty" role="tabpanel">
        <strong>Revisando Spotify...</strong>
      </section>
    );
  }

  if (!spotifyConnectionState.configured || !spotifyConnectionState.connected) {
    return (
	      <section className="baraja-playlist-modal-empty" role="tabpanel">
	        <strong>Conectá Spotify para ver tus playlists.</strong>
	        <p>Baraja va a mostrar playlists propias o colaborativas que tu cuenta puede leer completa.</p>
        {spotifyConnectionState.configured ? (
          <a className="baraja-playlist-modal-connect" href={spotifyConnectHref}>
            <SpotifyLogoMark />
            Conectar Spotify
          </a>
        ) : null}
      </section>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section className="baraja-playlist-modal-empty" role="tabpanel">
	        <strong>Cargando tus playlists...</strong>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="baraja-playlist-modal-empty" role="tabpanel">
        <strong>No pudimos leer tus playlists.</strong>
        <p>{state.message}</p>
        <button type="button" onClick={onRetry}>Reintentar</button>
      </section>
    );
  }

  if (state.playlists.length === 0) {
    return (
      <section className="baraja-playlist-modal-empty" role="tabpanel">
        <strong>No encontramos playlists en tu cuenta.</strong>
	        <p>Creá una playlist en Spotify o agregate como colaborador a una existente.</p>
      </section>
    );
  }

  const musicBingoPlaylists = getMusicBingoSpotifyPlaylists(state.playlists);
  const visiblePlaylists = musicBingoPlaylists.length > 0 ? musicBingoPlaylists : state.playlists;
  const showingMusicBingoOnly = musicBingoPlaylists.length > 0;
  const previewedPlaylist = previewedPlaylistUrl
    ? visiblePlaylists.find((playlist) => playlist.spotifyUrl === previewedPlaylistUrl) ?? null
    : null;

  return (
    <section className="baraja-playlist-modal-pane" role="tabpanel">
      <p className="baraja-spotify-user-playlists-summary">
        {showingMusicBingoOnly
	          ? `Mostrando ${visiblePlaylists.length} playlists de bingo musical de tu cuenta.`
	          : 'No encontramos playlists Baraja Bingo; mostramos todas las playlists legibles de tu cuenta.'}
      </p>
      {previewedPlaylist ? (
        <SpotifyPlaylistSelectorPreview
          playlistUrl={previewedPlaylist.spotifyUrl}
          playlistName={previewedPlaylist.name}
          onClose={() => onTogglePreview(previewedPlaylist.spotifyUrl)}
        />
      ) : null}
      <div className="baraja-spotify-user-playlists" aria-label="Tus playlists de Spotify">
        {visiblePlaylists.map((playlist) => {
          const canPreviewPlaylist = playlist.isPublic === true && Boolean(parseSpotifyPlaylistId(playlist.spotifyUrl));

          return (
          <article key={playlist.id}>
            <div className="baraja-spotify-user-playlist-art" aria-hidden="true">
              {playlist.coverImageUrl ? (
                <img src={playlist.coverImageUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <i>{getPlaylistInitials(playlist.name)}</i>
              )}
            </div>
            <div className="baraja-spotify-user-playlist-copy">
              <div className="baraja-playlist-modal-card-head">
                <strong>{playlist.name}</strong>
                <small>{playlist.ownerDisplayName ?? 'Tu Spotify'}</small>
              </div>
              <div className="baraja-playlist-modal-meta" aria-label="Datos de playlist">
                <span>{playlist.totalTracks ?? '-'} canciones</span>
                <span>{playlist.isCollaborative ? 'Colaborativa' : 'Propia'}</span>
                <span>{playlist.isPublic ? 'Publica' : 'Privada'}</span>
              </div>
              {playlist.description ? <p>{truncatePlaylistDescription(stripHtmlText(playlist.description))}</p> : null}
            </div>
            <div className="baraja-spotify-user-playlist-actions">
              {canPreviewPlaylist && previewedPlaylistUrl !== playlist.spotifyUrl ? (
                <button
                  type="button"
                  className="baraja-playlist-listen"
                  onClick={() => onTogglePreview(playlist.spotifyUrl)}
                >
                  Escuchar
                </button>
              ) : null}
              <button type="button" onClick={() => onSelectPlaylist(playlist)}>
                Usar playlist
                <span aria-hidden="true">&gt;</span>
              </button>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function stripHtmlText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function truncatePlaylistDescription(value: string): string {
  return value.length > 96 ? `${value.slice(0, 93).trim()}...` : value;
}

function getPlaylistInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'S';
  const second = parts[1]?.[0] ?? 'P';
  return `${first}${second}`.toUpperCase();
}

function PlaylistTrackList({ theme }: { theme: MusicBingoTheme }) {
  const playlistTitle = theme.playlist?.title ?? theme.title;

  return (
    <details className="baraja-playlist-detail" aria-label="Canciones de la playlist">
      <summary>
        <span>Ver canciones</span>
        <small>{playlistTitle} - {theme.songs.length} canciones</small>
      </summary>
      <div className="baraja-playlist-track-list">
        {theme.songs.map((song, index) => (
          <div className="baraja-playlist-track" key={song.id}>
            {song.artworkUrl ? (
              <img
                src={song.artworkUrl}
                alt=""
                loading={index < 8 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ) : (
              <i aria-hidden="true">{getSongInitials(song)}</i>
            )}
            <div>
              <strong>{song.title}</strong>
              <span>{song.artist}</span>
            </div>
            <small>{index + 1}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function getSongInitials(song: MusicBingoSong): string {
  const titleInitial = song.title.trim()[0] ?? 'B';
  const artistInitial = song.artist.trim()[0] ?? 'M';
  return `${titleInitial}${artistInitial}`.toUpperCase();
}

function PdfPreview({ card }: { card: GeneratedMusicBingoCard }) {
  const cardPreviewKey = getPreviewCardKey(card);
  const [pdfPreview, setPdfPreview] = useState<{
    key: string;
    url: string | null;
    error: boolean;
  }>({ key: '', url: null, error: false });

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    createMusicBingoPreviewPdfBlob(card)
      .then((blob) => {
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfPreview({ key: cardPreviewKey, url: objectUrl, error: false });
      })
      .catch(() => {
        if (!isMounted) return;
        setPdfPreview({ key: cardPreviewKey, url: null, error: true });
      });

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [card, cardPreviewKey]);

  const readyPdfUrl =
    pdfPreview.key === cardPreviewKey && !pdfPreview.error ? pdfPreview.url : null;
  const pdfHasError = pdfPreview.key === cardPreviewKey && pdfPreview.error;

  return (
    <div className="baraja-pdf-preview">
      <div className="baraja-pdf-toolbar" aria-label="Controles de vista previa PDF">
        <span>Preview</span>
        <span>Carton {card.cardNumber}</span>
        <strong>{card.boardSize} x {card.boardSize}</strong>
      </div>

      <div className="baraja-pdf-body">
        <section className="baraja-pdf-frame-shell">
          {readyPdfUrl ? (
            <PdfCanvasPreview
              label={`Vista previa del PDF generado para ${card.title}`}
              pdfUrl={readyPdfUrl}
              previewKey={cardPreviewKey}
            />
          ) : (
            <div className="baraja-pdf-loading" role="status">
              <span>
                {pdfHasError
                  ? 'No se pudo generar el PDF en este navegador.'
                  : 'Generando PDF...'}
              </span>
            </div>
          )}
          <div className="baraja-pdf-preview-actions">
            {readyPdfUrl ? (
              <a
                className="baraja-pdf-open-link"
                href={readyPdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir PDF generado
              </a>
            ) : (
              <span>
                {pdfHasError
                  ? 'No se pudo generar el PDF en este navegador.'
                  : 'Generando PDF...'}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PdfCanvasPreview({
  label,
  pdfUrl,
  previewKey,
}: {
  label: string;
  pdfUrl: string;
  previewKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderBox, setRenderBox] = useState({ width: 0, height: 0 });
  const [renderStatus, setRenderStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateRenderBox = () => {
      const rect = node.getBoundingClientRect();
      setRenderBox({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    updateRenderBox();
    const resizeObserver = new ResizeObserver(updateRenderBox);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || renderBox.width <= 0 || renderBox.height <= 0) return;

    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    let pdfDocument: PDFDocumentProxy | null = null;
    let renderTimeoutId: number | null = null;

    const renderPdfPage = async () => {
      setRenderStatus('loading');

      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        pdfDocument = await loadingTask.promise;
        if (isCancelled) return;

        const page = await pdfDocument.getPage(1);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, renderBox.width - 32);
        const availableHeight = Math.max(180, renderBox.height - 32);
        const cssScale = Math.min(
          availableWidth / viewport.width,
          availableHeight / viewport.height,
          1.8
        );
        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const outputScale = cssScale * devicePixelRatio;
        const outputViewport = page.getViewport({ scale: outputScale });
        const canvasWidth = Math.floor(viewport.width * cssScale);
        const canvasHeight = Math.floor(viewport.height * cssScale);
        const context = canvas.getContext('2d', { alpha: false });

        if (!context) {
          throw new Error('No canvas context available for PDF preview.');
        }

        canvas.width = Math.floor(outputViewport.width);
        canvas.height = Math.floor(outputViewport.height);
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        context.clearRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport: outputViewport,
        });

        await renderTask.promise;
        if (!isCancelled) setRenderStatus('ready');
      } catch (error) {
        if (isCancelled || isPdfRenderCancellation(error)) return;
        setRenderStatus('error');
      }
    };

    renderTimeoutId = window.setTimeout(() => {
      void renderPdfPage();
    }, 80);

    return () => {
      isCancelled = true;
      if (renderTimeoutId !== null) {
        window.clearTimeout(renderTimeoutId);
      }
      renderTask?.cancel();
      void pdfDocument?.destroy();
    };
  }, [pdfUrl, previewKey, renderBox.height, renderBox.width]);

  return (
    <div
      className={`baraja-pdf-render is-${renderStatus}`}
      ref={containerRef}
      aria-label={label}
    >
      <canvas className="baraja-pdf-canvas" ref={canvasRef} aria-hidden="true" />
      {renderStatus === 'loading' ? <span role="status">Renderizando PDF...</span> : null}
      {renderStatus === 'error' ? (
        <span role="status">No pudimos mostrar la vista previa. Podes abrir el PDF generado.</span>
      ) : null}
    </div>
  );
}

function isPdfRenderCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const maybeError = error as { name?: unknown; message?: unknown };

  return (
    maybeError.name === 'RenderingCancelledException' ||
    (typeof maybeError.message === 'string' && maybeError.message.includes('cancelled'))
  );
}

function getPreviewCardKey(card: GeneratedMusicBingoCard): string {
  return [
    card.id,
    card.title,
    card.cardNumber,
    card.boardSize,
    card.cells.map((cell) => `${cell.id}:${cell.label}:${cell.hint}:${cell.free}`).join('|'),
  ].join(':');
}

function CheckoutReview({
  cardCount,
  priceLabel,
  canPreview,
  canCheckout,
  checkoutState,
  checkoutUnavailableReason,
  validationPdfState,
  canDownloadValidationPdf,
  customerEmail,
  customerEmailPlaceholder,
  onCustomerEmailChange,
  supportHref,
  onCheckout,
  onDownloadValidationPdf,
  onSupport,
}: {
  cardCount: number;
  priceLabel: string;
  canPreview: boolean;
  canCheckout: boolean;
  checkoutState: { status: 'idle' | 'loading' | 'error'; message?: string };
  checkoutUnavailableReason: string;
  validationPdfState: { status: 'idle' | 'loading' | 'error'; message?: string };
  canDownloadValidationPdf: boolean;
  customerEmail: string;
  customerEmailPlaceholder: string;
  onCustomerEmailChange: (email: string) => void;
  supportHref: string;
  onCheckout: () => void;
  onDownloadValidationPdf: () => void;
  onSupport: () => void;
}) {
  const checkoutDisabled = !canCheckout || checkoutState.status === 'loading';
  const validationPdfDisabled = !canDownloadValidationPdf || validationPdfState.status === 'loading';
	  const checkoutMessage = checkoutState.status === 'error'
	    ? checkoutState.message
	    : !canCheckout
	      ? checkoutUnavailableReason
	      : '';
	  const checkoutMessagePrefix = checkoutState.status === 'error' ? '' : 'Falta: ';

  return (
    <section className="baraja-creator-checkout" aria-label="Resumen del pedido">
      <div>
        <span>Cartones:</span>
        <strong>{cardCount}</strong>
      </div>
      <div>
        <span>Precio:</span>
        <strong>{priceLabel}</strong>
      </div>
      <label className="baraja-checkout-email">
        <span>Email de entrega</span>
        <input
          type="email"
          id="baraja-checkout-email"
          name="email"
          value={customerEmail}
          onChange={(event) => onCustomerEmailChange(event.target.value)}
          placeholder={customerEmailPlaceholder}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <small>Te enviamos el PDF a este email.</small>
      </label>
	      {checkoutMessage ? (
	        <p className="baraja-checkout-message" role="status">
	          {checkoutMessagePrefix}{checkoutMessage}
	        </p>
	      ) : null}
      <footer>
        <Link to="/bingo-musical" className="baraja-checkout-cancel">Volver</Link>
        <button
          type="button"
          className="baraja-checkout-proceed"
          disabled={checkoutDisabled}
          onClick={onCheckout}
          aria-label={checkoutState.status === 'loading' ? 'Abriendo Mercado Pago' : 'Continuar con Mercado Pago'}
        >
          <BrandIcon name="mercadoPago" className="baraja-checkout-provider-icon" />
          {checkoutState.status === 'loading'
            ? 'Abriendo Mercado Pago...'
            : 'Continuar a Mercado Pago'}
        </button>
        {canDownloadValidationPdf ? (
          <button
            type="button"
            className="baraja-checkout-local-pdf"
            disabled={validationPdfDisabled}
            onClick={onDownloadValidationPdf}
          >
            {validationPdfState.status === 'loading'
              ? 'Generando PDF...'
              : 'Descargar PDF de prueba'}
          </button>
        ) : null}
        <span className="baraja-mercado-pago-value">Se abre el checkout seguro de Mercado Pago.</span>
      </footer>
      {validationPdfState.status === 'error' && validationPdfState.message ? (
        <p className="baraja-checkout-message" role="status">
          {validationPdfState.message}
        </p>
      ) : null}
      {canPreview ? (
        <a href={supportHref} className="baraja-checkout-support" onClick={onSupport}>
          <BrandIcon name="whatsapp" className="baraja-support-provider-icon" />
          ¿Es para un grupo grande? Hablemos
        </a>
      ) : null}
    </section>
  );
}

function CreatorNav() {
  return (
    <nav className="baraja-nav baraja-creator-app-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <Link to={CATALOG_ROUTE}>Catálogo</Link>
        <Link to="/bingo-musical">Bingo musical</Link>
      </div>
    </nav>
  );
}
