/**
 * Shared pdfme configuration for Designer and Generator.
 * Fonts, plugins, and default templates live here.
 */
import type { Template, Font, Schema } from '@pdfme/common';
import { text, image, barcodes, rectangle, svg, line, ellipse } from '@pdfme/schemas';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { FONT_REGISTRY } from './fontRegistry';

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
const BG_COLOR = '#111213';

/**
 * Creates a default pdfme Template for a card's back face.
 * Units are mm. basePdf defines the card dimensions.
 * Includes a full-bleed background, border frame, and all text elements
 * pre-configured with dark-premium theme colors matching the mockup.
 */
export function createDefaultCardTemplate(
  widthMm = 88,
  heightMm = 63,
): Template {
  const isHorizontal = widthMm > heightMm;
  
  // Padding & frame
  const inset = isHorizontal ? 3 : 4;  // mm
  const safeArea = inset + 2; 
  
  // Adjusted text box base widths
  const textW = widthMm - (safeArea * 2);

  // SVG Frame for the QR Code (Curved text around it)
  const qrFrameSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <!-- Decorative rings -->
    <circle cx="50" cy="50" r="48" fill="none" stroke="${ACCENT_COLOR}" stroke-width="0.3" opacity="0.5" />
    <circle cx="50" cy="50" r="45" fill="none" stroke="${ACCENT_COLOR}" stroke-width="0.5" stroke-dasharray="1.5 2" />
    
    <!-- Paths for curved text -->
    <path id="pathTop" d="M 12 50 A 38 38 0 0 1 88 50" fill="none" />
    <path id="pathBot" d="M 88 50 A 38 38 0 0 1 12 50" fill="none" />
    
    <text fill="${ACCENT_COLOR}" font-family="Inter, sans-serif" font-size="6.5" font-weight="600" letter-spacing="1">
      <textPath href="#pathTop" startOffset="50%" text-anchor="middle">ESCANEA PARA MÁS</textPath>
    </text>
    <text fill="${ACCENT_COLOR}" font-family="Inter, sans-serif" font-size="6.5" font-weight="600" letter-spacing="1">
      <textPath href="#pathBot" startOffset="50%" text-anchor="middle">CURIOSIDADES</textPath>
    </text>
  </svg>`;

  // ────────────────────────────────────────────────────────────────────────
  // FRONT FACE LAYOUT
  // ────────────────────────────────────────────────────────────────────────
  const frontBg = {
    name: 'bg', type: 'rectangle', position: { x: 0, y: 0 }, width: widthMm, height: heightMm,
    color: BG_COLOR, borderWidth: 0, readOnly: true,
  };
  const frontBorder = {
    name: 'border', type: 'rectangle', position: { x: inset, y: inset }, width: widthMm - inset * 2, height: heightMm - inset * 2,
    color: '', borderColor: ACCENT_COLOR, borderWidth: 0.2, readOnly: true,
  };
  // Art floats beautifully in the center leaving room for titles
  const frontArtVertical = { x: inset + 2, y: inset + 12, w: widthMm - (inset + 2) * 2, h: heightMm - (inset + 12) * 2 - 8 };
  const frontArtHorizontal = { x: safeArea, y: safeArea, w: widthMm - safeArea * 2, h: heightMm - safeArea * 2 };
  const frontArtPos = isHorizontal ? frontArtHorizontal : frontArtVertical;

  const frontArt = {
    name: 'art', type: 'image',
    position: { x: frontArtPos.x, y: frontArtPos.y },
    width: frontArtPos.w, height: frontArtPos.h,
  };
  
  const frontNumber = {
    name: 'number', type: 'text',
    position: { x: inset + 2, y: inset + 2 },
    width: 15, height: 8,
    fontSize: 16, alignment: 'left', verticalAlignment: 'middle',
    fontName: 'Cormorant Garamond', fontColor: ACCENT_COLOR,
  };
  const frontTitle = {
    name: 'title', type: 'text',
    position: { x: inset + 2, y: heightMm - inset - 8 },
    width: textW, height: 6,
    fontSize: 12, alignment: 'right', verticalAlignment: 'middle',
    fontName: 'Cormorant Garamond', fontColor: TEXT_COLOR,
  };

  // ────────────────────────────────────────────────────────────────────────
  // BACK FACE LAYOUT
  // ────────────────────────────────────────────────────────────────────────
  // The layout follows the mockup: Top hint -> Big Phrase -> Mid text -> Bottom QR + SVG Sello
  
  const backBg = { ...frontBg };
  const backBorder = { ...frontBorder };

  // Y-coordinates logic (based on vertical 63x88 ratios originally, scaled to actual height)
  const hintY = isHorizontal ? safeArea + 2 : safeArea + 6;
  const phraseY = isHorizontal ? hintY + 8 : hintY + 12;
  const instructionY = isHorizontal ? phraseY + 18 : phraseY + 24;
  
  const hintFontSize = isHorizontal ? 6 : 5.5;
  const phraseFontSize = isHorizontal ? 12 : 14;
  const instructionFontSize = isHorizontal ? 6 : 7;
  
  // QR positioning at the bottom
  const qrSize = 10;
  const svgFrameSize = qrSize + 10; // Extra room for the curved text
  const qrY = heightMm - inset - svgFrameSize - 2;
  const qrX = (widthMm / 2) - (qrSize / 2);
  const frameX = (widthMm / 2) - (svgFrameSize / 2);

  const whenToUse = {
    name: 'when_to_use', type: 'text',
    position: { x: safeArea, y: hintY },
    width: textW, height: 6,
    fontSize: hintFontSize, alignment: 'center',
    fontName: 'Inter', fontColor: TEXT_COLOR,
    lineHeight: 1, characterSpacing: 1.5,
  };
  const phrase = {
    name: 'phrase', type: 'text',
    position: { x: safeArea, y: phraseY },
    width: textW, height: isHorizontal ? 16 : 22,
    fontSize: phraseFontSize, alignment: 'center', verticalAlignment: 'top',
    fontName: 'Cormorant Garamond', fontColor: TEXT_COLOR,
    lineHeight: 1.1,
  };
  const instruction = {
    name: 'instruction', type: 'text',
    position: { x: safeArea + 4, y: instructionY },
    width: textW - 8, height: isHorizontal ? 8 : 15,
    fontSize: instructionFontSize, alignment: 'center', verticalAlignment: 'top',
    fontName: 'Inter', fontColor: TEXT_COLOR, opacity: 0.85,
    lineHeight: 1.3,
  };
  // Answer & fun facts are pushed down to the remaining space or rotated
  const answer = {
    name: 'answer', type: 'text',
    position: { x: safeArea, y: qrY - 8 },
    width: textW, height: 5,
    fontSize: 5, alignment: 'center',
    fontName: 'Inter', fontColor: ACCENT_COLOR,
    rotate: 180,
  };
  const qrFrame = {
    name: 'qr_frame', type: 'svg',
    position: { x: frameX, y: qrY - (svgFrameSize - qrSize) / 2 },
    width: svgFrameSize, height: svgFrameSize,
    content: qrFrameSvg, readOnly: true,
  };
  const qr = {
    name: 'qr', type: 'qrcode',
    position: { x: qrX, y: qrY },
    width: qrSize, height: qrSize,
  };
  const brand = {
    name: 'brand', type: 'text',
    position: { x: safeArea, y: heightMm - inset - 3 },
    width: textW, height: 3,
    fontSize: 5, alignment: 'center',
    fontName: 'Cormorant Garamond', fontColor: TEXT_COLOR,
    characterSpacing: 2,
  };

  return {
    basePdf: {
      width: widthMm,
      height: heightMm,
      padding: [0, 0, 0, 0],
    },
    schemas: [
      // ── Page 0: FRONT FACE ──
      [frontBg, frontBorder, frontArt, frontNumber, frontTitle] as Schema[],
      
      // ── Page 1: BACK FACE ──
      [backBg, backBorder, qrFrame, qr, whenToUse, phrase, instruction, answer, brand] as Schema[],
    ],
    sampledata: [
      {
        // Front default data
        bg: '',
        art: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=600&auto=format&fit=crop',
        number: '7',
        title: 'LA VUELTA',
        // Back default data
        border: '',
        qr_frame: qrFrameSvg,
        when_to_use: 'CUANDO SENTÍS QUE ESTÁS DANDO VUELTAS',
        phrase: 'A veces volver al punto de partida es la forma más honesta de avanzar.',
        instruction: 'Sostené un hielo en la mano hasta que sea muy intenso. O llená un bol con agua fría y hielo y sumergí la cara por 15 segundos. Sentí el cambio. Respirá.',
        answer: 'Rta: Dar vueltas no es perder el tiempo, es ganar perspectiva.',
        fun_fact: '💡 El 80% de los proyectos abandonados tenían una solución a menos de 3 pasos.',
        qr: 'https://baraja.cards',
        brand: 'BARAJA',
      },
    ],
  };
}

export function getTemplateForDeck(deck: DeckSchema): Template {
  const config = deck.design?.layout_config;
  
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
