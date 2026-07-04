import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  generateMusicBingoCards,
  getMusicBingoPriceQuote,
  parseMusicBingoManualSongs,
  validateMusicBingoDraftSongs,
  type GeneratedMusicBingoCard,
  type MusicBingoBoardSize,
  type MusicBingoCreatorSongSource,
  type MusicBingoCreatorUseContext,
  type MusicBingoPlaylistReference,
  type MusicBingoSong,
  type MusicBingoTheme,
} from '@eb-packages/deck-engine';
import { parseSpotifyPlaylistId } from '@eb-packages/spotify-service';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';
import {
  BarajaMusicBingoCheckoutError,
  startBarajaMusicBingoCheckout,
  type BarajaMusicBingoCheckoutSource,
} from '../../services/musicBingoCheckout';
import { createMusicBingoPreviewPdfBlob } from './musicBingoPreviewPdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const CREATOR_ROUTE = '/bingo-musical/crear';
const CREATOR_SURFACE = 'music_bingo_creator';
const DEFAULT_THEME = MUSIC_BINGO_MVP_THEMES[0];
const DEFAULT_USE_CONTEXT: MusicBingoCreatorUseContext = 'private_event';
const CARD_COUNT_SLIDER_OPTIONS = MUSIC_BINGO_CARD_COUNT_OPTIONS.map((option) => option.cardCount);
const DEFAULT_CARD_COUNT =
  MUSIC_BINGO_CARD_COUNT_OPTIONS.find((option) => option.cardCount === 30)?.cardCount ??
  MUSIC_BINGO_CARD_COUNT_OPTIONS[0].cardCount;
const DEFAULT_PLAYLIST_URL = DEFAULT_THEME.playlist?.url ?? '';

const DELIVERABLES = [
  'Cartones imprimibles',
  'Hoja de control',
  'Reglas y variantes',
  'Guia de impresion',
  'Guia de dinamica',
  'QR opcional',
];

const PACK_TRUST_BADGES = [
  { code: 'PDF', label: 'PDF listo para imprimir' },
  { code: 'UNQ', label: 'Cartones unicos' },
  { code: 'GUIA', label: 'Guia del anfitrion' },
  { code: 'QR', label: 'QR opcional' },
];

function getThemeById(themeId: string): MusicBingoTheme {
  return MUSIC_BINGO_MVP_THEMES.find((theme) => theme.id === themeId) ?? DEFAULT_THEME;
}

function getThemeByPlaylistUrl(playlistUrl: string): MusicBingoTheme | undefined {
  const normalizedUrl = playlistUrl.trim();
  return MUSIC_BINGO_MVP_THEMES.find((theme) => theme.playlist?.url === normalizedUrl);
}

function getSourceLabel(source: MusicBingoCreatorSongSource, theme: MusicBingoTheme): string {
  return source === 'baraja_theme' ? `Coleccion Baraja: ${theme.title}` : 'Playlist propia de Spotify';
}

function getOfferingId(
  source: MusicBingoCreatorSongSource,
  theme: MusicBingoTheme,
  useContext: MusicBingoCreatorUseContext
): string {
  if (useContext === 'venue_event' || useContext === 'professional_facilitation') {
    return MUSIC_BINGO_BAR_EVENT_OFFERING.id;
  }

  return source === 'baraja_theme' ? theme.offeringId : MUSIC_BINGO_CUSTOM_OFFERING.id;
}

