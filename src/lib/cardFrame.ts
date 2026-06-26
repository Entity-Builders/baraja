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
const _frameCache = new Map<string, string>();

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

/** Persist AI typography suggestion for use in CardCanvas across pages */
export function setFrameTypography(typography: Record<string, unknown> | null): void {
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
export function getFrameTypography(): Record<string, unknown> | null {
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
