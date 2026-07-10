export interface BarajaAcquisitionContext {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  referrerHost?: string;
}

export interface BarajaAcquisitionEntry {
  search: string;
  referrer: string;
  host: string;
}

export interface BarajaSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'baraja_acquisition_context_v1';
const STORAGE_VERSION = 1;
const MAX_LABEL_LENGTH = 64;

type StoredAcquisitionContext = {
  version: number;
  context: BarajaAcquisitionContext;
};

export function resolveBarajaAcquisitionContext(
  entry: BarajaAcquisitionEntry
): BarajaAcquisitionContext {
  const params = new URLSearchParams(entry.search);
  const source = normalizeAttributionLabel(params.get('utm_source'));
  const medium = normalizeAttributionLabel(params.get('utm_medium'));
  const campaign = normalizeAttributionLabel(params.get('utm_campaign'));
  const content = normalizeAttributionLabel(params.get('utm_content'));
  const referrerHost = source
    ? undefined
    : getExternalReferrerHost(entry.referrer, entry.host);

  return omitEmpty({ source, medium, campaign, content, referrerHost });
}

export function getOrCreateBarajaAcquisitionContext(
  entry: BarajaAcquisitionEntry,
  storage: BarajaSessionStorage
): BarajaAcquisitionContext {
  const stored = readStoredContext(storage);
  if (stored) return stored.context;

  const context = resolveBarajaAcquisitionContext(entry);
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, context } satisfies StoredAcquisitionContext)
    );
  } catch {
    // The module-level fallback below keeps the first context in private browsing modes.
  }

  return context;
}

export function getBarajaAcquisitionContext(): BarajaAcquisitionContext {
  if (typeof window === 'undefined') return {};

  if (browserSessionContext) return browserSessionContext;

  const entry = {
    search: window.location.search,
    referrer: document.referrer,
    host: window.location.hostname,
  };

  try {
    browserSessionContext = getOrCreateBarajaAcquisitionContext(entry, window.sessionStorage);
  } catch {
    browserSessionContext = resolveBarajaAcquisitionContext(entry);
  }

  return browserSessionContext;
}

export function toBarajaAcquisitionAnalyticsProperties(
  context: BarajaAcquisitionContext
): Record<string, string> {
  return omitEmpty({
    acquisition_source: context.source,
    acquisition_medium: context.medium,
    acquisition_campaign: context.campaign,
    acquisition_content: context.content,
    acquisition_referrer_host: context.referrerHost,
  });
}

let browserSessionContext: BarajaAcquisitionContext | null = null;

function readStoredContext(storage: BarajaSessionStorage): StoredAcquisitionContext | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isStoredContext(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function isStoredContext(value: unknown): value is StoredAcquisitionContext {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION || !record.context || typeof record.context !== 'object') {
    return false;
  }

  const context = record.context as Record<string, unknown>;
  return (
    isStoredLabel(context.source) &&
    isStoredLabel(context.medium) &&
    isStoredLabel(context.campaign) &&
    isStoredLabel(context.content) &&
    isStoredLabel(context.referrerHost)
  );
}

function isStoredLabel(value: unknown) {
  return value === undefined || isNormalizedAttributionLabel(value);
}

function normalizeAttributionLabel(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_LABEL_LENGTH ||
    /[@:/?&#=]/.test(trimmed)
  ) {
    return undefined;
  }

  const normalized = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');

  return isNormalizedAttributionLabel(normalized) ? normalized : undefined;
}

function getExternalReferrerHost(referrer: string, currentHost: string): string | undefined {
  if (!referrer) return undefined;

  try {
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    const normalizedCurrentHost = currentHost.toLowerCase();
    if (
      !referrerHost ||
      referrerHost === normalizedCurrentHost ||
      referrerHost === 'baraja.cards' ||
      referrerHost.endsWith('.baraja.cards')
    ) {
      return undefined;
    }

    return isNormalizedAttributionLabel(referrerHost) ? referrerHost : undefined;
  } catch {
    return undefined;
  }
}

function isNormalizedAttributionLabel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)
  );
}

function omitEmpty<T extends Record<string, string | undefined>>(value: T): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}