function buildOrderMessage(input: {
  gameName: string;
  useContext: MusicBingoCreatorUseContext;
  source: MusicBingoCreatorSongSource;
  theme: MusicBingoTheme;
  songs: MusicBingoSong[];
  cardCount: number;
  freeSpace: boolean;
  boardSize: MusicBingoBoardSize;
  priceLabel: string;
  playlist?: MusicBingoPlaylistReference;
}): string {
  const previewSongs = input.songs
    .slice(0, 12)
    .map((song) => `- ${song.artist} - ${song.title}`)
    .join('\n');

  return [
    'Hola, quiero armar un Bingo Musical con Baraja.',
    '',
    `Nombre del juego: ${input.gameName}`,
    `Fuente: ${getSourceLabel(input.source, input.theme)}`,
    `Cartones: ${input.cardCount}`,
    `Grid: ${input.boardSize} x ${input.boardSize}`,
    `Canciones cargadas: ${input.songs.length}`,
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
  | { status: 'success'; playlist: SpotifyImportedPlaylistPreview; songCount: number }
  | { status: 'fallback'; message: string };

interface SpotifyImportedTrackPreview {
  id: string | null;
  title: string;
  artistDisplayName: string;
  imageUrl: string | null;
}

interface SpotifyImportedPlaylistPreview {
  name: string;
  importedTrackCount: number;
  totalTracks: number | null;
  tracks: SpotifyImportedTrackPreview[];
}

interface SpotifyPlaylistImportSuccess {
  ok: true;
  playlist: SpotifyImportedPlaylistPreview;
  musicBingoSongs: string[];
}

interface SpotifyPlaylistImportFailure {
  ok: false;
  reason: string;
  message: string;
}

type SpotifyPlaylistImportResponse = SpotifyPlaylistImportSuccess | SpotifyPlaylistImportFailure;

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
    Array.isArray(playlist?.tracks) &&
    playlist.tracks.every(isSpotifyImportedTrackPreview) &&
    Array.isArray(value.musicBingoSongs) &&
    value.musicBingoSongs.every((song) => typeof song === 'string')
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

function getTrackingSongSource(
  source: MusicBingoCreatorSongSource,
  spotifyImportState: SpotifyImportState,
  hasSpotifyPlaylistUrl: boolean
): BarajaMusicBingoCheckoutSource {
  if (source === 'baraja_theme') return 'curated_spotify';
  if (spotifyImportState.status === 'success' || hasSpotifyPlaylistUrl) return 'custom_spotify';
  return 'manual_fallback';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCheckoutUnavailableReason(input: {
  canPreview: boolean;
  source: MusicBingoCreatorSongSource;
  hasSpotifyPlaylistId: boolean;
  priceMode: string;
}): string {
  if (!input.canPreview) return 'Completa canciones suficientes para pagar el pack.';
  if (input.priceMode !== 'founder_private') return 'Este uso se confirma con propuesta.';
  if (input.source !== 'baraja_theme' && !input.hasSpotifyPlaylistId) {
    return 'Para pagar directo necesitamos una playlist publica de Spotify recuperable.';
  }
  return '';
}

export default function MusicBingoCreator() {
  const [source, setSource] = useState<MusicBingoCreatorSongSource>('baraja_theme');
  const [themeId, setThemeId] = useState(DEFAULT_THEME.id);
  const [gameName, setGameName] = useState(DEFAULT_THEME.suggestedGameName);
  const useContext = DEFAULT_USE_CONTEXT;
  const [playlistUrl, setPlaylistUrl] = useState(DEFAULT_PLAYLIST_URL);
  const [manualSongs, setManualSongs] = useState('');
  const [spotifyImportState, setSpotifyImportState] = useState<SpotifyImportState>({ status: 'idle' });
  const [cardCount, setCardCount] = useState(DEFAULT_CARD_COUNT);
  const [boardSize, setBoardSize] = useState<MusicBingoBoardSize>(5);
  const [freeSpace, setFreeSpace] = useState(true);
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [checkoutState, setCheckoutState] = useState<
    { status: 'idle' | 'loading' | 'error'; message?: string }
  >({ status: 'idle' });
  const creatorStartedTracked = useRef(false);
  const gameNameInputRef = useRef<HTMLInputElement>(null);
  const lastImportedPlaylistUrlRef = useRef('');

  const theme = useMemo(() => getThemeById(themeId), [themeId]);
  const manualParse = useMemo(() => parseMusicBingoManualSongs(manualSongs), [manualSongs]);
  const songs = useMemo(
    () => (source === 'baraja_theme' ? theme.songs : manualParse.songs),
    [manualParse.songs, source, theme.songs]
  );
  const validation = useMemo(
    () => validateMusicBingoDraftSongs(songs, freeSpace, boardSize),
    [boardSize, freeSpace, songs]
  );
  const generated = useMemo(
    () =>
      generateMusicBingoCards({
        title: gameName.trim() || 'Bingo Musical Baraja',
        songs,
        cardCount,
        boardSize,
        freeSpace,
        seed: `${source}:${themeId}:${gameName}:${cardCount}:${boardSize}:${freeSpace}`,
      }),
    [boardSize, cardCount, freeSpace, gameName, songs, source, themeId]
  );
  const priceQuote = useMemo(
    () => getMusicBingoPriceQuote(cardCount, useContext),
    [cardCount, useContext]
  );
  const cardCountSliderIndex = Math.max(0, CARD_COUNT_SLIDER_OPTIONS.indexOf(cardCount));
  const playlistReference = useMemo<MusicBingoPlaylistReference | undefined>(() => {
    const trimmedUrl = playlistUrl.trim();
    if (!trimmedUrl) return undefined;

    if (source === 'baraja_theme' && theme.playlist?.url === trimmedUrl) {
      return theme.playlist;
    }

    return {
      provider: 'spotify',
      title: 'Playlist propia',
      url: trimmedUrl,
      note: 'Playlist publica compartida por el organizador. Baraja no vende musica ni derechos de reproduccion.',
    };
  }, [playlistUrl, source, theme.playlist]);
  const filteredCatalogThemes = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return MUSIC_BINGO_MVP_THEMES;

    return MUSIC_BINGO_MVP_THEMES.filter((candidate) =>
      [
        candidate.title,
        candidate.summary,
        candidate.playlist?.title,
        candidate.tags.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [catalogSearch]);
  const customSpotifyPlaylistId = useMemo(() => parseSpotifyPlaylistId(playlistUrl), [playlistUrl]);
  const trackingSource = getTrackingSongSource(source, spotifyImportState, Boolean(customSpotifyPlaylistId));
  const canUseMercadoPagoCheckout =
    validation.canPreview &&
    priceQuote.mode === 'founder_private' &&
    (source === 'baraja_theme' || Boolean(customSpotifyPlaylistId));
  const checkoutUnavailableReason = getCheckoutUnavailableReason({
    canPreview: validation.canPreview,
    source,
    hasSpotifyPlaylistId: Boolean(customSpotifyPlaylistId),
    priceMode: priceQuote.mode,
  });
  const previewCard = generated.cards[0];
  const offeringId = getOfferingId(source, theme, useContext);
  const orderMessage = buildOrderMessage({
    gameName: gameName.trim() || 'Bingo Musical Baraja',
    useContext,
    source,
    theme,
    songs: validation.usableSongs,
    cardCount,
    freeSpace,
    boardSize,
    priceLabel: priceQuote.label,
    playlist: playlistReference,
  });
  useEffect(() => {
    if (creatorStartedTracked.current) return;
    creatorStartedTracked.current = true;

    trackCreatorEvent('baraja_music_bingo_creator_started', {
      source: trackingSource,
      use_context: useContext,
      card_count: cardCount,
      board_size: boardSize,
      theme_id: theme.id,
    });
  }, [boardSize, cardCount, theme.id, trackingSource, useContext]);

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
      theme_id: source === 'baraja_theme' ? theme.id : 'custom_spotify',
    });
  }, [
    cardCount,
    boardSize,
    freeSpace,
    previewCard,
    trackingSource,
    source,
    theme.id,
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
      setSpotifyImportState({ status: 'loading' });

      try {
        const response = await fetch('/api/spotify/playlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ playlistUrl: trimmedPlaylistUrl, maxTracks: 200 }),
          signal: controller.signal,
        });
        const result = await readSpotifyImportResponse(response);

        if (result.ok && result.musicBingoSongs.length > 0) {
          setManualSongs(result.musicBingoSongs.join('\n'));
          lastImportedPlaylistUrlRef.current = trimmedPlaylistUrl;
          setSpotifyImportState({
            status: 'success',
            playlist: result.playlist,
            songCount: result.musicBingoSongs.length,
          });
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
    setGameName(nextTheme.suggestedGameName);
    setPlaylistUrl(nextTheme.playlist?.url ?? '');
    lastImportedPlaylistUrlRef.current = '';
    setSpotifyImportState({ status: 'idle' });
    setIsManualImportOpen(false);
    setIsCatalogOpen(false);
    if (source !== 'baraja_theme') {
      setSource('baraja_theme');
    }
    trackCreatorEvent('baraja_music_bingo_song_source_selected', {
      source: 'curated_spotify',
      use_context: useContext,
      theme_id: nextTheme.id,
    });
  }

  function updatePlaylistUrl(nextPlaylistUrl: string) {
    setPlaylistUrl(nextPlaylistUrl);
    lastImportedPlaylistUrlRef.current = '';

    const matchingTheme = getThemeByPlaylistUrl(nextPlaylistUrl);
    if (matchingTheme) {
      setThemeId(matchingTheme.id);
      setGameName(matchingTheme.suggestedGameName);
      setSpotifyImportState({ status: 'idle' });
      setIsManualImportOpen(false);
      if (source !== 'baraja_theme') setSource('baraja_theme');
      return;
    }

    setSpotifyImportState({ status: 'idle' });
    setIsManualImportOpen(false);

    if (source !== 'manual') {
      setSource('manual');
      trackCreatorEvent('baraja_music_bingo_song_source_selected', {
        source: 'custom_spotify',
        use_context: useContext,
        theme_id: 'custom_playlist_url',
      });
    }
  }

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
      theme_id: source === 'baraja_theme' ? theme.id : 'custom_spotify',
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
      theme_id: source === 'baraja_theme' ? theme.id : 'custom_spotify',
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
        themeId: source === 'baraja_theme' ? theme.id : 'custom_spotify',
        playlistId:
          source === 'baraja_theme'
            ? parseSpotifyPlaylistId(theme.playlist?.url ?? '')
            : customSpotifyPlaylistId,
      });

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
          <header className="baraja-creator-workspace-head">
            <div>
              <p className="baraja-kicker">Bingo musical</p>
              <h1>Tene tu noche lista para jugar</h1>
              <p>
                Pega una playlist de Spotify, elegi cartones y formato. Baraja arma
                un pack imprimible con cartones unicos, hoja de control y guia para
                conducir el juego.
              </p>
              <div className="baraja-creator-trust-badges" aria-label="Incluido en el pack">
                {PACK_TRUST_BADGES.map((badge) => (
                  <span key={badge.label}>
                    <b>{badge.code}</b>
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <section className="baraja-creator-workspace-shell" aria-label="Configuracion del juego">
            <section className="baraja-creator-setup-panel">
              <section className="baraja-creator-name-field" aria-label="Nombre del juego">
                <CreatorStepHeading step="1" title="Nombre del juego" />
                <label className="baraja-field">
                  <input
                    ref={gameNameInputRef}
                    value={gameName}
                    onChange={(event) => setGameName(event.target.value)}
                    placeholder="Noche Rock Argentino"
                  />
                </label>
              </section>

              <section className="baraja-creator-step" aria-label="Cartones">
                <CreatorStepHeading step="2" title="Cartones" />
                <div className="baraja-count-editor">
                  <div className="baraja-count-readout">
                    <div>
                      <strong>{cardCount}</strong>
                      <span>Cartones</span>
                    </div>
                    <div className="baraja-count-price">
                      <b>{priceQuote.label}</b>
                      <small>
                        {priceQuote.mode === 'founder_private'
                          ? 'Precio fundador Argentina'
                          : priceQuote.summary}
                      </small>
                    </div>
                  </div>
                  <section className="baraja-count-helper" aria-label="Aviso sobre cantidad de cartones">
                    <p>
                      Crear varios juegos con la misma playlist puede repetir combinaciones.
                      Para mas variedad, aumenta la cantidad de cartones.
                    </p>
                  </section>
                  <label className="baraja-count-slider" aria-label="Cantidad de cartones">
                    <input
                      type="range"
                      min={0}
                      max={CARD_COUNT_SLIDER_OPTIONS.length - 1}
                      step={1}
                      value={cardCountSliderIndex}
                      onChange={(event) => {
                        const nextCardCount =
                          CARD_COUNT_SLIDER_OPTIONS[Number(event.target.value)] ??
                          CARD_COUNT_SLIDER_OPTIONS[0];
                        selectCardCount(nextCardCount);
                      }}
                    />
                    <span>
                      {CARD_COUNT_SLIDER_OPTIONS.map((option) => (
                        <i key={option}>{option}</i>
                      ))}
                    </span>
                  </label>
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
                  <div className="baraja-count-options" aria-label="Cantidad de cartones">
                    {MUSIC_BINGO_CARD_COUNT_OPTIONS.map((option) => (
                      <button
                        key={option.cardCount}
                        type="button"
                        className={cardCount === option.cardCount ? 'is-selected' : ''}
                        onClick={() => selectCardCount(option.cardCount)}
                      >
                        {option.cardCount}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="baraja-creator-step" aria-label="Formato del carton">
                <CreatorStepHeading step="3" title="Formato del carton" />
                <PreviewFormatControls
                  boardSize={boardSize}
                  requiredSongCount={validation.requiredSongCount}
                  onBoardSizeChange={selectBoardSize}
                />
              </section>

              <section className="baraja-creator-step" id="playlist-catalog" aria-label="Canciones">
                <CreatorStepHeading step="4" title="Playlist de Spotify" />

                <PlaylistUrlReview
                  playlistUrl={playlistUrl}
                  onPlaylistUrlChange={updatePlaylistUrl}
                  onOpenCatalog={() => {
                    setCatalogSearch('');
                    setIsCatalogOpen(true);
                  }}
                />

                {source === 'baraja_theme' ? (
                  <>
                    <PlaylistTrackList theme={theme} />
                  </>
                ) : (
                  <section className="baraja-spotify-import-stack">
                    <SpotifyPlaylistPreviewCard state={spotifyImportState} />
                    <SpotifyImportNotice state={spotifyImportState} />
                    <ManualImportPanel
                      isOpen={isManualImportOpen}
                      songs={manualSongs}
                      onSongsChange={setManualSongs}
                      onToggle={() => setIsManualImportOpen((current) => !current)}
                    />
                  </section>
                )}
              </section>

              <ValidationSummary validation={validation} />
            </section>

            <aside className="baraja-creator-preview-order" aria-label="Vista previa y pedido">
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
                songCount={validation.usableSongs.length}
                boardSize={boardSize}
                priceLabel={priceQuote.label}
                canPreview={validation.canPreview}
                canCheckout={canUseMercadoPagoCheckout}
                checkoutState={checkoutState}
                checkoutUnavailableReason={checkoutUnavailableReason}
                supportHref={getBarajaInquiryHref(orderMessage)}
                onCheckout={() => void handleCheckout()}
                onSupport={trackOrderStart}
              />

              <CreatorInstructions />
            </aside>
          </section>
        </section>
      </section>
      <PlaylistCatalogModal
        isOpen={isCatalogOpen}
        search={catalogSearch}
        themes={filteredCatalogThemes}
        selectedThemeId={theme.id}
        onSearchChange={setCatalogSearch}
        onSelectTheme={selectTheme}
        onClose={() => setIsCatalogOpen(false)}
      />
    </main>
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
        <small>{requiredSongCount} canciones por carton</small>
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

function CreatorStepHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="baraja-creator-step-head">
      <span>{step}</span>
      <h2>{title}</h2>
    </div>
  );
}

function PlaylistUrlReview({
  playlistUrl,
  onPlaylistUrlChange,
  onOpenCatalog,
}: {
  playlistUrl: string;
  onPlaylistUrlChange: (playlistUrl: string) => void;
  onOpenCatalog: () => void;
}) {
  return (
    <section className="baraja-playlist-url-review" aria-label="Playlist de Spotify">
      <label>
        <span>URL de Spotify</span>
        <input
          value={playlistUrl}
          onChange={(event) => onPlaylistUrlChange(event.target.value)}
          placeholder="https://open.spotify.com/playlist/1234567890"
        />
      </label>
      <p>
        La playlist debe ser publica. Baraja intenta importar las canciones y,
        si Spotify no las devuelve, podes editar el listado manualmente.
      </p>
      <button type="button" onClick={onOpenCatalog}>
        <SpotifyLogoMark />
        Ver catalogo de playlists curadas
        <b aria-hidden="true">&gt;</b>
      </button>
    </section>
  );
}

function SpotifyLogoMark() {
  return (
    <i className="baraja-spotify-logo" aria-hidden="true">
      <em />
      <em />
      <em />
    </i>
  );
}

function SpotifyImportNotice({ state }: { state: SpotifyImportState }) {
  if (state.status === 'idle') return null;

  const className = `baraja-spotify-import-status is-${state.status}`;
  if (state.status === 'loading') {
    return (
      <p className={className} role="status">
        Importando canciones desde Spotify...
      </p>
    );
  }

  if (state.status === 'success') {
    return (
      <p className="sr-only" role="status">
        Importamos {state.songCount} canciones de {state.playlist.name}.
      </p>
    );
  }

  return (
    <p className={className} role="status">
      {state.message} Podes usar la carga manual para continuar.
    </p>
  );
}

function ManualImportPanel({
  isOpen,
  songs,
  onSongsChange,
  onToggle,
}: {
  isOpen: boolean;
  songs: string;
  onSongsChange: (songs: string) => void;
  onToggle: () => void;
}) {
  return (
    <section className="baraja-manual-import" aria-label="Carga manual de canciones">
      <button
        type="button"
        className="baraja-manual-import-toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        {isOpen ? 'Ocultar carga manual' : 'Importar manualmente'}
      </button>
      {isOpen ? (
        <label className="baraja-field baraja-manual-import-field">
          <span>Canciones manuales</span>
          <textarea
            value={songs}
            onChange={(event) => onSongsChange(event.target.value)}
            placeholder={'Soda Stereo - De musica ligera\nLos Redondos - Jijiji\nCharly Garcia - Demoliendo hoteles'}
            rows={6}
          />
          <small>
            Usa una cancion por linea con formato artista - cancion. El link de
            Spotify queda guardado en el pedido.
          </small>
        </label>
      ) : null}
    </section>
  );
}

function SpotifyPlaylistPreviewCard({ state }: { state: SpotifyImportState }) {
  if (state.status !== 'success') return null;

  const { playlist } = state;
  const totalTrackCount = playlist.totalTracks ?? playlist.importedTrackCount;

  return (
    <section className="baraja-spotify-playlist-card" aria-label="Playlist importada">
      <header>
        <h3>{playlist.name}</h3>
        <span>{totalTrackCount} tracks</span>
      </header>

      <div className="baraja-spotify-playlist-scroll">
        {playlist.tracks.map((track, index) => (
          <article className="baraja-spotify-preview-track" key={track.id ?? `${track.title}:${index}`}>
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
    </section>
  );
}

function getSpotifyTrackInitials(track: SpotifyImportedTrackPreview): string {
  const titleInitial = track.title.trim()[0] ?? 'S';
  const artistInitial = track.artistDisplayName.trim()[0] ?? 'P';
  return `${titleInitial}${artistInitial}`.toUpperCase();
}

function PlaylistCatalogModal({
  isOpen,
  search,
  themes,
  selectedThemeId,
  onSearchChange,
  onSelectTheme,
  onClose,
}: {
  isOpen: boolean;
  search: string;
  themes: MusicBingoTheme[];
  selectedThemeId: string;
  onSearchChange: (search: string) => void;
  onSelectTheme: (theme: MusicBingoTheme) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="baraja-playlist-modal-backdrop" role="presentation">
      <section
        className="baraja-playlist-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Catalogo de playlists"
      >
        <header>
          <div>
            <h2>Catalogo de playlists</h2>
            <p>Elegi una playlist curada de Spotify y Baraja completa la URL y las canciones.</p>
          </div>
          <button type="button" aria-label="Cerrar catalogo" onClick={onClose}>
            x
          </button>
        </header>

        <label className="baraja-playlist-modal-search">
          <span>Buscar playlist</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por titulo, descripcion o tema"
            autoFocus
          />
        </label>

        <div className="baraja-playlist-modal-grid">
          {themes.map((candidate) => (
            <article
              className={candidate.id === selectedThemeId ? 'is-selected' : ''}
              key={candidate.id}
            >
              <div className="baraja-playlist-modal-art" aria-hidden="true">
                {candidate.playlist?.coverImageUrl ? (
                  <img
                    src={candidate.playlist.coverImageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                <span>{candidate.tags.slice(0, 3).join(' / ')}</span>
              </div>
              <div>
                <strong>{candidate.playlist?.title ?? candidate.title}</strong>
                <small>{candidate.title}</small>
                <p>{candidate.summary}</p>
                <button type="button" onClick={() => onSelectTheme(candidate)}>
                  Usar playlist
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlaylistTrackList({ theme }: { theme: MusicBingoTheme }) {
  const playlistTitle = theme.playlist?.title ?? theme.title;

  return (
    <section className="baraja-playlist-detail" aria-label="Canciones de la playlist">
      <header>
        <div>
          <h2>{playlistTitle}</h2>
          <span>{theme.songs.length} canciones</span>
        </div>
      </header>
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
    </section>
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

    void renderPdfPage();

    return () => {
      isCancelled = true;
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

function CreatorInstructions() {
  return (
    <section className="baraja-creator-instructions" aria-label="Instrucciones">
      <div className="baraja-creator-instruction-box">
        <h2>Antes de pedir</h2>
        <p>
          Revisa canciones, cantidad de cartones y vista previa. El pack incluye
          materiales para imprimir y conducir la dinamica.
        </p>
      </div>
      <div className="baraja-creator-warning-box">
        Baraja entrega los materiales del juego; no incluye musica, derechos,
        impresion fisica ni envio.
      </div>
    </section>
  );
}

function CheckoutReview({
  cardCount,
  songCount,
  boardSize,
  priceLabel,
  canPreview,
  canCheckout,
  checkoutState,
  checkoutUnavailableReason,
  supportHref,
  onCheckout,
  onSupport,
}: {
  cardCount: number;
  songCount: number;
  boardSize: MusicBingoBoardSize;
  priceLabel: string;
  canPreview: boolean;
  canCheckout: boolean;
  checkoutState: { status: 'idle' | 'loading' | 'error'; message?: string };
  checkoutUnavailableReason: string;
  supportHref: string;
  onCheckout: () => void;
  onSupport: () => void;
}) {
  const checkoutDisabled = !canCheckout || checkoutState.status === 'loading';
  const checkoutMessage = checkoutState.status === 'error'
    ? checkoutState.message
    : !canCheckout
      ? checkoutUnavailableReason
      : '';

  return (
    <section className="baraja-creator-checkout" aria-label="Resumen del pedido">
      <div>
        <span>Cartones:</span>
        <strong>{cardCount}</strong>
      </div>
      <div>
        <span>Canciones:</span>
        <strong>{songCount}</strong>
      </div>
      <div>
        <span>Formato:</span>
        <strong>{boardSize} x {boardSize}</strong>
      </div>
      <div>
        <span>Precio:</span>
        <strong>{priceLabel}</strong>
      </div>
      <footer>
        <Link to="/bingo-musical" className="baraja-checkout-cancel">Volver</Link>
        <button
          type="button"
          className="baraja-checkout-proceed"
          disabled={checkoutDisabled}
          onClick={onCheckout}
        >
          {checkoutState.status === 'loading' ? 'Abriendo Mercado Pago...' : 'Pagar con Mercado Pago'}
        </button>
      </footer>
      {checkoutMessage ? (
        <p className="baraja-checkout-message" role="status">
          {checkoutMessage}
        </p>
      ) : null}
      {canPreview ? (
        <a href={supportHref} className="baraja-checkout-support" onClick={onSupport}>
          Necesito ayuda por WhatsApp
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
        <a href="#playlist-catalog">Colecciones</a>
        <Link to="/bingo-musical">Bingo musical</Link>
      </div>
    </nav>
  );
}

function ValidationSummary({
  validation,
}: {
  validation: ReturnType<typeof validateMusicBingoDraftSongs>;
}) {
  return (
    <div className={validation.canPreview ? 'baraja-validation is-ready' : 'baraja-validation'}>
      <strong>
        {validation.canPreview
          ? `Listo: ${validation.usableSongs.length} canciones disponibles`
          : validation.errors[0]}
      </strong>
      {validation.warnings.map((warning) => (
        <span key={warning}>{warning}</span>
      ))}
    </div>
  );
}
