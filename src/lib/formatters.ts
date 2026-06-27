type DateInput = Date | number | string | null | undefined;

interface CurrencyFormatOptions {
  locale?: string | string[];
  maximumFractionDigits?: number;
}

export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string | string[],
  fallback = 'sin fecha',
): string {
  const date = getValidDate(value);
  return date ? date.toLocaleDateString(locale, options) : fallback;
}

export function formatTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string | string[],
  fallback = 'sin hora',
): string {
  const date = getValidDate(value);
  return date ? date.toLocaleTimeString(locale, options) : fallback;
}

export function formatCurrencyAmount(
  amountInCents: number,
  currencyCode: string,
  { locale = 'es-AR', maximumFractionDigits }: CurrencyFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    ...(maximumFractionDigits === undefined ? {} : { maximumFractionDigits }),
  }).format(amountInCents / 100);
}

function getValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
