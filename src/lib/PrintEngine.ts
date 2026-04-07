import { generate } from '@pdfme/generator';
import type { Template, Schema } from '@pdfme/common';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { getTemplateForDeck, buildPdfmeFonts, pdfmePlugins } from './pdfmeConfig';

interface PrintOptions {
  sheetSize: 'A3' | 'A4';
}

function getSheetDimensions(size: 'A3' | 'A4') {
  if (size === 'A3') return { width: 420, height: 297 };
  return { width: 297, height: 210 };
}

/**
 * Helper to convert any browser-supported image (WebP, PNG, etc) 
 * into a base64 JPEG to avoid "SOI not found in JPEG" errors in pdfme.
 */
async function toJpegDataUrl(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:image/jpeg')) return url;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } else {
        resolve(url);
      }
    };
    img.onerror = () => {
      console.warn('Failed to convert image to JPEG for PDF:', url);
      resolve(url); // Fallback to original
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
  const cardTemplate = getTemplateForDeck(deck);
  const cardSchemas = cardTemplate.schemas; // [0] = front, [1] = back
  
  // Base dimensions of a single card
  const cardWidth = (typeof cardTemplate.basePdf === 'object' && 'width' in cardTemplate.basePdf) 
    ? cardTemplate.basePdf.width 
    : deck.print_specs?.dimensions?.width || 88;
  const cardHeight = (typeof cardTemplate.basePdf === 'object' && 'height' in cardTemplate.basePdf) 
    ? cardTemplate.basePdf.height 
    : deck.print_specs?.dimensions?.height || 63;
    
  const bleedMm = deck.print_specs?.bleed || 3;
  const totalW = cardWidth + bleedMm * 2;
  const totalH = cardHeight + bleedMm * 2;
  
  // 2. Sheet Math
  const sheet = getSheetDimensions(sheetSize);
  const cols = Math.floor(sheet.width / totalW);
  const rows = Math.floor(sheet.height / totalH);
  const cardsPerSheet = cols * rows;

  // Center the grid on the page
  const gridW = cols * totalW;
  const gridH = rows * totalH;
  const offsetX = (sheet.width - gridW) / 2;
  const offsetY = (sheet.height - gridH) / 2;

  // 3. Build the Master Imposition Template
  // We'll have two pages: Front Sheet, Back Sheet
  const newFrontSchema: Schema[] = [];
  const newBackSchema: Schema[] = [];

  // Helper to deep clone and offset a schema element
  const offsetSchemaElement = (element: Schema, xOffset: number, yOffset: number, suffix: string): Schema => {
    const el = JSON.parse(JSON.stringify(element)) as Schema;
    // Append suffix to name so each cell has unique variables (e.g., "title_0_0")
    el.name = `${el.name}_${suffix}`;
    
    // Fix: DB templates might hold legacy SVG content with leading whitespace which crashes pdfme
    if (el.type === 'svg' && typeof (el as Record<string, any>).content === 'string') {
      let contentString = (el as Record<string, any>).content as string;
      const svgStartIndex = contentString.indexOf('<svg');
      if (svgStartIndex > 0) {
        contentString = contentString.substring(svgStartIndex);
      }
      (el as Record<string, any>).content = contentString.trim();
    }
    
    // Some elements like 'bg' logic
    el.position.x += xOffset;
    el.position.y += yOffset;
    return el;
  };

  // Build Front Grid (Page 0)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = offsetX + (c * totalW) + bleedMm;
      const cellY = offsetY + (r * totalH) + bleedMm;
      const suffix = `${r}_${c}`;

      cardSchemas[0].forEach((element) => {
        newFrontSchema.push(offsetSchemaElement(element, cellX, cellY, suffix));
      });
    }
  }

  // Build Back Grid (Page 1)
  // Remember: the back of the card on the right-most side of the front page
  // ends up on the left-most side of the back page when flipped horizontally!
  // Therefore, for printing doubly-sided, the columns must be mirrored.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mirroredCol = (cols - 1) - c; // Flip column index for the back
      const cellX = offsetX + (mirroredCol * totalW) + bleedMm;
      const cellY = offsetY + (r * totalH) + bleedMm;
      const suffix = `${r}_${c}`; // Keep the logical matching suffix

      cardSchemas[1].forEach((element) => {
        newBackSchema.push(offsetSchemaElement(element, cellX, cellY, suffix));
      });
    }
  }

  const impositionTemplate: Template = {
    basePdf: {
      width: sheet.width,
      height: sheet.height,
      padding: [0, 0, 0, 0],
    },
    schemas: [newFrontSchema, newBackSchema],
  };

  // Pre-fetch all unique image URLs to JPEG DataURIs to prevent "SOI not found in JPEG"
  const uniqueUrls = new Set<string>();
  deck.cards.forEach(c => {
    if (c.front.art_url) uniqueUrls.add(c.front.art_url);
  });
  
  const urlToDataUrl: Record<string, string> = {};
  for (const url of Array.from(uniqueUrls)) {
    urlToDataUrl[url] = await toJpegDataUrl(url);
  }

  // 4. Build Input Data
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
          // Map front
          pageInputs[`bg_${suffix}`] = '';
          pageInputs[`art_${suffix}`] = card.front.art_url ? urlToDataUrl[card.front.art_url] : '';
          pageInputs[`number_${suffix}`] = `#${String(card.front.number).padStart(2, '0')}`;
          pageInputs[`title_${suffix}`] = card.front.title;

          // Map back
          pageInputs[`border_${suffix}`] = '';
          pageInputs[`when_to_use_${suffix}`] = card.back.when_to_use;
          pageInputs[`phrase_${suffix}`] = `"${card.back.phrase}"`;
          pageInputs[`instruction_${suffix}`] = card.back.instruction;
          pageInputs[`answer_${suffix}`] = card.back.answer ? `Rta: ${card.back.answer}` : '';
          pageInputs[`fun_fact_${suffix}`] = card.back.fun_fact ? `💡 ${card.back.fun_fact}` : '';
          pageInputs[`qr_${suffix}`] = card.back.qr_url || 'https://baraja.cards';
          pageInputs[`brand_${suffix}`] = `Baraja · ${deck.name}`;
          
          // Hydrate any statically generated AI structural properties (SVGs, rectangles, dividers)
          cardSchemas.flat().forEach(schema => {
            const mappedName = `${schema.name}_${suffix}`;
            if (pageInputs[mappedName] === undefined) {
              let content = (schema as Record<string, any>).content || '';
              if (schema.type === 'svg' && typeof content === 'string') {
                const svgStartIndex = content.indexOf('<svg');
                if (svgStartIndex > 0) {
                  content = content.substring(svgStartIndex);
                }
                content = content.trim();
              }
              pageInputs[mappedName] = content;
            } else if (schema.type === 'svg' && typeof pageInputs[mappedName] === 'string') {
              let content = pageInputs[mappedName];
              const svgStartIndex = content.indexOf('<svg');
              if (svgStartIndex > 0) {
                content = content.substring(svgStartIndex);
              }
              pageInputs[mappedName] = content.trim();
            }
          });
        }
      }
    }
    
    pagesData.push(pageInputs);
  }

  return { template: impositionTemplate, inputs: pagesData };
}

export async function generatePrintPdf(deck: DeckSchema, options: PrintOptions): Promise<Uint8Array> {
  const { template, inputs } = await buildImpositionTemplateAndInputs(deck, options.sheetSize);

  const pdf = await generate({
    template,
    inputs,
    options: {
      font: buildPdfmeFonts(),
    },
    plugins: pdfmePlugins,
  });

  return pdf;
}
