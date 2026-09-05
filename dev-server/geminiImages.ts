import fs from 'node:fs/promises';
import path from 'node:path';
import type { DeckSchema, RawDeckContent } from '@entity-builders/deck-engine';
import { ASSETS_DIR, CONTENT_DIR } from './paths';
import { cleanOptionalString, isRecord } from './contentUtils';
import { saveEditionToSupabase } from './supabasePersistence';

type ArtDeck = RawDeckContent & Partial<Pick<DeckSchema, 'print_specs'>>;

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
};

function readFirstGeminiText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates)) return '';
  const candidate = data.candidates[0];
  if (!isRecord(candidate)) return '';
  const content = candidate.content;
  if (!isRecord(content) || !Array.isArray(content.parts)) return '';
  return content.parts
    .map(part => isRecord(part) && typeof part.text === 'string' ? part.text : '')
    .join('');
}

function buildEditionArtDomainPrompt(deck: ArtDeck): string {
  const metadata: Record<string, unknown> = isRecord(deck?.metadata) ? deck.metadata : {};
  const digital: Record<string, unknown> = isRecord(deck?.digital) ? deck.digital : {};
  const catalog: Record<string, unknown> = isRecord(digital.catalog) ? digital.catalog : {};
  const tags = Array.isArray(digital.tags)
    ? digital.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const topic = cleanOptionalString(metadata.topic);
  const tone = cleanOptionalString(metadata.tone);
  const catalogCollection = cleanOptionalString(catalog.collection);
  const catalogCategory = cleanOptionalString(catalog.category);
  const catalogFamily = [catalogCollection, catalogCategory].filter(Boolean).join(' / ');

  const details = [
    topic ? `The subject world is ${topic.toLowerCase()}.` : '',
    tone ? `The mood should feel ${tone.toLowerCase()}.` : '',
    catalogFamily
      ? `The catalog family is ${catalogFamily.toLowerCase()}.`
      : '',
    tags.length > 0 ? `Related visual themes include ${Array.from(new Set(tags)).join(', ').toLowerCase()}.` : '',
  ].filter(Boolean);

  return [
    'Create a single scene illustration for one card in this deck series. It must feel visually native to the deck, but it must not look like a card cover, poster, title page, label, infographic, document, UI screen, or printed layout.',
    ...details,
    'Use this only as art direction for color, mood, genre, and subject matter. Do not render any deck metadata, headings, descriptions, category names, or tags as visible marks.',
  ].join('\n');
}

interface ImageTextValidation {
  containsText: boolean;
  reason: string;
}

export async function validateNoTextImage(
  apiKey: string,
  base64Data: string,
  imageKind: 'front-art' | 'background',
): Promise<ImageTextValidation> {
  const validationPrompt = [
    `Inspect this generated ${imageKind === 'front-art' ? 'front card artwork' : 'print-card background'}.`,
    'Return JSON only.',
    'Set containsText to true if you see legible letters, numbers, words, titles, subtitles, captions, labels, UI panels, edition labels, anti-spoiler labels, answers, field labels, placeholder typography, brand text, QR codes, logos, signage, or pseudo-typographic marks.',
    'Set containsText to false only if the bitmap is purely visual/artistic with no readable or pseudo-readable text marks.',
  ].join('\n');

  try {
    const validationRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: validationPrompt },
            { inlineData: { mimeType: 'image/png', data: base64Data } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              containsText: { type: 'BOOLEAN' },
              reason: { type: 'STRING' },
            },
            required: ['containsText', 'reason'],
          },
        },
      }),
    });

    if (!validationRes.ok) {
      console.warn('[Frame Generator] Text validation request failed:', validationRes.status);
      return {
        containsText: imageKind === 'front-art',
        reason: 'validation_unavailable',
      };
    }

    const validationData = await validationRes.json() as unknown;
    const rawText = readFirstGeminiText(validationData).replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(rawText) as unknown;
    if (!isRecord(parsed) || typeof parsed.containsText !== 'boolean') {
      return {
        containsText: imageKind === 'front-art',
        reason: 'validation_unreadable',
      };
    }

    return {
      containsText: parsed.containsText,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch (error: unknown) {
    console.warn('[Frame Generator] Text validation failed:', error);
    return {
      containsText: imageKind === 'front-art',
      reason: 'validation_error',
    };
  }
}

