/**
 * Shared pdfme configuration for Designer and Generator.
 * Fonts, plugins, and default templates live here.
 */
import type { Template, Font } from '@pdfme/common';
import { text, image, barcodes, rectangle } from '@pdfme/schemas';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { FONT_REGISTRY } from './fontRegistry';

// ── Plugins available in Designer + Generator ────────

export const pdfmePlugins = {
  text,
  image,
  qrcode: barcodes.qrcode,
  rectangle,
};

// ── Fonts (pdfme expects URL strings or binary) ──────

export function buildPdfmeFonts(): Font {
  // Build the font map from our existing FONT_REGISTRY
  const fonts: Font = {};

  // Cormorant Garamond as default/fallback
  const cormorant = FONT_REGISTRY['Cormorant Garamond'];
  if (cormorant?.[0]) {
    fonts['Cormorant Garamond'] = {
      data: cormorant[0].src,
      fallback: true,
    };
  }

  const inter = FONT_REGISTRY['Inter'];
  if (inter?.[0]) {
    fonts['Inter'] = {
      data: inter[0].src,
    };
  }

  return fonts;
}

// ── Default card template (back face) ────────────────

// Theme constants for default template
const ACCENT_COLOR = '#d4af64';
const TEXT_COLOR = '#f0ebe0';
const BG_COLOR = '#0c0b09';

/**
 * Creates a default pdfme Template for a card's back face.
 * Units are mm. basePdf defines the card dimensions.
 * Includes a full-bleed background, border frame, and all text elements
 * pre-configured with dark-premium theme colors.
 */
