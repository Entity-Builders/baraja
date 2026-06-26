/**
 * Shared pdfme configuration for Designer and Generator.
 * Fonts, plugins, and default templates live here.
 */
import type { Template, Font, Schema } from '@pdfme/common';
import { text, image, barcodes, rectangle, svg, line, ellipse } from '@pdfme/schemas';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { FONT_REGISTRY } from './fontRegistry';
import { getFrameTypography, getFrameTheme } from './cardFrame';
import {
  getCanonicalTemplateFieldName,
  normalizeTemplateFieldAliases,
} from './cardFieldPlacements';

// ── Typography hints from AI (mirrors CardCanvas interface) ───────────────────
export interface PdfTypographyZone {
  fontSize?: number;    // pt (pdfme units)
  fontFamily?: string;  // must match a registered font name
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;       // hex (#rrggbb)
  topPct?: number;      // % spacing from top
  heightPct?: number;   // % height bounds
  leftPct?: number;     // % spacing from left edge
  widthPct?: number;    // % bounding box width
  containerSvg?: string;
}

export interface PdfTypographyHints {
  brand?: { color?: string; fontFamily?: string };
  qrFgColor?: string;
  ttfUrls?: Record<string, string>;
  focalPoints?: unknown;
  when_to_use?: PdfTypographyZone;
  phrase?: PdfTypographyZone;
  instruction?: PdfTypographyZone;
  answer?: PdfTypographyZone;
  // Dynamic zones based on the deck's edition model (e.g., 'cita', 'prenda', 'whenToUse')
  [key: string]: PdfTypographyZone | Record<string, unknown> | string | undefined | unknown;
}

