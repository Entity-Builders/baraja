import type {
  GeneratedMusicBingoCard,
  MusicBingoBoardSize,
  MusicBingoCreatorUseContext,
  MusicBingoEventRuleProfile,
  MusicBingoPlaylistFitReport,
  MusicBingoPlaylistReference,
} from '@eb-packages/deck-engine';

export type BarajaMusicBingoCheckoutSource =
  | 'curated_spotify'
  | 'custom_spotify'
  | 'manual_fallback';

export type BarajaMusicBingoPriceMode = 'founder_private' | 'prebuilt' | 'playlist_own';

export interface StartBarajaMusicBingoCheckoutInput {
  cardCount: number;
  boardSize: MusicBingoBoardSize;
  freeSpace: boolean;
  songCount: number;
  source: BarajaMusicBingoCheckoutSource;
  useContext: MusicBingoCreatorUseContext;
  offeringId: string;
  themeId: string;
  playlistId: string | null;
  customerEmail: string;
  analyticsDistinctId?: string | null;
  packSnapshot: BarajaMusicBingoCheckoutPackSnapshot;
}

export interface BarajaMusicBingoCheckoutResponse {
  checkoutUrl: string;
  externalReference: string;
  orderId: string;
  provider: 'mercado_pago';
  status: 'pending';
  purchase: {
    offeringId: string;
    cardCount: number;
    boardSize: MusicBingoBoardSize;
    songCount: number;
    amount: number;
    amountCents: number;
    currency: 'ARS';
    priceMode: BarajaMusicBingoPriceMode;
  };
}

export interface BarajaMusicBingoCheckoutPackSnapshot {
  title: string;
  subtitle?: string;
  cardCount: number;
  boardSize: MusicBingoBoardSize;
  songCount: number;
  freeSpace: boolean;
  sourceLabel?: string;
  priceLabel?: string;
  playlist?: MusicBingoPlaylistReference | null;
  playlistFit?: MusicBingoPlaylistFitReport;
  eventRuleProfile?: MusicBingoEventRuleProfile;
  cards: GeneratedMusicBingoCard[];
  controlSheet: Array<{
    number: number;
    artist: string;
    title: string;
  }>;
  setupSteps?: string[];
  playRules?: string[];
  printGuide?: string[];
  legalSummary?: string;
}

export type BarajaMusicBingoOrderStatus =
  | 'pending'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed'
  | 'expired'
  | 'unverified';

export interface BarajaMusicBingoOrderStatusResponse {
  order: {
    id: string;
    status: BarajaMusicBingoOrderStatus;
    ready: boolean;
    providerStatus: string | null;
    emailStatus: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
    purchase: {
      offeringId: string;
      cardCount: number;
      boardSize: MusicBingoBoardSize;
      songCount: number;
      amountCents: number;
      currency: 'ARS';
      priceMode: BarajaMusicBingoPriceMode;
    };
    paidAt: string | null;
    readyAt: string | null;
    createdAt: string;
  };
}

type BarajaMusicBingoCheckoutErrorResponse = {
  error: string;
};

export class BarajaMusicBingoCheckoutError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BarajaMusicBingoCheckoutError';
    this.status = status;
  }
}

const BARAJA_MUSIC_BINGO_CHECKOUT_FUNCTION_PATH =
  '/functions/v1/baraja-music-bingo-checkout';
const BARAJA_MUSIC_BINGO_VALIDATION_PDF_DEV_PATH =
  '/__baraja__/music-bingo-validation-pdf';

const buildBarajaMusicBingoCheckoutFunctionUrl = (supabaseUrl: string) =>
  `${supabaseUrl.replace(/\/$/, '')}${BARAJA_MUSIC_BINGO_CHECKOUT_FUNCTION_PATH}`;

export const getBarajaMusicBingoCheckoutFunctionUrl = () => {
  const explicitUrl =
    import.meta.env.VITE_BARAJA_MUSIC_BINGO_CHECKOUT_API_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) return '';

  return buildBarajaMusicBingoCheckoutFunctionUrl(supabaseUrl);
};

const getBarajaMusicBingoValidationPdfFunctionUrl = () => {
  if (import.meta.env.DEV) {
    return BARAJA_MUSIC_BINGO_VALIDATION_PDF_DEV_PATH;
  }

  return getBarajaMusicBingoCheckoutFunctionUrl();
};

const buildRequestUrl = (endpoint: string) => {
  if (endpoint.startsWith('/')) {
    return new URL(endpoint, window.location.origin);
  }

  return new URL(endpoint);
};

