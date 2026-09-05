import { generate } from '@pdfme/generator';
import type { Template, Schema } from '@pdfme/common';
import type { DeckSchema } from '@entity-builders/deck-engine';
import { getCardQrUrl, shouldRenderPrintableQr } from '@entity-builders/deck-engine';
import { getTemplateForDeck, createFlujoBTemplate, buildPdfmeFonts, pdfmePlugins } from './pdfmeConfig';
import type { PdfTypographyHints } from './pdfmeConfig';
import { getFrameDataUri, getFrameTypography } from './cardFrame';
import { applyReadableSchemaColors } from './cardReadability';
import { getDeckReverseModel, shouldUseLegacyFullBackTemplate } from './reverseModel';

// Adaptive phrase size utility removed. Handled natively via pdfme dynamicFontSize injection.

interface PrintOptions {
  sheetSize: 'A3' | 'A4';
}

function getSheetDimensions(size: 'A3' | 'A4') {
  if (size === 'A3') return { width: 420, height: 297 };
  return { width: 297, height: 210 };
}

type SchemaWithRuntimeFields = Schema & {
  content?: unknown;
  dynamicFontSize?: { min: number; max: number; fit: 'vertical' };
  fontSize?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Pre-crop an image to a target aspect ratio using "object-fit: cover" logic,
 * then convert to JPEG data URI. This is needed because pdfme stretches/contains
 * images but doesn't support cover-crop natively.
 *
 * @param url      Source image URL
 * @param targetW  Target width in any unit (only the ratio matters)
 * @param targetH  Target height in any unit
 */
export async function coverCropToJpeg(url: string, targetW: number, targetH: number): Promise<string> {
  if (!url) return '';
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const targetRatio = targetW / targetH;
      const imgRatio = img.width / img.height;

      // Calculate source rect (the "cover" crop in source image coordinates)
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgRatio > targetRatio) {
        // Image is wider than target → crop sides
        sw = Math.round(img.height * targetRatio);
        sx = Math.round((img.width - sw) / 2);
      } else {
        // Image is taller than target → crop top/bottom
        sh = Math.round(img.width / targetRatio);
        sy = Math.round((img.height - sh) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } else {
        resolve(url);
      }
    };
    img.onerror = () => {
      console.warn('[PrintEngine] Failed to cover-crop image:', url.substring(0, 80));
      resolve(url);
    };
    img.src = url;
  });
}

/**
 * Creates an imposition template (grid of cards) from a single-card template.
 */
