/**
 * Card Frame Asset Loader
 *
 * The back-face frame is a 300 DPI PNG image at /public/frames/back-frame.png
 * (827 × 1417 px for 70 × 120 mm).
 *
 * For the PDF pipeline, we convert it to JPEG via canvas to satisfy pdfme's
 * image plugin (which expects JPEG). For HTML preview, we use the raw PNG URL.
 *
 * ⚠️  The canvas conversion produces a proper JPEG with SOI marker, unlike
 *     the old approach that tried to convert arbitrary URLs inline.
 */

/** Default path (no deck selected) — usable directly in HTML <img> or CSS */
export const FRAME_URL = '/frames/back-frame.png';

/** Cache per-deck so switching doesn't cause re-fetches */
let _frameCache = new Map<string, string>();

/**
 * Build a frame URL for a specific deck + face.
 * Falls back to the global frame if no deckId is given.
 */
export function getFrameUrl(deckId?: string | null, face: 'front' | 'back' = 'back'): string {
  if (deckId) {
    return `/frames/${deckId}/${face}-frame.png`;
  }
  return `/frames/${face}-frame.png`;
}

/** Persist which deck is currently active for frame resolution */
export function setActiveDeckId(deckId: string | null): void {
  try {
    if (deckId) {
      localStorage.setItem('baraja_active_deck_id', deckId);
    } else {
      localStorage.removeItem('baraja_active_deck_id');
    }
    // Invalidate cached data URIs so next fetch picks up the new frame
    _frameCache.clear();
  } catch { /* ignore */ }
}

/** Read persisted active deck ID */
export function getActiveDeckId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('baraja_active_deck_id');
  } catch {
    return null;
  }
}

/**
 * The visual theme of the active frame — controls text colors in CardCanvas.
 * Set via localStorage when the user selects 'Set as Active Frame' in the admin.
 * 'dark' = light text on dark background (default)
 * 'light' = dark text on light/warm background
 */
export function getFrameTheme(): 'light' | 'dark' {
  try {
    if (typeof localStorage === 'undefined') return 'dark';
    return (localStorage.getItem('baraja_frame_theme') as 'light' | 'dark') ?? 'dark';
  } catch {
    return 'dark';
  }
}

export function setFrameTheme(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem('baraja_frame_theme', theme);
  } catch { /* ignore */ }
}

// ── Color contrast sanitizer ─────────────────────────────────────────────────

/** Perceived luminance (0=black, 1=white) from a hex color like '#1a0d02' */
function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0.5; // unknown → neutral
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Ensures all text colors in a typography suggestion have sufficient contrast
 * against the frame background. Overrides any AI hallucinations.
 *
 * Light frame  → text must be dark  (luminance < 0.45)
 * Dark frame   → text must be light (luminance > 0.55)
 */
function sanitizeTypographyColors(
  typo: Record<string, any>,
  theme: 'light' | 'dark',
): Record<string, any> {
  const isLight = theme === 'light';

  // Fallback palettes when AI suggests wrong contrast
  const DARK_TEXT  = { when: '#2a1608', phrase: '#1a0d02', instruction: '#2d1c08', answer: '#4a2e08', brand: '#6a4820', qrFg: '#4a2e08' };
  const LIGHT_TEXT = { when: '#d6c8a8', phrase: '#ffffff',  instruction: '#e8dcc0', answer: '#c0b090', brand: '#a09070', qrFg: '#d4af64' };
  const fallbacks = isLight ? DARK_TEXT : LIGHT_TEXT;

  const fix = (color: string | undefined, fallback: string): string => {
    if (!color || !color.startsWith('#')) return fallback;
    const lum = hexLuminance(color);
    if (isLight && lum > 0.45) {
      console.warn(`[baraja] santized color ${color} → ${fallback} (too light for light frame)`);
      return fallback;
    }
    if (!isLight && lum < 0.55) {
      console.warn(`[baraja] sanitized color ${color} → ${fallback} (too dark for dark frame)`);
      return fallback;
    }
    return color;
  };

  const result = { ...typo };
  if (result.whenToUse)   result.whenToUse   = { ...result.whenToUse,   color: fix(result.whenToUse.color, fallbacks.when) };
  if (result.phrase)      result.phrase      = { ...result.phrase,      color: fix(result.phrase.color, fallbacks.phrase) };
  if (result.instruction) result.instruction = { ...result.instruction, color: fix(result.instruction.color, fallbacks.instruction) };
  if (result.answer)      result.answer      = { ...result.answer,      color: fix(result.answer.color, fallbacks.answer) };
  if (result.brand)       result.brand       = { ...result.brand,       color: fix(result.brand?.color, fallbacks.brand) };
  if (result.qrFgColor)   result.qrFgColor   = fix(result.qrFgColor, fallbacks.qrFg);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Persist AI typography suggestion for use in CardCanvas across pages */
export function setFrameTypography(typography: Record<string, any> | null): void {
  try {
    if (typography) {
      // We no longer sanitize colors because the Gemini Flash Vision model
      // actually looks at the frame and picks the best high-contrast color inherently.
      localStorage.setItem('baraja_frame_typography', JSON.stringify(typography));
    } else {
      localStorage.removeItem('baraja_frame_typography');
    }
  } catch { /* ignore */ }
}


/** Read persisted typography suggestion */
export function getFrameTypography(): Record<string, any> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('baraja_frame_typography');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}



/**
 * Returns the back-frame as a `data:image/jpeg;base64,...` data URI.
 * Loads the PNG, paints it on canvas with a dark background, and
 * exports as high-quality JPEG for pdfme compatibility.
 */
export async function getFrameDataUri(deckSlug?: string | null): Promise<string> {
  const resolvedDeck = deckSlug ?? getActiveDeckId() ?? '__global__';
  const cached = _frameCache.get(resolvedDeck);
  if (cached) return cached;

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill dark bg first (in case of any transparency)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUri = canvas.toDataURL('image/jpeg', 0.95);
        _frameCache.set(resolvedDeck, dataUri);
        console.log(`[CardFrame] Converted to JPEG data URI (${resolvedDeck}): ${dataUri.length} chars`);
        resolve(dataUri);
      } else {
        reject(new Error('Canvas 2D context unavailable'));
      }
    };
    img.onerror = (err) => {
      console.error('[CardFrame] Failed to load frame image:', err);
      // Fallback to global frame
      if (resolvedDeck !== '__global__') {
        console.warn(`[CardFrame] Falling back to global frame for deck: ${resolvedDeck}`);
        img.src = getFrameUrl(null);
      } else {
        reject(new Error('Failed to load frame image'));
      }
    };
    img.src = getFrameUrl(resolvedDeck === '__global__' ? null : resolvedDeck);
  });
}

// ── Google Fonts dynamic loader ─────────────────────────────────────────────

const _loadedFonts = new Set<string>();

/**
 * Dynamically injects a Google Fonts <link> for the requested families.
 * Idempotent — calling it multiple times with the same family is a noop.
 * Supports any Google Fonts family name (eg. "Playfair Display", "Lora", "DM Serif Display").
 */
export function loadGoogleFonts(families: string[]): void {
  if (typeof document === 'undefined') return;
  const toLoad = families.filter(f => f && !_loadedFonts.has(f));
  if (!toLoad.length) return;

  const familyParams = toLoad
    .map(f => `family=${encodeURIComponent(f)}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600`)
    .join('&');

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
  document.head.appendChild(link);

  toLoad.forEach(f => _loadedFonts.add(f));
}
