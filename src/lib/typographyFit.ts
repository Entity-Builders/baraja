const PT_TO_MM = 0.352777778;

const IGNORED_HINT_KEYS = new Set(['brand', 'qrFgColor', 'qrSizeMm', 'ttfUrls', 'focalPoints', 'overallNotes']);
const STACKED_BACK_FIELD_ORDER = ['when_to_use', 'phrase', 'instruction', 'answer', 'fun_fact'];
const IGNORED_CONTENT_KEYS = new Set([
  'art',
  'art_url',
  'art_versions',
  'back_image_url',
  'back_image_versions',
  'bg',
  'brand',
  'number',
  'player_count',
  'qr',
  'qr_url',
  'title',
]);

export interface TypographyFitZone {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  topPct?: number;
  heightPct?: number;
  leftPct?: number;
  widthPct?: number;
  containerSvg?: string;
  [key: string]: unknown;
}

export type TypographyFitHints = Record<string, unknown>;

export interface FitTypographyHintsOptions {
  cardHeightMm: number;
  cardWidthMm: number;
  content: Record<string, unknown>;
  primaryFieldKey?: string;
}

export function fitTypographyHintsToContent<T extends TypographyFitHints>(
  typography: T | null | undefined,
  options: FitTypographyHintsOptions,
): T | null | undefined {
  if (!typography || typeof typography !== 'object') return typography;

  const fitted = fitAllTypographyZones(typography, options);
  const stacked = normalizeKnownBackStack(fitted, options);
  if (!stacked.changed) return fitted as T;

  return fitAllTypographyZones(stacked.hints, options) as T;
}

export function mergeLongestTextByField(
  samples: Array<Record<string, unknown> | null | undefined>,
  preferredKeys: string[] = [],
): Record<string, string> {
  const keys = new Set(preferredKeys);
  for (const sample of samples) {
    if (!sample || typeof sample !== 'object') continue;
    for (const [key, value] of Object.entries(sample)) {
      if (IGNORED_CONTENT_KEYS.has(key)) continue;
      if (typeof value === 'string' && value.trim().length > 0) keys.add(key);
    }
  }

  const longestByKey: Record<string, string> = {};
  for (const key of keys) {
    for (const sample of samples) {
      const value = sample?.[key];
      if (typeof value !== 'string') continue;

      const text = value.trim();
      if (!text) continue;
      if (!longestByKey[key] || text.length > longestByKey[key].length) {
        longestByKey[key] = text;
      }
    }
  }

  return longestByKey;
}

function fitAllTypographyZones<T extends TypographyFitHints>(
  typography: T,
  options: FitTypographyHintsOptions,
): TypographyFitHints {
  const fitted: TypographyFitHints = { ...typography };
  for (const key of Object.keys(typography)) {
    if (IGNORED_HINT_KEYS.has(key)) continue;

    const zone = typography[key];
    const text = String(options.content[key] ?? '').trim();
    if (!text || !isFitZone(zone)) continue;

    fitted[key] = fitTypographyZoneToText(key, zone, text, options);
  }

  return fitted;
}

export function fitTypographyZoneToText(
  fieldKey: string,
  zone: TypographyFitZone,
  text: string,
  options: FitTypographyHintsOptions,
): TypographyFitZone {
  const requestedFontSize = clamp(
    toFiniteNumber(zone.fontSize, getDefaultFontSize(fieldKey, text.length, options.primaryFieldKey)),
    3.5,
    32,
  );
  const lineHeight = clamp(toFiniteNumber(zone.lineHeight, getDefaultLineHeight(fieldKey, text.length)), 1.02, 1.45);
  const roleCap = getRoleFontSizeCap(fieldKey, text.length, options.primaryFieldKey);
  const maxFontSize = Math.min(requestedFontSize, roleCap);
  const minFontSize = getMinimumFontSize(fieldKey, options.primaryFieldKey);
  const boxWidthMm = getTextBoxWidthMm(zone, options.cardWidthMm);
  const boxHeightMm = getTextBoxHeightMm(zone, options.cardHeightMm);
  const fittedFontSize = estimateFittedFontSize({
    boxHeightMm,
    boxWidthMm,
    fontWeight: zone.fontWeight,
    lineHeight,
    maxFontSize,
    minFontSize,
    text,
  });

  return {
    ...zone,
    fontSize: roundToTenth(fittedFontSize),
    lineHeight: roundToHundredth(lineHeight),
    letterSpacing: text.length > 90 ? 0 : zone.letterSpacing,
  };
}