export async function generateCardArt(
  deck: ArtDeck,
  cardId: string,
  slug: string,
  apiKey: string
): Promise<{ success: boolean; art_url?: string; art_versions?: string[]; error?: string }> {
  const card = deck.cards.find((candidate) => candidate.id === cardId);
  if (!card) return { success: false, error: 'Card not found' };

  const basePrompt = card.front.art_prompt;
  if (!basePrompt) return { success: false, error: 'No art_prompt on card' };

  // Build enriched prompt from art_direction + subject_hint + base prompt
  const artDir = deck.metadata?.art_direction;
  const promptParts: string[] = [];

  // HARD STYLE OVERRIDE — Gemini tends to default to photos, so we force illustration
  const styleOverrides: Record<string, string> = {
    'abstract-fine-art': 'Create a FLAT ILLUSTRATION. Abstract fine art, expressionist. This is NOT a photograph.',
    'evocative-photography': 'Create an evocative photograph.',
    'stylized-illustration': 'Create a FLAT VECTOR-STYLE ILLUSTRATION, like a vintage screen-printed poster. This MUST look like a hand-drawn illustration or print, NOT a photograph. DO NOT generate a photo. Use flat shapes, bold colors, visible print texture, and NO photorealistic rendering.',
    'vintage-photography': 'Create a vintage-style photograph with film grain.',
    'documentary': 'Create a documentary-style photograph.',
    'custom': '',
  };

  const styleKey = artDir?.style || 'abstract-fine-art';
  if (styleOverrides[styleKey]) {
    promptParts.push(styleOverrides[styleKey]);
  }

  promptParts.push(buildEditionArtDomainPrompt(deck));

  if (artDir?.global_brief) {
    promptParts.push(artDir.global_brief);
  }
  if (artDir?.faces && artDir.faces !== 'realistic') {
    const faceRules: Record<string, string> = {
      'none': 'Do not show any human faces at all. Show people only as solid black silhouettes, from behind, or cropped below the neck. No facial features whatsoever.',
      'silhouette': 'Show human figures as solid dark silhouettes or from behind. No recognizable facial features.',
      'stylized': 'Show faces only in a stylized, cartoon, or caricature style — never photorealistic.',
    };
    if (faceRules[artDir.faces]) promptParts.push(faceRules[artDir.faces]);
  }
  if (card.front.subject_hint) {
    promptParts.push(`This card is about ${card.front.subject_hint}. Use the correct visual world, colors, place, and era while avoiding readable text, labels, and photorealistic faces unless the edition explicitly allows them.`);
  }
  // Anti-spoiler rule for trivia cards
  if (card.back?.answer) {
    promptParts.push('For trivia cards, keep the image evocative and clue-like without revealing the exact answer. Do not include movie titles, answer text, actor names, captions, labels, or written clues.');
  }
  promptParts.push(basePrompt);

  const width = deck.print_specs?.dimensions?.width || 88;
  const height = deck.print_specs?.dimensions?.height || 138;

  // Pick the closest Imagen 4 supported aspect ratio for the card dimensions.
  // Imagen 4 supports: 1:1, 3:4, 4:3, 9:16, 16:9
  // 88x138mm = 0.638 ratio → 9:16 (0.5625) is closest for tall portrait cards.
  // 88x63mm  = 1.397 ratio → 4:3  (1.333) is closest for landscape cards.
  const cardRatio = width / height;
  let targetRatio: string;
  if (cardRatio >= 1) {
    targetRatio = cardRatio > 1.33 ? '16:9' : '4:3';
  } else {
    targetRatio = cardRatio < 0.65 ? '9:16' : '3:4';
  }

  // Clean canvas instructions — prevent the AI from rendering the art as a physical object
  // (photo of a painting on wall, canvas with edges, framed artwork, etc.)
  promptParts.push(`Make only the artwork itself, not a photograph of a painting, not a canvas on a wall, not a framed picture, and not a card mockup. Do not render canvas edges, frames, wall backgrounds, shadows, or 3D perspective of a printed object.

The bitmap must contain no text of any kind: no letters, numbers, words, title blocks, captions, subtitles, edition labels, anti-spoiler labels, answer text, UI panels, field labels, logos, signage, QR codes, watermarks, pseudo-text, or decorative glyphs that resemble writing. Do not render the card title, deck name, edition name, card number, prompt instructions, answer, or any technical prompt text.

The artwork must fill the entire image edge-to-edge with no margins, borders, white space, or empty background. Colors, textures, and visual elements should extend to every edge. Do not paint any card shape, rounded corners, or decorative border into the image. Think of the output as seamless visual artwork that will be cropped; every pixel must be purely illustrative.`);


  // Using Imagen 4 which officially supports aspect ratio parameters!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;

  let base64Data = '';
  let rejectedTextReason = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const retryNoTextWarning = attempt > 1
      ? `Previous attempt was rejected because it contained text or text-like marks. This retry must be a pure visual scene only: no poster layout, no cover design, no typography, no QR, no labels, no signs, no captions, no readable or pseudo-readable marks anywhere.`
      : '';
    const prompt = [...promptParts, retryNoTextWarning].filter(Boolean).join('\n');

    console.log(`🎨 Generating art for ${cardId} [${targetRatio}] attempt ${attempt}: "${basePrompt.slice(0, 80)}..."`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: targetRatio,
          outputOptions: { mimeType: "image/jpeg" }
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Imagen 4 API ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as ImagenPredictResponse;
    const generatedBase64Data = data.predictions?.[0]?.bytesBase64Encoded;

    if (!generatedBase64Data) {
      throw new Error('No image returned by Imagen API');
    }

    const noTextValidation = await validateNoTextImage(apiKey, generatedBase64Data, 'front-art');
    if (!noTextValidation.containsText) {
      base64Data = generatedBase64Data;
      break;
    }

    rejectedTextReason = noTextValidation.reason || 'sin detalle';
    console.warn(`🚫 [Front Art] Rejected generated image with text (${rejectedTextReason}).`);
  }

  if (!base64Data) {
    return {
      success: false,
      error: `La imagen generada incluye texto, numeros, QR o marcas tipograficas (${rejectedTextReason || 'sin detalle'}). No se guardó. El frente debe ser pura ilustracion sin texto.`,
    };
  }

  // Save to public dir (archive old version first)
  const editionDir = path.resolve(ASSETS_DIR, slug);
  await fs.mkdir(editionDir, { recursive: true });

  // Archive existing art if it exists
  const existingFile = path.resolve(editionDir, `${cardId}.jpg`);
  try {
    await fs.access(existingFile);
    // File exists — rename with timestamp to preserve it
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archivedFilename = `${cardId}_v${ts}.jpg`;
    const archivedPath = path.resolve(editionDir, archivedFilename);
    await fs.rename(existingFile, archivedPath);
    const archivedUrl = `/assets/editions/${slug}/${archivedFilename}`;
    console.log(`📦 Archived previous: ${archivedUrl}`);
    // Push to art_versions (newest first)
    if (!card.front.art_versions) card.front.art_versions = [];
    card.front.art_versions.unshift(archivedUrl);
  } catch {
    // No existing file, nothing to archive
  }

  const filename = `${cardId}.jpg`;
  await fs.writeFile(path.resolve(editionDir, filename), Buffer.from(base64Data, 'base64'));

  const art_url = `/assets/editions/${slug}/${filename}?v=${Date.now()}`;

  // Update JSON
  card.front.art_url = art_url;
  const jsonPath = path.resolve(CONTENT_DIR, `${slug}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(deck, null, 2), 'utf-8');

  // Sync to DB
  await saveEditionToSupabase(deck);

  console.log(`✅ Saved: ${art_url}`);
  return { success: true, art_url, art_versions: card.front.art_versions || [] };
}