export function createDefaultCardTemplate(
  widthMm = 88,
  heightMm = 63,
): Template {
  const isHorizontal = widthMm > heightMm;
  
  // Padding & frame
  const padding = isHorizontal ? 6 : 8; // mm
  const inset = isHorizontal ? 3 : 4;  // mm
  
  // Adjusted text box start and widths
  const textX = padding;
  const textW = widthMm - (padding * 2);

  return {
    basePdf: {
      width: widthMm,
      height: heightMm,
      padding: [0, 0, 0, 0],
    },
    schemas: [
      // ── Page 0: FRONT FACE ──
      [
        {
          name: 'bg',
          type: 'rectangle',
          position: { x: 0, y: 0 },
          width: widthMm,
          height: heightMm,
          color: BG_COLOR,
          borderWidth: 0,
          borderColor: '',
          readOnly: true,
        },
        {
          name: 'art',
          type: 'image',
          position: { x: 0, y: 0 },
          width: widthMm,
          height: heightMm,
        },
        {
          name: 'number',
          type: 'text',
          position: { x: 4, y: heightMm - 10 },
          width: 12,
          height: 6,
          fontSize: 8,
          alignment: 'center',
          verticalAlignment: 'middle',
          fontName: 'Inter',
          fontColor: '#ffffff',
          backgroundColor: ACCENT_COLOR,
        },
        {
          name: 'title',
          type: 'text',
          position: { x: widthMm - 50, y: heightMm - 10 },
          width: 46,
          height: 6,
          fontSize: 8,
          alignment: 'right',
          verticalAlignment: 'middle',
          fontName: 'Cormorant Garamond',
          fontColor: TEXT_COLOR,
          lineHeight: 1,
        },
      ],
      // ── Page 1: BACK FACE ──
      [
        {
          name: 'bg',
          type: 'rectangle',
          position: { x: 0, y: 0 },
          width: widthMm,
          height: heightMm,
          color: BG_COLOR,
          borderWidth: 0,
          borderColor: '',
          readOnly: true,
        },
        {
          name: 'border',
          type: 'rectangle',
          position: { x: inset, y: inset },
          width: widthMm - inset * 2,
          height: heightMm - inset * 2,
          color: '',
          borderColor: ACCENT_COLOR,
          borderWidth: 0.3,
          readOnly: true,
        },
        {
          name: 'when_to_use',
          type: 'text',
          position: { x: textX, y: padding },
          width: textW,
          height: 6,
          fontSize: 8,
          alignment: 'center',
          fontName: 'Cormorant Garamond',
          fontColor: ACCENT_COLOR,
          lineHeight: 1.2,
          characterSpacing: 2,
        },
        {
          name: 'phrase',
          type: 'text',
          position: { x: textX, y: (heightMm / 2) - 10 },
          width: textW,
          height: 20,
          fontSize: 14,
          alignment: 'center',
          verticalAlignment: 'middle',
          fontName: 'Cormorant Garamond',
          fontColor: TEXT_COLOR,
          lineHeight: 1.3,
        },
        {
          name: 'instruction',
          type: 'text',
          position: { x: textX, y: (heightMm / 2) + 10 },
          width: textW,
          height: 8,
          fontSize: 8,
          alignment: 'center',
          fontName: 'Inter',
          fontColor: TEXT_COLOR,
          lineHeight: 1.4,
        },
        {
          name: 'answer',
          type: 'text',
          position: { x: textX, y: (heightMm / 2) + 18 },
          width: textW,
          height: 6,
          fontSize: 8,
          alignment: 'center',
          fontName: 'Inter',
          fontColor: ACCENT_COLOR,
          lineHeight: 1.2,
          rotate: 180,
        },
        {
          name: 'fun_fact',
          type: 'text',
          position: { x: textX, y: heightMm - padding - 16 },
          width: textW,
          height: 6,
          fontSize: 7,
          alignment: 'center',
          fontName: 'Inter',
          fontColor: TEXT_COLOR,
          lineHeight: 1.2,
        },
        {
          name: 'qr',
          type: 'qrcode',
          position: { x: (widthMm / 2) - 3.5, y: heightMm - padding - 8 },
          width: 7,
          height: 7,
        },
        {
          name: 'brand',
          type: 'text',
          position: { x: textX, y: heightMm - padding + 1 }, // just below QR
          width: textW,
          height: 4,
          fontSize: 5.5,
          alignment: 'center',
          fontName: 'Cormorant Garamond',
          fontColor: TEXT_COLOR,
          lineHeight: 1,
          characterSpacing: 1.5,
        },
      ],
    ],
    sampledata: [
      {
        // Front default data
        bg: '',
        art: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=600&auto=format&fit=crop',
        number: '#07',
        title: 'La Vuelta',
        // Back default data
        border: '',
        when_to_use: 'CUANDO SENTÍS QUE ESTÁS DANDO VUELTAS',
        phrase: '"A veces volver al punto de partida es la forma más honesta de avanzar."',
        instruction: 'Cerrá los ojos. Pensá en algo que dejaste a medias. ¿Lo dejaste o te dejó?',
        answer: 'Rta: Dar vueltas no es perder el tiempo, es ganar perspectiva.',
        fun_fact: '💡 El 80% de los proyectos abandonados tenían una solución a menos de 3 pasos.',
        qr: 'https://baraja.cards',
        brand: 'Baraja · Cable a Tierra',
      },
    ],
  };
}

export function getTemplateForDeck(deck: DeckSchema): Template {
  const config = deck.design_template_overrides?.layout_config;
  
  if (config && 'basePdf' in config && 'schemas' in config) {
    const template = JSON.parse(JSON.stringify(config)) as Template;
    
    // Automatically upgrade legacy templates missing page 2
    if (template.schemas && template.schemas.length === 1) {
      const defaults = createDefaultCardTemplate(
        deck.print_specs?.dimensions?.width || 88,
        deck.print_specs?.dimensions?.height || 63
      );
      template.schemas = [defaults.schemas[0], template.schemas[0]];
    }
    return template;
  }
  
  return createDefaultCardTemplate(
    deck.print_specs?.dimensions?.width || 88,
    deck.print_specs?.dimensions?.height || 63
  );
}