async function buildImpositionTemplateAndInputs(
  deck: DeckSchema,
  sheetSize: 'A3' | 'A4'
): Promise<{ template: Template; inputs: Record<string, string>[] }> {
  // 1. Get the base single-card template
  const reverseModel = getDeckReverseModel(deck);
  const useLegacyFullBackTemplate = shouldUseLegacyFullBackTemplate(reverseModel);
  const shouldIncludeQr = shouldRenderPrintableQr(deck);
  const cardWidth = deck.print_specs?.dimensions?.width || 70;
  const cardHeight = deck.print_specs?.dimensions?.height || 120;
  const cardTemplate = useLegacyFullBackTemplate
    ? createFlujoBTemplate(cardWidth, cardHeight)
    : getTemplateForDeck(deck);
  const cardSchemas = cardTemplate.schemas; // [0] = front, [1] = back
  
  // Base dimensions of a single card (already determined above, or read from template)
  const resolvedCardWidth = (typeof cardTemplate.basePdf === 'object' && 'width' in cardTemplate.basePdf)
    ? cardTemplate.basePdf.width
    : cardWidth;
  const resolvedCardHeight = (typeof cardTemplate.basePdf === 'object' && 'height' in cardTemplate.basePdf)
    ? cardTemplate.basePdf.height
    : cardHeight;
    
  const bleedMm = deck.print_specs?.bleed || 3;
  const totalW = resolvedCardWidth + bleedMm * 2;
  const totalH = resolvedCardHeight + bleedMm * 2;
  
  // 2. Sheet Math
  const sheet = getSheetDimensions(sheetSize);
  const cols = Math.floor(sheet.width / totalW);
  const rows = Math.floor(sheet.height / totalH);
  const cardsPerSheet = cols * rows;

  // Debug: match AdminPrintView format for easy comparison
  console.log('[PrintEngine] Card dimensions:', { resolvedCardWidth, resolvedCardHeight, bleedMm, totalW, totalH });
  console.log('[PrintEngine] Grid:', { cols, rows, cardsPerSheet, sheet: `${sheet.width}×${sheet.height}` });
  console.log('[PrintEngine] basePdf source:', cardTemplate.basePdf);
  console.log('[PrintEngine] print_specs.dimensions:', deck.print_specs?.dimensions);
  console.log('[PrintEngine] reverseModel:', reverseModel.model);

  // Center the grid on the page
  const gridW = cols * totalW;
  const gridH = rows * totalH;
  const offsetX = (sheet.width - gridW) / 2;
  const offsetY = (sheet.height - gridH) / 2;

  // 3. Build the Master Imposition Template
  const newFrontSchema: Schema[] = [];
  const newBackSchema: Schema[] = [];

  const offsetSchemaElement = (element: Schema, xOffset: number, yOffset: number, bleed: number, suffix: string): Schema => {
    const el = JSON.parse(JSON.stringify(element)) as Schema;
    el.name = `${el.name}_${suffix}`;
    
    // Sanitize SVG content (legacy whitespace issue)
    const runtimeElement = el as SchemaWithRuntimeFields;

    if (el.type === 'svg' && typeof runtimeElement.content === 'string') {
      let contentString = runtimeElement.content;
      const svgStartIndex = contentString.indexOf('<svg');
      if (svgStartIndex > 0) {
        contentString = contentString.substring(svgStartIndex);
      }
      runtimeElement.content = contentString.trim();
    }
    
    // Ensure background images bleed into the crop margin
    // CRITICAL: always use resolvedCardWidth/Height, NOT the element's stored size.
    // The stored size may be stale if the card size was changed but schemas weren't re-saved.
    if (element.name === 'art' || element.name === 'bg' || element.name === 'back_ai_image') {
      el.position.x = xOffset - bleed;
      el.position.y = yOffset - bleed;
      el.width = resolvedCardWidth + bleed * 2;
      el.height = resolvedCardHeight + bleed * 2;
    } else {
      // Clamp element within card boundaries if it overflows (stale schema from old card size)
      let elX = el.position.x as number;
      let elY = el.position.y as number;
      let elW = el.width as number;
      let elH = el.height as number;

      // If element exceeds card boundaries, scale proportionally to fit
      if (elX + elW > resolvedCardWidth) {
        const scaleW = resolvedCardWidth / (elX + elW);
        elX = elX * scaleW;
        elW = elW * scaleW;
      }
      if (elY + elH > resolvedCardHeight) {
        const scaleH = resolvedCardHeight / (elY + elH);
        elY = elY * scaleH;
        elH = elH * scaleH;
      }

      el.position.x = elX + xOffset;
      el.position.y = elY + yOffset;
      el.width = elW;
      el.height = elH;
    }

    // Safety net: ensure dynamicFontSize is always enabled for text objects during PRINT
    // so long strings never overflow the card boundaries.
    if (el.type === 'text') {
      const isDynamicEligible = el.name.startsWith('phrase_') || 
                                el.name.startsWith('instruction_') || 
                                el.name.startsWith('when_to_use_') ||
                                el.name.startsWith('whenToUse_') ||
                                el.name.startsWith('answer_');
      if (isDynamicEligible) {
         const fontSize = typeof runtimeElement.fontSize === 'number' ? runtimeElement.fontSize : 10;
         runtimeElement.dynamicFontSize = {
            min: fontSize * 0.45,
            max: fontSize,
            fit: 'vertical'
         };
      }
    }
    
    return el;
  };

  // ── Crop Marks (Marcas de Corte) ──────────────────────────────────────────
  // Professional print-ready trim marks at the edges of the sheet.
  // Lines NEVER intersect the artwork or bleed zones. Accommodates double-cut gutters.
  const CROP_MARK_GAP = 2;        // mm gap from the outer grid edge into the white margin
  const CROP_MARK_LENGTH = 5;     // mm length of the mark
  const CROP_MARK_WEIGHT = 0.25;  // mm line thickness
  const CROP_MARK_COLOR = '#000000';

  /**
   * Generates crop mark lines ONLY in the white margins of the page,
   * never intersecting the image bleed.
   */
  function buildPageCropMarks(offsetX: number, offsetY: number, cols: number, rows: number, cardW: number, cardH: number, bleed: number, totalW: number, totalH: number): Schema[] {
    const marks: Schema[] = [];
    
    const gridTop = offsetY;
    const gridBottom = offsetY + rows * totalH;
    const gridLeft = offsetX;
    const gridRight = offsetX + cols * totalW;

    const makeMark = (name: string, x1: number, y1: number, x2: number, y2: number): Schema => ({
      name: `crop_${name}`,
      type: 'line',
      position: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
      width: Math.abs(x2 - x1) || CROP_MARK_WEIGHT,
      height: Math.abs(y2 - y1) || CROP_MARK_WEIGHT,
      color: CROP_MARK_COLOR,
    } as Schema);

    // Vertical cuts (Marks at top and bottom sheet margins)
    for (let c = 0; c < cols; c++) {
      const trimLeft = offsetX + c * totalW + bleed;
      const trimRight = offsetX + c * totalW + bleed + cardW;
      
      // Top margin
      marks.push(makeMark(`v_tl_${c}`, trimLeft, gridTop - CROP_MARK_GAP - CROP_MARK_LENGTH, trimLeft, gridTop - CROP_MARK_GAP));
      marks.push(makeMark(`v_tr_${c}`, trimRight, gridTop - CROP_MARK_GAP - CROP_MARK_LENGTH, trimRight, gridTop - CROP_MARK_GAP));
      
      // Bottom margin
      marks.push(makeMark(`v_bl_${c}`, trimLeft, gridBottom + CROP_MARK_GAP, trimLeft, gridBottom + CROP_MARK_GAP + CROP_MARK_LENGTH));
      marks.push(makeMark(`v_br_${c}`, trimRight, gridBottom + CROP_MARK_GAP, trimRight, gridBottom + CROP_MARK_GAP + CROP_MARK_LENGTH));
    }

    // Horizontal cuts (Marks at left and right sheet margins)
    for (let r = 0; r < rows; r++) {
      const trimTop = offsetY + r * totalH + bleed;
      const trimBottom = offsetY + r * totalH + bleed + cardH;
      
      // Left margin
      marks.push(makeMark(`h_lt_${r}`, gridLeft - CROP_MARK_GAP - CROP_MARK_LENGTH, trimTop, gridLeft - CROP_MARK_GAP, trimTop));
      marks.push(makeMark(`h_lb_${r}`, gridLeft - CROP_MARK_GAP - CROP_MARK_LENGTH, trimBottom, gridLeft - CROP_MARK_GAP, trimBottom));
      
      // Right margin
      marks.push(makeMark(`h_rt_${r}`, gridRight + CROP_MARK_GAP, trimTop, gridRight + CROP_MARK_GAP + CROP_MARK_LENGTH, trimTop));
      marks.push(makeMark(`h_rb_${r}`, gridRight + CROP_MARK_GAP, trimBottom, gridRight + CROP_MARK_GAP + CROP_MARK_LENGTH, trimBottom));
    }

    return marks;
  }

  // Build Front Grid (Page 0)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = offsetX + (c * totalW);
      const cellY = offsetY + (r * totalH);
      const suffix = `${r}_${c}`;

      // Card content (offset by bleed to sit inside the cell)
      cardSchemas[0].forEach((element) => {
        newFrontSchema.push(offsetSchemaElement(element, cellX + bleedMm, cellY + bleedMm, bleedMm, suffix));
      });
    }
  }

  // Build Back Grid (Page 1) — mirrored columns for double-sided printing
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mirroredCol = (cols - 1) - c;
      const cellX = offsetX + (mirroredCol * totalW);
      const cellY = offsetY + (r * totalH);
      const suffix = `${r}_${c}`;

      // Card content (offset by bleed)
      cardSchemas[1].forEach((element) => {
        newBackSchema.push(offsetSchemaElement(element, cellX + bleedMm, cellY + bleedMm, bleedMm, suffix));
      });
    }
  }

  // Append sheet-level crop marks to both pages
  const pageCropMarks = buildPageCropMarks(offsetX, offsetY, cols, rows, resolvedCardWidth, resolvedCardHeight, bleedMm, totalW, totalH);
  newFrontSchema.push(...pageCropMarks);
  newBackSchema.push(...pageCropMarks);

  const impositionTemplate: Template = {
    basePdf: {
      width: sheet.width,
      height: sheet.height,
      padding: [0, 0, 0, 0],
    },
    schemas: [newFrontSchema, newBackSchema],
  };

  // ── Detect deck rendering mode ─────────────────────────────────────────
  console.log(`[PrintEngine] Mode: ${useLegacyFullBackTemplate ? `Full-back image (${reverseModel.model})` : 'Editable frame+text'}`);

  // ── PRE-FETCH PHASE ────────────────────────────────────────────────────
  // Front art images: cover-crop to the card's aspect ratio so pdfme fills edge-to-edge.
  // Back images: convert to JPEG as-is (they're already designed for the card dimensions).
  const frontUrls = new Set<string>();
  const backUrls = new Set<string>();
  deck.cards.forEach(c => {
    if (c.front.art_url) frontUrls.add(c.front.art_url);
    if (useLegacyFullBackTemplate && c.back.back_image_url) backUrls.add(c.back.back_image_url);
  });
  
  const urlToDataUrl: Record<string, string> = {};
  const fetchPromises = [
    // Front arts: cover-crop to total bleed cell ratio so they fill perfectly
    ...Array.from(frontUrls).map(async (url) => {
      urlToDataUrl[url] = await coverCropToJpeg(url, totalW, totalH);
    }),
    // Back images: cover-crop as well, because they need to fill the bleed cell
    ...Array.from(backUrls).map(async (url) => {
      urlToDataUrl[url] = await coverCropToJpeg(url, totalW, totalH);
    }),
  ];
  
  // Only fetch the frame if we have cards that still need it (non-Flujo B)
  const needsFrame = !useLegacyFullBackTemplate;
  // Cover-crop the frame to the exact cell aspect ratio (including bleed) so it fills edge-to-edge in the PDF.
  const framePromise = needsFrame
    ? getFrameDataUri(deck.slug).then(uri => coverCropToJpeg(uri, totalW, totalH))
    : Promise.resolve('');
  
  await Promise.all([...fetchPromises, framePromise]);
  const frameDataUri = await framePromise;
  
  if (needsFrame) {
    console.log(`[PrintEngine] Frame loaded + cover-cropped to ${totalW}×${totalH}mm: ${frameDataUri.length} chars`);
  }

  // ── HYDRATE INPUT DATA ──────────────────────────────────────────────────
  const pagesData: Record<string, string>[] = [];
  
  for (let i = 0; i < deck.cards.length; i += cardsPerSheet) {
    const sheetCards = deck.cards.slice(i, i + cardsPerSheet);
    const pageInputs: Record<string, string> = {};

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cardIndex = (r * cols) + c;
        const card = sheetCards[cardIndex];
        const suffix = `${r}_${c}`;

        if (card) {
          // ── FRONT FACE (same for all modes) ──
          pageInputs[`art_${suffix}`] = card.front.art_url ? urlToDataUrl[card.front.art_url] : '';
          pageInputs[`number_${suffix}`] = `#${String(card.front.number).padStart(2, '0')}`;
          pageInputs[`title_${suffix}`] = card.front.title;

          if (useLegacyFullBackTemplate) {
            // ── FLUJO B: AI-generated full card back + QR overlay ──
            pageInputs[`back_ai_image_${suffix}`] = card.back.back_image_url
              ? (urlToDataUrl[card.back.back_image_url] || card.back.back_image_url)
              : '';
            pageInputs[`qr_overlay_${suffix}`] = shouldIncludeQr
              ? card.back.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number)
              : '';
          } else {
            // ── STANDARD: frame image + text overlay ──
            pageInputs[`bg_${suffix}`] = frameDataUri;

            const hiddenFields = deck.design_template_overrides?.hidden_fields || {};
            // Legacy fallback
            const layoutConfig = deck.design?.layout_config;
            if (
              (isRecord(layoutConfig) && layoutConfig.hide_player_count === true) ||
              deck.design_template_overrides?.hide_player_count
            ) {
               hiddenFields.player_count = true;
            }

            const rawWhenToUse = card.back.when_to_use || '';
            const cleanWhenToUse = hiddenFields.player_count ? rawWhenToUse.replace(/([.¡!]\s*)?[Pp]ara\s*\d+[+-]?\s*jugador(es)?\.?/g, '').trim() : rawWhenToUse;
            
            pageInputs[`when_to_use_${suffix}`] = hiddenFields.when_to_use ? '' : cleanWhenToUse;
            pageInputs[`whenToUse_${suffix}`] = hiddenFields.when_to_use || hiddenFields.whenToUse ? '' : cleanWhenToUse;
            pageInputs[`phrase_${suffix}`] = hiddenFields.phrase ? '' : `"${card.back.phrase}"`;
            pageInputs[`instruction_${suffix}`] = hiddenFields.instruction ? '' : card.back.instruction;
            pageInputs[`answer_${suffix}`] = hiddenFields.answer ? '' : (card.back.answer ? `Rta: ${card.back.answer}` : '');
            pageInputs[`fun_fact_${suffix}`] = hiddenFields.fun_fact ? '' : (card.back.fun_fact ? `💡 ${card.back.fun_fact}` : '');
            pageInputs[`qr_${suffix}`] = !shouldIncludeQr || hiddenFields.qr ? '' : (card.back.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
            pageInputs[`brand_${suffix}`] = hiddenFields.brand ? '' : `Baraja · ${deck.name}`;

            // ── PrintEngine now relies natively on pdfme's `dynamicFontSize` which is safely injected above. ──
          }
          
          // Hydrate any remaining schema defaults (SVGs, rectangles, dividers)
          const defaultData = (Array.isArray(cardTemplate.sampledata) && cardTemplate.sampledata[0]) as Record<string, string> || {};
          cardSchemas.flat().forEach(schema => {
            const mappedName = `${schema.name}_${suffix}`;
            if (pageInputs[mappedName] === undefined) {
              let content = defaultData[schema.name] || (schema as SchemaWithRuntimeFields).content || '';
              if (schema.type === 'svg' && typeof content === 'string') {
                const svgStartIndex = content.indexOf('<svg');
                if (svgStartIndex > 0) content = content.substring(svgStartIndex);
              }
              if (schema.type === 'image' && typeof content === 'string' && urlToDataUrl[content]) {
                content = urlToDataUrl[content];
              }
              pageInputs[mappedName] = typeof content === 'string' ? content.trim() : content;
            } else if (schema.type === 'svg' && typeof pageInputs[mappedName] === 'string') {
              let svgContent = pageInputs[mappedName];
              const svgStartIndex = svgContent.indexOf('<svg');
              if (svgStartIndex > 0) svgContent = svgContent.substring(svgStartIndex);
              pageInputs[mappedName] = svgContent.trim();
            }
          });
        }
      }
    }
    
    pagesData.push(pageInputs);
  }

  const readableTemplate = pagesData[0]
    ? await applyReadableSchemaColors(impositionTemplate, pagesData[0])
    : impositionTemplate;
  readableTemplate.schemas[0] = impositionTemplate.schemas[0];

  return { template: readableTemplate, inputs: pagesData };
}

export async function generatePrintPdf(deck: DeckSchema, options: PrintOptions): Promise<Uint8Array> {
  const { template, inputs } = await buildImpositionTemplateAndInputs(deck, options.sheetSize);
  const typo = deck.design.layout_config ?? getFrameTypography();
  const fonts = await buildPdfmeFonts(typo as PdfTypographyHints | null, template);

  const pdf = await generate({
    template,
    inputs,
    options: {
      font: fonts,
    },
    plugins: pdfmePlugins,
  });

  return pdf;
}
