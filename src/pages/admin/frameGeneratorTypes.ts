export interface TypoZone {
  fontSize: number;
  fontFamily: string;
  fontWeight?: 'thin' | '300' | 'regular' | 'bold' | '700' | '900';
  lineHeight?: number;
  letterSpacing?: number;
  notes?: string;
  color?: string;
  topPct?: number;
  heightPct?: number;
  leftPct?: number;
  widthPct?: number;
  containerSvg?: string;
}

export type MaybePromise = void | Promise<void>;

export interface FocalPoint {
  description: string;
  xPct: number;
  yPct: number;
  sizePct: number;
}

export interface TypographySuggestion {
  brand?: { color?: string; fontFamily?: string };
  qrFgColor?: string;
  qrSizeMm?: number;
  overallNotes?: string;
  focalPoints?: FocalPoint[];
  ttfUrls?: Record<string, string>;
  [key: string]: TypoZone | FocalPoint[] | Record<string, string> | Record<string, unknown> | string | number | undefined;
}

export interface GeneratedFrame {
  dataUrl: string;
  presetId: string;
  prompt: string;
  face: 'front' | 'back';
  widthMm: number;
  heightMm: number;
  timestamp: number;
  typography?: TypographySuggestion | null;
}

export interface GenerateResponse {
  success: boolean;
  dataUrl?: string;
  typography?: TypographySuggestion | null;
  error?: string;
}

export interface FramesLibraryResponse {
  success: boolean;
  frames?: LibraryFrame[];
  error?: string;
}

export interface LibraryFrame {
  id?: string;
  url: string;
  presetId: string;
  prompt: string;
  face: 'front' | 'back';
  widthMm: number;
  heightMm: number;
  timestamp: number;
  typography?: TypographySuggestion | null;
}

export function isTypoZone(value: unknown): value is TypoZone {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getAdaptiveFontSizePx(
  text: string | undefined | null,
  pt: number,
  maxPt: number,
  heightMm: number,
  previewHeight: number,
): number {
  const safeText = text || '';
  const len = safeText.length;
  const safePt = Math.min(pt, maxPt);

  let scale = 1;
  if (maxPt <= 10) {
    if (len <= 60) scale = 1;
    else if (len <= 100) scale = 0.85;
    else if (len <= 150) scale = 0.75;
    else if (len <= 200) scale = 0.65;
    else scale = 0.55;
  } else {
    if (len <= 40) scale = 1;
    else if (len <= 60) scale = 0.88;
    else if (len <= 80) scale = 0.76;
    else if (len <= 100) scale = 0.65;
    else if (len <= 130) scale = 0.56;
    else scale = 0.48;
  }

  return (safePt * scale * 0.3527 / heightMm) * previewHeight;
}