export function estimateFittedFontSize(input: {
  boxHeightMm: number;
  boxWidthMm: number;
  fontWeight?: string;
  lineHeight: number;
  maxFontSize: number;
  minFontSize: number;
  text: string;
}): number {
  const minFontSize = Math.min(input.minFontSize, input.maxFontSize);
  let low = minFontSize;
  let high = input.maxFontSize;

  for (let i = 0; i < 14; i += 1) {
    const mid = (low + high) / 2;
    if (doesTextFit({
      boxHeightMm: input.boxHeightMm,
      boxWidthMm: input.boxWidthMm,
      fontSize: mid,
      fontWeight: input.fontWeight,
      lineHeight: input.lineHeight,
      text: input.text,
    })) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

function doesTextFit(input: {
  boxHeightMm: number;
  boxWidthMm: number;
  fontSize: number;
  fontWeight?: string;
  lineHeight: number;
  text: string;
}): boolean {
  const lines = estimateWrappedLineCount(input.text, input.fontSize, input.boxWidthMm, input.fontWeight);
  const estimatedHeightMm = lines * input.fontSize * PT_TO_MM * input.lineHeight;
  return estimatedHeightMm <= input.boxHeightMm * 0.92;
}

function normalizeKnownBackStack(
  hints: TypographyFitHints,
  options: FitTypographyHintsOptions,
): { hints: TypographyFitHints; changed: boolean } {
  const fields = STACKED_BACK_FIELD_ORDER
    .map((key) => {
      const zone = hints[key];
      const text = String(options.content[key] ?? '').trim();
      if (!text || !isFitZone(zone)) return null;

      const topPct = clamp(toFiniteNumber(zone.topPct, 0), 0, 100);
      const heightPct = clamp(toFiniteNumber(zone.heightPct, 0), 0, 100);
      const requiredHeightPct = estimateRequiredHeightPct(zone, text, options);
      return {
        key,
        zone,
        text,
        topPct,
        heightPct,
        requiredHeightPct,
        desiredHeightPct: getStackDesiredHeightPct(key, text.length, options.primaryFieldKey, requiredHeightPct),
        minHeightPct: getStackMinHeightPct(key, options.primaryFieldKey),
        maxHeightPct: getStackMaxHeightPct(key, options.primaryFieldKey),
      };
    })
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  if (fields.length < 2) return { hints, changed: false };

  const safeTopPct = 12.5;
  const safeBottomPct = fields.some(field => field.key === 'fun_fact') ? 88.5 : 90.5;
  const gapPct = fields.length >= 5 ? 2.4 : 3;

  let previousBottom = safeTopPct;
  const hasLayoutProblem = fields.some((field, index) => {
    const overlapsPrevious = index > 0 && field.topPct < previousBottom + gapPct;
    const clipsBottom = field.topPct + field.heightPct > safeBottomPct;
    const tooShort = field.heightPct + 0.6 < field.requiredHeightPct;
    const tooHigh = field.topPct < safeTopPct - 1;
    previousBottom = Math.max(previousBottom, field.topPct + field.heightPct);
    return overlapsPrevious || clipsBottom || tooShort || tooHigh;
  });

  if (!hasLayoutProblem) return { hints, changed: false };

  const availableHeightPct = Math.max(30, safeBottomPct - safeTopPct - gapPct * (fields.length - 1));
  const heights = fields.map(field => clamp(field.desiredHeightPct, field.minHeightPct, field.maxHeightPct));
  shrinkHeightsToFit(heights, fields, availableHeightPct);
  growPrimaryHeightIfRoom(heights, fields, availableHeightPct);

  const totalHeightPct = heights.reduce((sum, height) => sum + height, 0);
  const sparePct = Math.max(0, availableHeightPct - totalHeightPct);
  let cursor = safeTopPct + sparePct * 0.18;
  const nextHints: TypographyFitHints = { ...hints };

  fields.forEach((field, index) => {
    const widthPct = getStackWidthPct(field.key, field.zone);
    nextHints[field.key] = {
      ...field.zone,
      topPct: roundToTenth(cursor),
      heightPct: roundToTenth(heights[index]),
      leftPct: roundToTenth((100 - widthPct) / 2),
      widthPct: roundToTenth(widthPct),
    };
    cursor += heights[index] + gapPct;
  });

  return { hints: nextHints, changed: true };
}

function estimateRequiredHeightPct(
  zone: TypographyFitZone,
  text: string,
  options: FitTypographyHintsOptions,
): number {
  const fontSize = clamp(toFiniteNumber(zone.fontSize, 10), 3.5, 32);
  const lineHeight = clamp(toFiniteNumber(zone.lineHeight, getDefaultLineHeight('', text.length)), 1.02, 1.45);
  const boxWidthMm = getTextBoxWidthMm(zone, options.cardWidthMm);
  const lines = estimateWrappedLineCount(text, fontSize, boxWidthMm, zone.fontWeight);
  const heightMm = lines * fontSize * PT_TO_MM * lineHeight;
  return clamp((heightMm / options.cardHeightMm) * 100 + 1.8, 4, 60);
}

function getStackDesiredHeightPct(
  fieldKey: string,
  textLength: number,
  primaryFieldKey: string | undefined,
  requiredHeightPct: number,
): number {
  let roleHeightPct = 10;
  if (fieldKey === 'when_to_use') roleHeightPct = 6.8 + textLength / 42;
  else if (fieldKey === 'phrase') roleHeightPct = fieldKey === primaryFieldKey ? 15 + textLength / 20 : 8.5 + textLength / 34;
  else if (fieldKey === 'instruction') roleHeightPct = fieldKey === primaryFieldKey ? 24 + textLength / 12 : 16 + textLength / 16;
  else if (fieldKey === 'answer') roleHeightPct = 6.2 + textLength / 45;
  else if (fieldKey === 'fun_fact') roleHeightPct = 5.8 + textLength / 36;

  return Math.max(roleHeightPct, requiredHeightPct);
}

function getStackMinHeightPct(fieldKey: string, primaryFieldKey?: string): number {
  if (fieldKey === 'when_to_use') return 6;
  if (fieldKey === 'phrase') return fieldKey === primaryFieldKey ? 12 : 8;
  if (fieldKey === 'instruction') return fieldKey === primaryFieldKey ? 22 : 14;
  if (fieldKey === 'answer') return 5.8;
  if (fieldKey === 'fun_fact') return 5.6;
  return 6;
}

function getStackMaxHeightPct(fieldKey: string, primaryFieldKey?: string): number {
  if (fieldKey === 'when_to_use') return 10;
  if (fieldKey === 'phrase') return fieldKey === primaryFieldKey ? 24 : 14;
  if (fieldKey === 'instruction') return fieldKey === primaryFieldKey ? 45 : 32;
  if (fieldKey === 'answer') return 10;
  if (fieldKey === 'fun_fact') return 11;
  return 14;
}

function shrinkHeightsToFit(
  heights: number[],
  fields: Array<{ key: string; minHeightPct: number }>,
  availableHeightPct: number,
) {
  let totalHeightPct = heights.reduce((sum, height) => sum + height, 0);
  if (totalHeightPct <= availableHeightPct) return;

  const shrinkOrder = fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => {
      const aPriority = a.field.key === 'instruction' || a.field.key === 'phrase' ? 1 : 0;
      const bPriority = b.field.key === 'instruction' || b.field.key === 'phrase' ? 1 : 0;
      return aPriority - bPriority;
    });

  for (const { field, index } of shrinkOrder) {
    const overBy = totalHeightPct - availableHeightPct;
    if (overBy <= 0) break;

    const shrinkable = Math.max(0, heights[index] - field.minHeightPct);
    const shrinkBy = Math.min(shrinkable, overBy);
    heights[index] -= shrinkBy;
    totalHeightPct -= shrinkBy;
  }
}

function growPrimaryHeightIfRoom(
  heights: number[],
  fields: Array<{ key: string; maxHeightPct: number }>,
  availableHeightPct: number,
) {
  const primaryIndex = fields.findIndex(field => field.key === 'instruction');
  if (primaryIndex < 0) return;

  const totalHeightPct = heights.reduce((sum, height) => sum + height, 0);
  const sparePct = availableHeightPct - totalHeightPct;
  if (sparePct <= 2) return;

  heights[primaryIndex] += Math.min(sparePct * 0.65, fields[primaryIndex].maxHeightPct - heights[primaryIndex]);
}

function getStackWidthPct(fieldKey: string, zone: TypographyFitZone): number {
  const currentWidthPct = toFiniteNumber(zone.widthPct, 76);
  const minWidthPct = fieldKey === 'fun_fact' || fieldKey === 'answer' ? 68 : 74;
  return clamp(Math.max(currentWidthPct, minWidthPct), minWidthPct, 84);
}

function estimateWrappedLineCount(
  text: string,
  fontSize: number,
  boxWidthMm: number,
  fontWeight?: string,
): number {
  const charWidthMm = Math.max(0.9, fontSize * PT_TO_MM * getAverageCharWidthFactor(fontWeight));
  const charsPerLine = Math.max(4, Math.floor(boxWidthMm / charWidthMm));
  const paragraphs = text.replace(/\s+/g, ' ').trim().split(/\n+/);

  return paragraphs.reduce((total, paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return total + 1;

    let lines = 1;
    let currentLineLength = 0;

    for (const word of words) {
      const wordLength = word.length;
      if (wordLength > charsPerLine) {
        if (currentLineLength > 0) lines += 1;
        lines += Math.max(1, Math.ceil(wordLength / charsPerLine)) - 1;
        currentLineLength = wordLength % charsPerLine;
        continue;
      }

      const nextLength = currentLineLength === 0 ? wordLength : currentLineLength + 1 + wordLength;
      if (nextLength <= charsPerLine) {
        currentLineLength = nextLength;
      } else {
        lines += 1;
        currentLineLength = wordLength;
      }
    }

    return total + lines;
  }, 0);
}

function getTextBoxWidthMm(zone: TypographyFitZone, cardWidthMm: number): number {
  const widthPct = clamp(toFiniteNumber(zone.widthPct, 70), 5, 100);
  // createDefaultCardTemplate subtracts 4% padding on both sides for dynamic zones.
  const paddedWidthPct = Math.max(5, widthPct - 8);
  return Math.max(4, (paddedWidthPct / 100) * cardWidthMm);
}

function getTextBoxHeightMm(zone: TypographyFitZone, cardHeightMm: number): number {
  const heightPct = clamp(toFiniteNumber(zone.heightPct, 12), 3, 100);
  return Math.max(3, (heightPct / 100) * cardHeightMm - 1);
}

function getAverageCharWidthFactor(fontWeight?: string): number {
  if (fontWeight === 'bold' || fontWeight === '700' || fontWeight === '900') return 0.54;
  if (fontWeight === 'thin' || fontWeight === '300') return 0.48;
  return 0.51;
}

function getDefaultFontSize(fieldKey: string, textLength: number, primaryFieldKey?: string): number {
  if (fieldKey === 'when_to_use') return 7;
  if (fieldKey === 'answer') return 8;
  if (fieldKey === 'fun_fact') return 5.2;
  if (fieldKey === primaryFieldKey) return textLength > 150 ? 10 : 14;
  return textLength > 120 ? 8.5 : 11;
}

function getDefaultLineHeight(fieldKey: string, textLength: number): number {
  if (fieldKey === 'when_to_use' || fieldKey === 'fun_fact') return 1.22;
  return textLength > 140 ? 1.18 : 1.15;
}

function getRoleFontSizeCap(fieldKey: string, textLength: number, primaryFieldKey?: string): number {
  if (fieldKey === 'when_to_use') return 8.5;
  if (fieldKey === 'answer') return 9;
  if (fieldKey === 'fun_fact') return 7;
  if (fieldKey === primaryFieldKey) {
    if (textLength > 220) return 10.5;
    if (textLength > 170) return 11;
    if (textLength > 120) return 12.2;
    if (textLength > 80) return 13.5;
    return 17;
  }
  if (fieldKey === 'phrase') return textLength > 100 ? 10.5 : 15;
  return textLength > 140 ? 8.8 : 12;
}

function getMinimumFontSize(fieldKey: string, primaryFieldKey?: string): number {
  if (fieldKey === 'fun_fact') return 5.8;
  if (fieldKey === 'when_to_use') return 6.2;
  if (fieldKey === 'answer') return 6.4;
  if (fieldKey === primaryFieldKey) return 8.8;
  if (fieldKey === 'phrase') return 8;
  return 6.4;
}

function isFitZone(value: unknown): value is TypographyFitZone {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