export const startBarajaMusicBingoCheckout = async (
  input: StartBarajaMusicBingoCheckoutInput
) => {
  const endpoint = getBarajaMusicBingoCheckoutFunctionUrl();
  if (!endpoint) {
    throw new BarajaMusicBingoCheckoutError(
      'El checkout de Mercado Pago no esta configurado en este entorno.',
      0
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const data = (await response.json().catch(() => null)) as
    | BarajaMusicBingoCheckoutResponse
    | BarajaMusicBingoCheckoutErrorResponse
    | null;

  if (!response.ok) {
    const message =
      data && 'error' in data ? data.error : 'No pudimos iniciar Mercado Pago.';
    throw new BarajaMusicBingoCheckoutError(message, response.status);
  }

  if (!isBarajaMusicBingoCheckoutResponse(data)) {
    throw new BarajaMusicBingoCheckoutError(
      'Mercado Pago no devolvio una respuesta valida.',
      response.status
    );
  }

  return data;
};

export const createBarajaMusicBingoValidationPdf = async (
  packSnapshot: BarajaMusicBingoCheckoutPackSnapshot
): Promise<Blob> => {
  const endpoint = getBarajaMusicBingoValidationPdfFunctionUrl();
  if (!endpoint) {
    throw new BarajaMusicBingoCheckoutError(
      'La generacion local del PDF no esta configurada en este entorno.',
      0
    );
  }

  const url = buildRequestUrl(endpoint);
  url.searchParams.set('action', 'preview_pdf');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/pdf',
    },
    body: JSON.stringify({ packSnapshot }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | BarajaMusicBingoCheckoutErrorResponse
      | null;
    const message =
      data && 'error' in data ? data.error : 'No pudimos generar el PDF local.';
    throw new BarajaMusicBingoCheckoutError(message, response.status);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/pdf')) {
    throw new BarajaMusicBingoCheckoutError(
      'La validacion local no devolvio un PDF.',
      response.status
    );
  }

  return response.blob();
};

export const getBarajaMusicBingoOrderStatus = async (
  orderId: string,
  accessToken: string,
  providerPaymentId?: string | null
) => {
  const endpoint = buildBarajaMusicBingoOrderAccessUrl(
    'status',
    orderId,
    accessToken,
    providerPaymentId
  );
  if (!endpoint) {
    throw new BarajaMusicBingoCheckoutError(
      'El estado del pedido no esta configurado en este entorno.',
      0
    );
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
  const data = (await response.json().catch(() => null)) as
    | BarajaMusicBingoOrderStatusResponse
    | BarajaMusicBingoCheckoutErrorResponse
    | null;

  if (!response.ok) {
    const message =
      data && 'error' in data ? data.error : 'No pudimos leer el estado del pedido.';
    throw new BarajaMusicBingoCheckoutError(message, response.status);
  }

  if (!isBarajaMusicBingoOrderStatusResponse(data)) {
    throw new BarajaMusicBingoCheckoutError(
      'El estado del pedido no devolvio una respuesta valida.',
      response.status
    );
  }

  return data;
};

export const getBarajaMusicBingoOrderDownloadUrl = (
  orderId: string,
  accessToken: string
) => buildBarajaMusicBingoOrderAccessUrl('download', orderId, accessToken);

function buildBarajaMusicBingoOrderAccessUrl(
  action: 'status' | 'download',
  orderId: string,
  accessToken: string,
  providerPaymentId?: string | null
) {
  const endpoint = getBarajaMusicBingoCheckoutFunctionUrl();
  if (!endpoint) return '';
  const url = new URL(endpoint);
  url.searchParams.set('action', action);
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('access_token', accessToken);
  if (action === 'status' && providerPaymentId) {
    url.searchParams.set('payment_id', providerPaymentId);
  }
  return url.toString();
}

function isBarajaMusicBingoCheckoutResponse(
  value: unknown
): value is BarajaMusicBingoCheckoutResponse {
  if (!isRecord(value) || !isRecord(value.purchase)) return false;

  return (
    typeof value.checkoutUrl === 'string' &&
    typeof value.externalReference === 'string' &&
    typeof value.orderId === 'string' &&
    value.provider === 'mercado_pago' &&
    value.status === 'pending' &&
    typeof value.purchase.offeringId === 'string' &&
    typeof value.purchase.cardCount === 'number' &&
    (value.purchase.boardSize === 3 ||
      value.purchase.boardSize === 4 ||
      value.purchase.boardSize === 5) &&
    typeof value.purchase.songCount === 'number' &&
    typeof value.purchase.amount === 'number' &&
    typeof value.purchase.amountCents === 'number' &&
    value.purchase.currency === 'ARS' &&
    isBarajaMusicBingoPriceMode(value.purchase.priceMode)
  );
}

function isBarajaMusicBingoOrderStatusResponse(
  value: unknown
): value is BarajaMusicBingoOrderStatusResponse {
  if (!isRecord(value) || !isRecord(value.order) || !isRecord(value.order.purchase)) {
    return false;
  }

  return (
    typeof value.order.id === 'string' &&
    typeof value.order.status === 'string' &&
    typeof value.order.ready === 'boolean' &&
    (typeof value.order.providerStatus === 'string' || value.order.providerStatus === null) &&
    typeof value.order.emailStatus === 'string' &&
    typeof value.order.purchase.offeringId === 'string' &&
    typeof value.order.purchase.cardCount === 'number' &&
    (value.order.purchase.boardSize === 3 ||
      value.order.purchase.boardSize === 4 ||
      value.order.purchase.boardSize === 5) &&
    typeof value.order.purchase.songCount === 'number' &&
    typeof value.order.purchase.amountCents === 'number' &&
    value.order.purchase.currency === 'ARS' &&
    isBarajaMusicBingoPriceMode(value.order.purchase.priceMode)
  );
}

function isBarajaMusicBingoPriceMode(value: unknown): value is BarajaMusicBingoPriceMode {
  return value === 'founder_private' || value === 'prebuilt' || value === 'playlist_own';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