type SchemaWithFont = Schema & {
  fontFamily?: unknown;
  fontName?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPdfTypographyZone(value: unknown): value is PdfTypographyZone {
  return isRecord(value);
}

function getTypographyZone(
  typography: PdfTypographyHints,
  key: string,
): PdfTypographyZone | undefined {
  const value = typography[key];
  if (isPdfTypographyZone(value)) return value;

  if (key === 'when_to_use') {
    const legacyValue = typography.whenToUse;
    if (isPdfTypographyZone(legacyValue)) return legacyValue;
  }

  return undefined;
}

// ── Plugins available in Designer + Generator ────────

export const pdfmePlugins = {
  text,
  image,
  qrcode: barcodes.qrcode,
  rectangle,
  svg,
  line,
  ellipse,
};

// ── Fonts (pdfme expects URL strings or binary) ──────

// Convert ArrayBuffer to Base64 in browser
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Safely fetch and convert array buffer to Base64 for pdf-lib compatibility
async function fetchFontData(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  // Provide as standard Base64 string that pdfme expects for fonts natively without buffer issues
  return 'data:font/ttf;base64,' + arrayBufferToBase64(ab);
}

export async function buildPdfmeFonts(typographyOverride?: PdfTypographyHints | null, pdfmeTemplate?: Template | null): Promise<Font> {
  const typo: PdfTypographyHints = typographyOverride ?? (getFrameTypography() as PdfTypographyHints | null) ?? {};
  const fonts: Font = {};

  // Default fallback fonts safely registered locally
  const cormorant = FONT_REGISTRY['Cormorant Garamond'];
  if (cormorant?.[0]) {
    try {
      fonts['Cormorant Garamond'] = {
        data: await fetchFontData(cormorant[0].src),
        fallback: Object.keys(fonts).length === 0,
      };
    } catch { console.warn('Failed to load Cormorant'); }
  }

  const inter = FONT_REGISTRY['Inter'];
  if (inter?.[0]) {
    try {
      fonts['Inter'] = {
        data: await fetchFontData(inter[0].src),
      };
    } catch { console.warn('Failed to load Inter'); }
  }

  const outfit = FONT_REGISTRY['Outfit'];
  if (outfit?.[0]) {
    try {
      fonts['Outfit'] = {
        data: await fetchFontData(outfit[0].src),
      };
    } catch { console.warn('Failed to load Outfit'); }
  }

  // Inject AI suggested fonts dynamically
  if (typo?.ttfUrls) {
    await Promise.all(
      Object.entries(typo.ttfUrls).map(async ([family, url]) => {
        if (!fonts[family]) {
          try {
            fonts[family] = { 
              data: await fetchFontData(url), 
              fallback: Object.keys(fonts).length === 0 
            };
            console.log(`[buildPdfmeFonts] Hydrated dynamic font: ${family}`);
          } catch (e) {
            console.warn(`[buildPdfmeFonts] Failed to fetch dynamic font ${family} for PDF`, e);
          }
        }
      })
    );
  }

  // Bulletproof fallback: If the template uses fonts we couldn't resolve, alias them to Inter
  if (pdfmeTemplate?.schemas && fonts['Inter']) {
    pdfmeTemplate.schemas.forEach(page => {
      page.forEach(schema => {
        const fontSchema = schema as SchemaWithFont;
        const family = fontSchema.fontFamily || fontSchema.fontName;
        if (family && typeof family === 'string' && !fonts[family]) {
          console.warn(`[buildPdfmeFonts] Missing font "${family}" in template. Aliasing to Inter fallback to prevent crash.`);
          fonts[family] = { ...fonts['Inter'], fallback: false };
        }
      });
    });
  }

  return fonts;
}

// ── Default card template (back face) ────────────────

// Theme constants for default template
export const ACCENT_COLOR = '#d4af64';
export const BG_COLOR = '#1e1e1e';



/**
 * Creates a default pdfme Template for a card's back face.
 * Accepts optional AI typography hints to override font sizes, colors, families.
 * Units: mm for position/size, pt for fontSize.
 */
export function createDefaultCardTemplate(
  widthMm = 70,
  heightMm = 120,
  typographyOverride?: PdfTypographyHints | null,
): Template {
  // Merge AI hints from localStorage if no explicit override passed
  const typo: PdfTypographyHints = typographyOverride ?? (getFrameTypography() as PdfTypographyHints | null) ?? {};
  // ────────────────────────────────────────────────────────────────────────
  // FRONT FACE: Full-bleed art — illustration covers entire card
  // Number and title overlay on top with text-shadow for legibility.
  // ────────────────────────────────────────────────────────────────────────

  // Art covers the entire card (full bleed)
  const frontArt = {
    name: 'art', type: 'image',
    position: { x: 0, y: 0 },
    width: widthMm, height: heightMm, rotate: 0,
  };
  
  // Number overlays top-left corner
  const frontNumber = {
    name: 'number', type: 'text',
    position: { x: 4, y: 3 },
    width: 20, height: 8, rotate: 0,
    fontSize: 14, alignment: 'left', verticalAlignment: 'middle',
    fontName: 'Cormorant Garamond', fontColor: '#ffffff',
  };
  
  // Title overlays bottom, centered
  const frontTitle = {
    name: 'title', type: 'text',
    position: { x: 4, y: heightMm - 10 },
    width: widthMm - 8, height: 8, rotate: 0,
    fontSize: 11, alignment: 'center', verticalAlignment: 'middle',
    fontName: 'Cormorant Garamond', fontColor: '#ffffff', letterSpacing: 3,
  };

  // ────────────────────────────────────────────────────────────────────────
  // BACK FACE LAYOUT (high-res PNG frame — 300 DPI print-ready)
  // ────────────────────────────────────────────────────────────────────────
  
  // bg is IMAGE — content injected by PrintEngine with the frame data URI.
  // NOT readOnly — pdfme needs to read the value from input data.
  const backBg = {
    name: 'bg', type: 'image', position: { x: 0, y: 0 }, width: widthMm, height: heightMm, rotate: 0,
  };

  const backSafeMargin = 8;
  const backSafeArea = backSafeMargin;
  const backTextW = widthMm - (backSafeMargin * 2);

  const hintY = Math.round(heightMm * 0.095); // ~11mm (top 9.5%)
  const qrSize = 7.5; 
  // Anchor QR and Brand at fixed architectural coordinates that clear the bottom artwork gracefully
  const qrY = heightMm - 24; // strictly 97mm
  const brandY = heightMm - 14.5; // strictly 106.5mm
  const minGapAboveQr = 4; // mm of guaranteed breathing room between text and QR
  const textNoFlyZone = qrY - minGapAboveQr; // 93mm — text can NEVER bleed past this
  
  const whenToUseTypography = getTypographyZone(typo, 'when_to_use');
  const hintFont    = whenToUseTypography?.fontFamily   ?? 'Outfit';
  const phraseFont  = typo.phrase?.fontFamily      ?? 'Cormorant Garamond';
  const instrFont   = typo.instruction?.fontFamily ?? 'Cormorant Garamond';
  const answerFont  = typo.answer?.fontFamily      ?? 'Outfit';

  const hintColor   = whenToUseTypography?.color    ?? '#d6d6d6';
  const phraseColor = typo.phrase?.color       ?? '#ffffff';
  const instrColor  = typo.instruction?.color  ?? '#e0e0e0';
  const answerColor = typo.answer?.color       ?? '#aaaaaa';
  const brandColor  = typo.brand?.color        ?? '#444444';
  const qrX = (widthMm / 2) - (qrSize / 2);

  // Padding used to give some mathematical breathing room to AI border suggestions
  const pd = 4; // 4% horizontal padding to prevent kissing the borders

  // ────────────────────────────────────────────────────────────────────────
  // DYNAMIC TEXT ZONES
  // ────────────────────────────────────────────────────────────────────────
  
  // We extract all keys from the AI typography that look like text zones (they have topPct, widthPct, etc)
  const dynamicTextZones: Schema[] = [];
  
  const ignoreKeys = ['brand', 'qrFgColor', 'ttfUrls', 'focalPoints'];
  
  Object.keys(typo).forEach(key => {
    if (ignoreKeys.includes(key)) return;
    const canonicalKey = getCanonicalTemplateFieldName(key);
    if (canonicalKey !== key && typo[canonicalKey] !== undefined) return;

    const zoneInfo = typo[key];
    if (!isPdfTypographyZone(zoneInfo)) return;
    
    // If it lacks constraints, skip it
    if (
      typeof zoneInfo.leftPct !== 'number' ||
      typeof zoneInfo.topPct !== 'number' ||
      typeof zoneInfo.widthPct !== 'number' ||
      typeof zoneInfo.heightPct !== 'number'
    ) {
      return;
    }

    const zY = (zoneInfo.topPct / 100) * heightMm;
    let zHeight = (zoneInfo.heightPct / 100) * heightMm;
    
    // Collision detection with QR code area at bottom
    if (zY + zHeight > textNoFlyZone) {
      zHeight = Math.max(10, textNoFlyZone - zY);
    }

    // If the AI generated an SVG container for this text block, inject it directly behind the text!
    if (zoneInfo.containerSvg && typeof zoneInfo.containerSvg === 'string' && zoneInfo.containerSvg.trim().length > 0) {
      // The AI returns raw shapes (e.g. <rect ...> or <path ...>), so we wrap it mathematically
      const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">${zoneInfo.containerSvg.trim()}</svg>`;
      
      dynamicTextZones.push({
        name: `${canonicalKey}_container_bg`, // background element suffix
        type: 'svg',
        content: wrappedSvg,
        position: {
          x: ((zoneInfo.leftPct) / 100) * widthMm, 
          y: zY
        },
        width: ((zoneInfo.widthPct) / 100) * widthMm,
        height: zHeight,
        rotate: 0,
      });
    }

    dynamicTextZones.push({
      name: canonicalKey, // IMPORTANT: Maps directly to the deck schema key!
      type: 'text',
      position: { 
        x: ((zoneInfo.leftPct + pd) / 100) * widthMm, 
        y: zY 
      },
      width: ((zoneInfo.widthPct - (pd * 2)) / 100) * widthMm,
      height: zHeight,
      fontSize: zoneInfo.fontSize || 12,
      fontName: zoneInfo.fontFamily || 'Inter',
      fontColor: zoneInfo.color || '#ffffff',
      alignment: 'center',
      verticalAlignment: 'middle',
      rotate: 0,
      // Safe shrinking so text never spills out of its box
      dynamicFontSize: { min: (zoneInfo.fontSize || 12) * 0.4, max: zoneInfo.fontSize || 12, fit: 'vertical' },
    });
  });

  // If no dynamic zones were generated, we produce fallbacks 
  // (we keep the legacy hardcoded blocks if the typography object was completely empty, 
  // this ensures old decks don't break until regenerated)
  if (dynamicTextZones.length === 0) {
    const hintFontSize     = 4.5;
    const phraseFontSize   = 15;
    const instrFontSize    = 6.5;
    const answerFontSize   = 5.5;

    dynamicTextZones.push({
      name: 'when_to_use', type: 'text',
      position: { x: backSafeArea, y: hintY },
      width: backTextW, height: 8,
      fontSize: hintFontSize, alignment: 'center', verticalAlignment: 'middle',
      fontName: hintFont, fontColor: hintColor, letterSpacing: 2.0, rotate: 0,
      dynamicFontSize: { min: hintFontSize * 0.5, max: hintFontSize, fit: 'vertical' as const },
    });

    dynamicTextZones.push({
      name: 'phrase', type: 'text',
      position: { x: backSafeArea, y: 20 },
      width: backTextW, height: 42,
      fontSize: phraseFontSize, alignment: 'center', verticalAlignment: 'middle',
      fontName: phraseFont, fontColor: phraseColor, rotate: 0,
      dynamicFontSize: { min: phraseFontSize * 0.5, max: phraseFontSize, fit: 'vertical' as const },
    });

    dynamicTextZones.push({
      name: 'instruction', type: 'text',
      position: { x: backSafeArea, y: 65 },
      width: backTextW, height: 20,
      fontSize: instrFontSize, alignment: 'center', verticalAlignment: 'middle',
      fontName: instrFont, fontColor: instrColor, rotate: 0,
      dynamicFontSize: { min: instrFontSize * 0.5, max: instrFontSize, fit: 'vertical' as const },
    });
    
    dynamicTextZones.push({
      name: 'answer', type: 'text',
      position: { x: backSafeArea, y: 88 },
      width: backTextW, height: 4,
      fontSize: answerFontSize, alignment: 'center', verticalAlignment: 'middle',
      fontName: answerFont, fontColor: answerColor, rotate: 0,
      dynamicFontSize: { min: answerFontSize * 0.5, max: answerFontSize, fit: 'vertical' as const },
    });
  }

  const _frameTheme = getFrameTheme();
  const qrFgColor = typo?.qrFgColor ?? (_frameTheme === 'light' ? '#111111' : '#ffffff');

  const qr = {
    name: 'qr', type: 'qrcode',
    position: { x: qrX, y: qrY },
    width: qrSize, height: qrSize,
    barColor: qrFgColor, rotate: 0,
  };
  
  const brand = {
    name: 'brand', type: 'text',
    position: { x: backSafeArea, y: brandY },
    width: backTextW, height: 4,
    fontSize: 4, alignment: 'center', verticalAlignment: 'middle',
    fontName: 'Outfit', fontColor: brandColor, letterSpacing: 2, rotate: 0,
  };

  // Convert mm to mm for pdfme template format
  return {
    basePdf: { width: widthMm, height: heightMm, padding: [0, 0, 0, 0] },
    schemas: [
      // ── Page 0: FRONT FACE (full-bleed art, no frame) ──
      [frontArt, frontNumber, frontTitle] as Schema[],
      
      // ── Page 1: BACK FACE (ornate SVG frame) ──
      [backBg, ...dynamicTextZones, qr, brand] as Schema[],
    ],
    sampledata: [
      {
        // Front (Barómetro — Card #1: El Hielo)
        bg: '',  // Back face frame — hydrated by PrintEngine with PNG data URI
        art: 'https://images.unsplash.com/photo-1581022295087-35e593704911?q=80&w=600&auto=format&fit=crop',
        number: '01',
        title: 'EL HIELO',
        // Back (real Barómetro data)
        when_to_use: 'PARA CUANDO LA EMOCIÓN ES UN INCENDIO Y NO PODÉS PENSAR.',
        phrase: 'Tu sistema nervioso no discute con la temperatura.',
        instruction: 'Sostené un hielo en la mano hasta que sea muy intenso. O llená un bol con agua fría y hielo y sumergí la cara por 15 segundos. Sentí el cambio. Respirá.',
        answer: '',
        fun_fact: '',
        qr: 'https://baraja.cards/barometro',
        brand: 'BARÓMETRO · BARAJA',
      },
    ],
  };
}

export function getTemplateForDeck(deck: DeckSchema): Template {
  const config = deck.design?.layout_config;
  
  if (isRecord(config) && 'basePdf' in config && 'schemas' in config) {
    const template = normalizeTemplateFieldAliases(JSON.parse(JSON.stringify(config)) as Template);
    
    // Automatically upgrade legacy templates missing page 2
    if (template.schemas && template.schemas.length === 1) {
      const defaults = createDefaultCardTemplate(
        deck.print_specs?.dimensions?.width || 88,
        deck.print_specs?.dimensions?.height || 63
      );
      template.schemas = [defaults.schemas[0], template.schemas[0]];
    }

    // Hydrate all schemas with 'rotate: 0' if missing to enable rotation UI in pdfme
    if (template.schemas) {
      template.schemas.forEach(page => {
        page.forEach(schema => {
          if (schema.rotate === undefined) {
            schema.rotate = 0;
          }
        });
      });
    }

    return normalizeTemplateFieldAliases(template);
  }
  
  return createDefaultCardTemplate(70, 120);
}

// ── Flujo B: AI-generated full card back + QR overlay ────────────────────────
// Used when card.back.back_image_url is populated.
// Back page: full-bleed AI image + small real QR code overlaid at the bottom.
// Front page: unchanged (full-bleed art + number/title overlays).

export function createFlujoBTemplate(
  widthMm = 70,
  heightMm = 120,
): Template {
  // Front schemas (same as default)
  const frontArt = { name: 'art', type: 'image', position: { x: 0, y: 0 }, width: widthMm, height: heightMm, rotate: 0 };
  const frontNumber = {
    name: 'number', type: 'text', position: { x: 4, y: 3 }, width: 20, height: 8, rotate: 0,
    fontSize: 14, alignment: 'left' as const, verticalAlignment: 'middle' as const,
    fontName: 'Cormorant Garamond', fontColor: '#ffffff',
  };
  const frontTitle = {
    name: 'title', type: 'text', position: { x: 4, y: heightMm - 10 }, width: widthMm - 8, height: 8, rotate: 0,
    fontSize: 11, alignment: 'center' as const, verticalAlignment: 'middle' as const,
    fontName: 'Cormorant Garamond', fontColor: '#ffffff', letterSpacing: 3,
  };

  // Back: AI-generated image covers the whole card
  const backAiImage = {
    name: 'back_ai_image',
    type: 'image',
    position: { x: 0, y: 0 },
    width: widthMm,
    height: heightMm,
    rotate: 0,
  };

  // QR overlay: centered in bottom band — the AI prompt leaves a clean patch here
  const qrSize = 9; // sync with default template size
  const qrX = (widthMm / 2) - (qrSize / 2);
  const qrY = heightMm - Math.round(heightMm * 0.085) - qrSize; // sync with default template bottom 8.5%

  const qrOverlay = {
    name: 'qr_overlay',
    type: 'qrcode',
    position: { x: qrX, y: qrY },
    width: qrSize,
    height: qrSize,
    barColor: '#ffffff',
    rotate: 0,
  };

  return {
    basePdf: { width: widthMm, height: heightMm, padding: [0, 0, 0, 0] },
    schemas: [
      [frontArt, frontNumber, frontTitle] as Schema[],
      [backAiImage, qrOverlay] as Schema[],
    ],
    sampledata: [
      {
        art: 'https://images.unsplash.com/photo-1581022295087-35e593704911?q=80&w=600&auto=format&fit=crop',
        number: '01',
        title: 'EL HIELO',
        back_ai_image: '',  // hydrated by PrintEngine with card's back_image_url data URI
        qr_overlay: 'https://baraja.cards/barometro',
      },
    ],
  };
}

/** Returns true if a card has an AI-generated full back image (Flujo B). */
export function cardUsesFlujob(card: { back?: { back_image_url?: string } }): boolean {
  return !!card?.back?.back_image_url;
}
