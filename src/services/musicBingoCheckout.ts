import type { MusicBingoBoardSize, MusicBingoCreatorUseContext } from '@eb-packages/deck-engine';

export type BarajaMusicBingoCheckoutSource =
  | 'curated_spotify'
  | 'custom_spotify'
  | 'manual_fallback';

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
}

export interface BarajaMusicBingoCheckoutResponse {
  checkoutUrl: string;
  externalReference: string;
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
    priceMode: 'founder_private';
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

export const getBarajaMusicBingoCheckoutFunctionUrl = () => {
  const explicitUrl =
    import.meta.env.VITE_BARAJA_MUSIC_BINGO_CHECKOUT_API_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) return '';

  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/baraja-music-bingo-checkout`;
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

function isBarajaMusicBingoCheckoutResponse(
  value: unknown
): value is BarajaMusicBingoCheckoutResponse {
  if (!isRecord(value) || !isRecord(value.purchase)) return false;

  return (
    typeof value.checkoutUrl === 'string' &&
    typeof value.externalReference === 'string' &&
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
    value.purchase.priceMode === 'founder_private'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
