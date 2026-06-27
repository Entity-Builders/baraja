export { getErrorMessage } from '../../lib/errors';

export interface GenerationResult {
  success: boolean;
  slug?: string;
  name?: string;
  card_count?: number;
  error?: string;
}

export interface EnrichedItem {
  title: string;
  year?: string;
  director?: string;
  genre?: string;
  actors?: string;
  plot?: string;
  poster?: string;
  imdbRating?: string;
  awards?: string;
  country?: string;
  wikiExtract?: string;
  _notFound?: boolean;
  _error?: string;
}

export type JsonRecord = Record<string, unknown>;

export type EnrichResponse =
  | { success: true; data: EnrichedItem[] }
  | { success: false; error: string };

export type PromptPreviewResponse =
  | { success: true; userPrompt: string; estimatedTokens?: number }
  | { success: false; error: string };

export type GenerationStreamEvent =
  | { type: 'progress'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; data: GenerationResult };

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getStringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getNumberField(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function readJsonRecord(response: Response): Promise<JsonRecord> {
  const value: unknown = await response.json();

  if (!isJsonRecord(value)) {
    throw new Error('El servidor devolvió una respuesta inválida.');
  }

  return value;
}

function normalizeEnrichedItem(value: unknown): EnrichedItem | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const title = getStringField(value, 'title');
  if (!title) {
    return null;
  }

  return {
    title,
    year: getStringField(value, 'year'),
    director: getStringField(value, 'director'),
    genre: getStringField(value, 'genre'),
    actors: getStringField(value, 'actors'),
    plot: getStringField(value, 'plot'),
    poster: getStringField(value, 'poster'),
    imdbRating: getStringField(value, 'imdbRating'),
    awards: getStringField(value, 'awards'),
    country: getStringField(value, 'country'),
    wikiExtract: getStringField(value, 'wikiExtract'),
    _notFound: value._notFound === true,
    _error: getStringField(value, '_error'),
  };
}

export function toEnrichResponse(value: JsonRecord): EnrichResponse {
  if (value.success !== true) {
    return {
      success: false,
      error: getStringField(value, 'error') ?? 'No se pudo enriquecer la lista.',
    };
  }

  const rawItems = Array.isArray(value.data) ? value.data : [];
  const data = rawItems
    .map(normalizeEnrichedItem)
    .filter((item): item is EnrichedItem => Boolean(item));

  return { success: true, data };
}

export function toPromptPreviewResponse(value: JsonRecord): PromptPreviewResponse {
  if (value.success !== true) {
    return {
      success: false,
      error: getStringField(value, 'error') ?? 'No se pudo armar el prompt.',
    };
  }

  const userPrompt = getStringField(value, 'userPrompt');
  if (!userPrompt) {
    return {
      success: false,
      error: 'El servidor no devolvió un prompt para previsualizar.',
    };
  }

  return {
    success: true,
    userPrompt,
    estimatedTokens: getNumberField(value, 'estimatedTokens'),
  };
}

export function toGenerationResult(value: unknown): GenerationResult {
  if (!isJsonRecord(value)) {
    return {
      success: false,
      error: 'El servidor devolvió una respuesta inválida.',
    };
  }

  const success = value.success === true;

  return {
    success,
    slug: getStringField(value, 'slug'),
    name: getStringField(value, 'name'),
    card_count: getNumberField(value, 'card_count'),
    error: success
      ? undefined
      : getStringField(value, 'error') ?? 'La generación falló sin detalle.',
  };
}

export function toGenerationStreamEvent(value: unknown): GenerationStreamEvent | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const type = getStringField(value, 'type');
  const message = getStringField(value, 'message') ?? '';

  if (type === 'progress') {
    return { type, message };
  }

  if (type === 'error') {
    return { type, message: message || 'La generación falló sin detalle.' };
  }

  if (type === 'done') {
    return { type, data: toGenerationResult(value.data) };
  }

  return null;
}
