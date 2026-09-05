import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { DeckSchema, RawDeckContent } from '@entity-builders/deck-engine';
import type { Plugin, ViteDevServer } from 'vite';
import { getDeckPublicationReadiness } from '../src/lib/deckPublicationReadiness';
import { fitTypographyHintsToContent } from '../src/lib/typographyFit';
import { ASSETS_DIR, BARAJA_PUBLIC_DIR, CONTENT_DIR, DECK_ENGINE_DIR } from './paths';
import { getBarajaGeminiApiKey, MISSING_GEMINI_API_KEY_ERROR } from './env';
import { runDeckSync, triggerDeckSync } from './deckSync';
import { saveEditionToSupabase } from './supabasePersistence';
import { buildDraftDigitalConfig } from './digitalDraft';
import { generateCardArt, validateNoTextImage } from './geminiImages';
import { readBody } from './http';
import { enrichMovieData } from './enrichment';
import { buildCopyHierarchyNote, shouldPrioritizeInstructionCopy, shouldPrioritizeInstructionForRawDeck } from './copyHierarchy';

type DevRequest = IncomingMessage & {
  method?: string;
  url?: string;
};

type DevResponse = ServerResponse & {
  flushHeaders?: () => void;
};

type DevNext = () => void;
type JsonRecord = Record<string, unknown>;
type TypographyHints = Record<string, unknown> & { ttfUrls?: Record<string, string> };

type GeminiTextResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
};

type FontMetadataResponse = {
  variants?: Array<{
    id?: string;
    ttf?: string;
  }>;
};

type EditionFieldDescription = {
  label: string;
  description: string;
  typicalLength: string;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorFinishReason(error: unknown): string | undefined {
  return isJsonRecord(error) && typeof error.finishReason === 'string' ? error.finishReason : undefined;
}

function collectFontFamilies(typography: TypographyHints | null | undefined): Set<string> {
  const fontFamilies = new Set<string>();
  Object.values(typography ?? {}).forEach((value) => {
    if (isJsonRecord(value) && typeof value.fontFamily === 'string') {
      fontFamilies.add(value.fontFamily);
    }
  });
  return fontFamilies;
}

function isHiddenDynamicField(hiddenFields: unknown, key: string): boolean {
  if (!isJsonRecord(hiddenFields)) return false;
  return hiddenFields[key] === true || (key === 'when_to_use' && hiddenFields.whenToUse === true);
}

function describeContentProfileForPrompt(contentProfile: unknown): string {
  if (!Array.isArray(contentProfile)) return '';

  const lines = contentProfile
    .map((entry) => {
      if (!isJsonRecord(entry) || typeof entry.key !== 'string') return null;
      const charCount = typeof entry.charCount === 'number' ? entry.charCount : undefined;
      const density = typeof entry.density === 'string' ? entry.density : undefined;
      return `- ${entry.key}: ${charCount ?? '?'} characters${density ? `, ${density} density` : ''}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

function buildReadabilityOverlayPrompt(primaryFieldName: string): string[] {
  return [
    `HUMAN READABILITY GATE (NON-NEGOTIABLE):`,
    `Judge the final card as a human would see it: printed at the stated millimeter size and also as a 60% zoom screen preview. If a normal reader must squint, reread, or guess a word, the design failed.`,
    `Do NOT rely on average color contrast alone. Backgrounds with dense line art, bubbles, outlines, grain, or high-frequency texture are visually busy even when they are pale.`,
    `For every text key, estimate backgroundComplexity as "low", "medium", or "high", set needsOverlay true when the local zone has busy texture/lines, and target readabilityScore >= 90.`,
    `Minimum human-readable typography: primary "${primaryFieldName}" usually 11-18pt and never below 8.8pt; phrase/support text never below 8pt when it carries meaning; answer never below 6.4pt; fun fact never below 5.8pt; tiny brand-only text may be smaller.`,
    `Use enough weight for real readability: important content should be 650-800 over detailed art. Avoid thin/300 weights on patterned backgrounds.`,
    `Avoid mid-tone blue, violet, gray, or low-contrast accent colors for body text over busy black/white line art. Use near-black, near-white, or a strong theme color only when it remains instantly readable.`,
    ``,
    `READABILITY OVERLAYS (CRITICAL):`,
    `Prefer NO container when the chosen text zone already has clean contrast.`,
    `If a container is necessary, create an integrated editorial overlay: subtle gradient wash, partial vignette, thin underline, asymmetrical plate, glass veil, or small shaped accent that belongs to the artwork.`,
    `Avoid generic stacked opaque rectangles, grey bars, repeated pills, and full-width horizontal banners. Those are failed layouts.`,
    `Do not shrink readable text just to fit a boring box. Give the primary "${primaryFieldName}" field more area and de-emphasize secondary fields instead.`,
    `containerSvg may be an empty string. If used, return raw scalable SVG shapes only, without an outer <svg> wrapper.`,
  ];
}

function buildHumanReadableWashSvg(): string {
  return [
    '<defs>',
    '<linearGradient id="humanReadabilityWash" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="rgba(255,255,255,0.72)"/>',
    '<stop offset="48%" stop-color="rgba(255,255,255,0.56)"/>',
    '<stop offset="100%" stop-color="rgba(255,255,255,0.22)"/>',
    '</linearGradient>',
    '</defs>',
    '<path d="M3 14 C16 3 36 0 50 4 C67 0 86 4 97 15 L96 84 C82 96 65 100 50 96 C33 100 15 96 4 84 Z" fill="url(#humanReadabilityWash)" stroke="rgba(15,23,42,0.18)" stroke-width="1"/>',
  ].join('');
}

function enforceHumanReadableTypography(
  typography: TypographyHints,
  options: {
    content: Record<string, unknown>;
    primaryFieldKey: string;
  },
): TypographyHints {
  const next: TypographyHints = { ...typography };

  Object.keys(next).forEach((key) => {
    const value = next[key];
    if (!isJsonRecord(value)) return;
    const text = String(options.content[key] ?? '').trim();
    if (!text) return;

    const fontSize = typeof value.fontSize === 'number' ? value.fontSize : getReadableMinimumFontSize(key, options.primaryFieldKey);
    const minimum = getReadableMinimumFontSize(key, options.primaryFieldKey);
    const backgroundComplexity = typeof value.backgroundComplexity === 'string' ? value.backgroundComplexity : 'medium';
    const readabilityScore = typeof value.readabilityScore === 'number' ? value.readabilityScore : 0;
    const needsOverlay = value.needsOverlay === true || backgroundComplexity === 'high' || readabilityScore > 0 && readabilityScore < 90;
    const containerSvg = typeof value.containerSvg === 'string' ? value.containerSvg.trim() : '';

    next[key] = {
      ...value,
      fontSize: Math.max(fontSize, minimum),
      fontWeight: getReadableFontWeight(value.fontWeight, key, options.primaryFieldKey, backgroundComplexity),
      color: getReadableTextColor(value.color, backgroundComplexity),
      lineHeight: typeof value.lineHeight === 'number' ? Math.max(value.lineHeight, 1.12) : 1.18,
      containerSvg: needsOverlay && containerSvg.length === 0 ? buildHumanReadableWashSvg() : containerSvg,
    };
  });

  return next;
}

function getReadableMinimumFontSize(key: string, primaryFieldKey: string): number {
  if (key === primaryFieldKey) return 8.8;
  if (key === 'phrase') return 8;
  if (key === 'instruction') return 8.8;
  if (key === 'answer') return 6.4;
  if (key === 'when_to_use') return 6.2;
  if (key === 'fun_fact') return 5.8;
  return 5.5;
}

function getReadableFontWeight(
  value: unknown,
  key: string,
  primaryFieldKey: string,
  backgroundComplexity: string,
): string {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : value === 'bold'
        ? 700
        : value === 'regular'
          ? 500
          : value === 'thin'
            ? 300
            : 0;
  const minimum = key === primaryFieldKey || key === 'instruction' || key === 'phrase'
    ? (backgroundComplexity === 'high' ? 750 : 700)
    : (backgroundComplexity === 'high' ? 650 : 600);
  return String(Math.max(numeric || minimum, minimum));
}

function getReadableTextColor(value: unknown, backgroundComplexity: string): string {
  if (typeof value !== 'string' || backgroundComplexity !== 'high') return typeof value === 'string' ? value : '#111827';
  const normalized = value.trim().toLowerCase();
  const midBlueOrPurple = /^#([2-7][0-9a-f])([2-7][0-9a-f])([7-9a-f][0-9a-f])$/i.test(normalized);
  const gray = /^#([5-9a-b][0-9a-f])\1\1$/i.test(normalized);
  return midBlueOrPurple || gray ? '#111827' : value;
}

// Local CMS plugin: only available during dev, allows saving edits to JSON cards
export function localDeckCmsPlugin(): Plugin {
  return {
    name: 'local-deck-cms',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: DevRequest, res: DevResponse, next: DevNext) => {
        if (
          req.method === 'GET' &&
          req.url?.split('?')[0] === '/.well-known/appspecific/com.chrome.devtools.json'
        ) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({}));
          return;
        }

        // ── Delete edition ──────────────────────────────────
        if (req.url?.startsWith('/__cms__/delete-edition/') && req.method === 'DELETE') {
          try {
            const slug = req.url.split('/').pop()?.split('?')[0];
            if (!slug) throw new Error('Edition slug required');

            const jsonPath = path.resolve(CONTENT_DIR, `${slug}.json`);
            
            // Delete the JSON file
            await fs.unlink(jsonPath);
            
            // Optionally, delete the associated assets folder if it exists
            const assetsPath = path.resolve(ASSETS_DIR, slug);
            try {
              await fs.rm(assetsPath, { recursive: true, force: true });
            } catch {
              // Ignore if assets folder doesn't exist
            }

            console.log(`✅ [Admin] Deleted edition: ${slug}`);
            triggerDeckSync();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (err: unknown) {
            console.error('[delete-edition]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Regenerate runtime deck registry ────────────────
        if (req.url === '/__cms__/sync-decks' && req.method === 'POST') {
          try {
            await runDeckSync();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (err: unknown) {
            console.error('[sync-decks]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Save card or edition-level edits ─────────────────
        if (req.url === '/__cms__/save-edition' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { deckId, cardId, updates } = JSON.parse(body);
            const jsonPath = path.resolve(CONTENT_DIR, `${deckId}.json`);

            const content = await fs.readFile(jsonPath, 'utf-8');
            const deck = JSON.parse(content) as RawDeckContent;

            if (!updates || typeof updates !== 'object') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'No updates provided' }));
              return;
            }

            const isCardUpdate = typeof cardId === 'string' && cardId.length > 0;
            const cardIndex = isCardUpdate ? deck.cards.findIndex((card) => card.id === cardId) : -1;
            if (isCardUpdate && cardIndex !== -1) {
              deck.cards[cardIndex] = {
                ...deck.cards[cardIndex],
                ...updates,
                front: { ...deck.cards[cardIndex].front, ...updates.front },
                back: { ...deck.cards[cardIndex].back, ...updates.back },
              };
              await fs.writeFile(jsonPath, JSON.stringify(deck, null, 2), 'utf-8');
              
              // Sync to DB
              const syncResult = await saveEditionToSupabase(deck);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...syncResult }));
            } else if (!isCardUpdate) {
              const allowedEditionFields = [
                'name',
                'description',
                'metadata',
                'pricing',
                'digital',
                'landing_config',
                'print_specs_overrides',
                'design_template_overrides',
              ];
              const editionUpdates = Object.fromEntries(
                Object.entries(updates).filter(([key]) => allowedEditionFields.includes(key))
              );

              if (Object.keys(editionUpdates).length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'No supported edition fields provided' }));
                return;
              }

              const editionDigitalUpdate = (editionUpdates as { digital?: Record<string, unknown> }).digital;
              const candidateDeck = {
                ...deck,
                ...editionUpdates,
              };

              if (deck.digital || editionDigitalUpdate) {
                candidateDeck.digital = {
                  ...(deck.digital || {}),
                  ...(editionDigitalUpdate || {}),
                };
              }

              if (candidateDeck.digital?.is_published === true) {
                const readiness = getDeckPublicationReadiness(
                  candidateDeck as unknown as Parameters<typeof getDeckPublicationReadiness>[0],
                );
                if (!readiness.isPublishable) {
                  res.statusCode = 409;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: `No se puede activar la landing: ${readiness.blockers.map(blocker => `${blocker.label} (${blocker.detail})`).join('; ')}`,
                    blockers: readiness.blockers,
                  }));
                  return;
                }
              }

              Object.assign(deck, candidateDeck);
              await fs.writeFile(jsonPath, JSON.stringify(deck, null, 2), 'utf-8');

              const syncResult = await saveEditionToSupabase(deck);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, ...syncResult }));
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Card not found' }));
            }
          } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
          }
          return;
        }


        // ── Generate art (single or batch) ───────────────────
        if (req.url === '/__cms__/generate-art' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }

          try {
            const body = await readBody(req);
            const { deckId, cardId, force } = JSON.parse(body);
            // cardId: string → single card | undefined → batch all missing (or all if force=true)

            const jsonPath = path.resolve(CONTENT_DIR, `${deckId}.json`);
            const deck = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as RawDeckContent & Partial<Pick<DeckSchema, 'print_specs'>>;
            const slug = deck.slug || deckId;

            if (cardId) {
              // ── Single card ──
              if (force) {
                const card = deck.cards.find((candidate) => candidate.id === cardId);
                if (card) card.front.art_url = undefined; // clear so it regenerates
              }
              const result = await generateCardArt(deck, cardId, slug, apiKey);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else {
              // ── Batch ──
              const targets = deck.cards.filter((candidate) => force || !candidate.front.art_url);
              const results: Array<Record<string, unknown>> = [];

              for (const card of targets) {
                if (force) card.front.art_url = undefined;
                try {
                  const r = await generateCardArt(deck, card.id, slug, apiKey);
                  results.push({ id: card.id, ...r });
                } catch (e: unknown) {
                  results.push({ id: card.id, success: false, error: getErrorMessage(e) });
                }
                // Rate limit
                await new Promise(r => setTimeout(r, 2500));
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, results }));
            }
          } catch (err: unknown) {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Enrich seed items via OMDB ─────────────────────
        if (req.url === '/__cms__/enrich' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { seedItems, enrichmentType } = JSON.parse(body);

            if (!seedItems || !Array.isArray(seedItems) || seedItems.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'seedItems array is required' }));
              return;
            }

            let enriched: unknown[] = [];

            if (enrichmentType === 'movie') {
              const tmdbKey = process.env.TMDB_API_KEY;
              if (!tmdbKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'TMDB_API_KEY not set in root .env' }));
                return;
              }
              enriched = await enrichMovieData(seedItems, tmdbKey);
            } else {
              // For non-movie types, return raw items as-is
              enriched = seedItems.map((title: string) => ({ title }));
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: enriched }));
          } catch (err: unknown) {
            console.error('[enrich]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Preview assembled prompt ──────────────────────
        if (req.url === '/__cms__/preview-prompt' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const params = JSON.parse(body);

            const { buildDeckPrompt, BARAJA_SYSTEM_PROMPT } = await import(
              path.resolve(DECK_ENGINE_DIR, 'src/generator/prompts.ts') + '?t=' + Date.now()
            );

            const prompt = buildDeckPrompt({
              topic: params.topic,
              cardCount: params.cardCount || 30,
              deckType: params.deckType || 'custom',
              difficulty: params.difficulty,
              artStyle: params.artStyle,
              additionalContext: params.additionalContext,
              enrichedData: params.enrichedData,
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              systemPrompt: BARAJA_SYSTEM_PROMPT.trim(),
              userPrompt: prompt,
              estimatedTokens: Math.ceil((BARAJA_SYSTEM_PROMPT.length + prompt.length) / 4),
            }));
          } catch (err: unknown) {
            console.error('[preview-prompt]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Generate full edition via AI ─────────────────────
        if (req.url === '/__cms__/generate-edition' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }

          try {
            const body = await readBody(req);
            const {
              topic,
              cardCount,
              additionalContext,
              deckType,
              difficulty,
              artStyle,
              enrichedData,
              digitalDraft,
            } = JSON.parse(body);

            if (!topic) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Topic is required' }));
              return;
            }

            console.log(`\n🃏 [Admin] Generating edition: "${topic}" (${cardCount} cards, type=${deckType || 'custom'})`);

            // Setup SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            if (res.flushHeaders) res.flushHeaders();

            const sendEvent = (eventData: unknown) => {
              res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            };

            sendEvent({ type: 'progress', message: 'Initializing Gemini 2.5 Pro...' });

            // Dynamic import to avoid bundling issues
            const { GoogleGenAI } = await import('@google/genai');
            const { BARAJA_SYSTEM_PROMPT, buildDeckPrompt } = await import(
              path.resolve(DECK_ENGINE_DIR, 'src/generator/prompts.ts') + '?t=' + Date.now()
            );

            const ai = new GoogleGenAI({ apiKey });

            sendEvent({ type: 'progress', message: 'Building contextual prompt...' });

            // Build the enriched prompt
            const userPrompt = buildDeckPrompt({
              topic: topic.trim(),
              cardCount: cardCount || 30,
              deckType: deckType || 'custom',
              difficulty,
              artStyle,
              additionalContext: additionalContext?.trim(),
              enrichedData,
            });

            const estTokens = Math.ceil(userPrompt.length / 4);
            console.log(`📝 Prompt assembled (${estTokens} est. tokens)`);
            sendEvent({ type: 'progress', message: `Prompt assembled (~${estTokens} tokens). Generating structured JSON (this might take 30-45s)...` });

            const aiSchema = {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const },
                description: { type: 'string' as const },
                language: { type: 'string' as const },
                card_count: { type: 'integer' as const },
                metadata: {
                  type: 'object' as const,
                  properties: {
                    topic: { type: 'string' as const },
                    tone: { type: 'string' as const },
                    target_audience: { type: 'string' as const },
                    player_count: { type: 'string' as const },
                  },
                  required: ['topic', 'tone', 'target_audience', 'player_count'],
                },
                cards: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      id: { type: 'string' as const },
                      front: {
                        type: 'object' as const,
                        properties: {
                          title: { type: 'string' as const },
                          number: { type: 'integer' as const },
                          art_prompt: { type: 'string' as const },
                        },
                        required: ['title', 'number', 'art_prompt'],
                      },
                      back: {
                        type: 'object' as const,
                        properties: {
                          phrase: { type: 'string' as const },
                          when_to_use: { type: 'string' as const },
                          instruction: { type: 'string' as const },
                          answer: { type: 'string' as const },
                          fun_fact: { type: 'string' as const },
                        },
                        required: ['phrase', 'when_to_use', 'instruction'],
                      },
                      tags: {
                        type: 'array' as const,
                        items: { type: 'string' as const },
                      },
                    },
                    required: ['id', 'front', 'back', 'tags'],
                  },
                },
              },
              required: ['name', 'description', 'language', 'card_count', 'metadata', 'cards'],
            };

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-pro',
              contents: userPrompt,
              config: {
                systemInstruction: BARAJA_SYSTEM_PROMPT,
                temperature: 0.7,
                responseMimeType: 'application/json',
                responseSchema: aiSchema as never,
              },
            });

            let rawJson = response.text;
            if (!rawJson) {
              sendEvent({ type: 'error', message: 'No text returned from Gemini' });
              return res.end();
            }

            // Strip markdown if present
            rawJson = rawJson.replace(/^```json/mi, '').replace(/```$/m, '').trim();

            const parsed = JSON.parse(rawJson);
            sendEvent({ type: 'progress', message: `✅ Generation complete: ${parsed.cards.length} cards drafted` });

            // --- CRITIC PHASE ---
            if (deckType === 'trivia' && enrichedData && enrichedData.length > 0) {
              console.log(`\n🕵️‍♂️ [Critic] Validating facts against Source of Truth...`);
              sendEvent({ type: 'progress', message: '🕵️‍♂️ [Critic] Validating facts against Source of Truth... (this might take 15-20s)' });
              
              try {
                const { BARAJA_CRITIC_SYSTEM_PROMPT, buildCriticPrompt } = await import(
                  path.resolve(DECK_ENGINE_DIR, 'src/generator/prompts.ts') + '?t=' + Date.now()
                );
                
                const criticPrompt = buildCriticPrompt(parsed.cards, enrichedData);
                
                const criticResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-pro',
                  contents: criticPrompt,
                  config: {
                    systemInstruction: BARAJA_CRITIC_SYSTEM_PROMPT,
                    temperature: 0.2, 
                    responseMimeType: 'application/json',
                  },
                });

                let criticRawJson = criticResponse.text;
                if (criticRawJson) {
                   criticRawJson = criticRawJson.replace(/^```json/mi, '').replace(/```$/m, '').trim();
                   const correctedCards = JSON.parse(criticRawJson);
                   if (Array.isArray(correctedCards) && correctedCards.length === parsed.cards.length) {
                     parsed.cards = correctedCards;
                     console.log(`✅ [Critic] Cards validated and corrected.`);
                     sendEvent({ type: 'progress', message: '✅ [Critic] Validation passed. Factual corrections applied.' });
                   } else {
                     console.log(`⚠️ [Critic] Returned array length mismatch, using draft.`);
                     sendEvent({ type: 'progress', message: '⚠️ [Critic] Unable to validate structure, using original draft.' });
                   }
                }
              } catch (criticErr: unknown) {
                console.error(`⚠️ [Critic] Validation failed, falling back to draft: ${getErrorMessage(criticErr)}`);
                sendEvent({ type: 'progress', message: `⚠️ [Critic] Validation skipped due to error: ${getErrorMessage(criticErr)}` });
              }
            }
            // --- END CRITIC PHASE ---

            sendEvent({ type: 'progress', message: 'Saving deck to content directory...' });

            // Build slug and save
            const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const finalId = `${slug}-v1`;

            const digitalConfig = buildDraftDigitalConfig(digitalDraft, parsed.cards, deckType);

            const rawDeckContent: RawDeckContent = {
              id: finalId,
              edition: slug,
              name: parsed.name,
              slug,
              description: parsed.description,
              language: parsed.language === 'en' ? 'en' : 'es',
              card_count: parsed.cards.length,
              metadata: parsed.metadata,
              print_spec_id: 'baraja-standard',
              design_template_id: 'dark-minimal-01',
              pricing: { amount: 1500000, currency: 'ars' },
              digital: digitalConfig,
              cards: parsed.cards,
            };

            // 1. Save JSON to disk (local backup & decks.ts source)
            const outputPath = path.resolve(CONTENT_DIR, `${slug}.json`);
            await fs.writeFile(outputPath, JSON.stringify(rawDeckContent, null, 2), 'utf-8');
            sendEvent({ type: 'progress', message: '💾 JSON backup saved to disk' });
            if (digitalConfig.catalog) {
              sendEvent({
                type: 'progress',
                message: `🧭 Catalog draft: ${digitalConfig.catalog.collection} > ${digitalConfig.catalog.category}`,
              });
            }

            // 2. Persist directly to Supabase (source of truth for Admin UI)
            sendEvent({ type: 'progress', message: '🌱 Saving to database...' });
            const syncResult = await saveEditionToSupabase(rawDeckContent);

            // 3. Regenerate decks.ts for runtime client
            sendEvent({ type: 'progress', message: '🔄 Syncing runtime deck registry...' });
            await runDeckSync();

            console.log(`✅ Edition saved: ${slug} (${parsed.cards.length} cards) → DB + disk`);
            sendEvent({
              type: 'progress',
              message: syncResult.warnings.length > 0
                ? `⚠️ Edition saved with warnings: ${syncResult.warnings.join(' ')}`
                : '✅ Edition saved and synced successfully'
            });

            sendEvent({
              type: 'done',
              data: {
                success: true,
                slug,
                name: parsed.name,
                card_count: parsed.cards.length,
              }
            });
            res.end();
            return;
          } catch (err: unknown) {
            console.error('[generate-edition]', err);
            // If headers were already sent we can't send a 500, so we send an error event
            if (res.headersSent) {
              res.write(`data: ${JSON.stringify({ type: 'error', message: getErrorMessage(err) })}\n\n`);
              res.end();
            } else {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
            }
            return;
          }
        }

        // ── Generate frame via Gemini ────────────────────────
        if (req.url === '/__cms__/generate-frame' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }

          try {
            const body = await readBody(req);
            const { prompt, artDirectorPrompt, structuralConstraints, face, widthMm, heightMm, cardContent, edition, refinement, customVisualPrompt, customConstraints, layout, cardType, hiddenFields, contentProfile } = JSON.parse(body);

            if (!face) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'face is required' }));
              return;
            }

            // ── STEP 1: Flash Art Director (generates visual prompt dynamically) ──
            let visualPrompt = '';
            
            // If the user provided a custom visual prompt override, bypass Flash entirely
            if (customVisualPrompt) {
              console.log(`\n🎨 [Art Director] Bypassing Flash: User provided manual Image prompt...`);
              visualPrompt = customVisualPrompt;
            } else if (artDirectorPrompt) {
              console.log(`\n🎨 [Art Director] Asking Flash to generate visual prompt...`);
              try {
                const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const flashRes = await fetch(flashUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: artDirectorPrompt }] }],
                    generationConfig: { temperature: 1.0, maxOutputTokens: 400 },
                  }),
                });
                if (flashRes.ok) {
                  const flashData = await flashRes.json() as GeminiTextResponse;
                  visualPrompt = flashData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                  console.log(`🎨 [Art Director] Visual prompt:\n${visualPrompt}`);
                }
              } catch (artErr) {
                console.warn('[Art Director] Flash call failed, falling back to legacy prompt:', artErr);
              }
            }
            
            // Fallback: if Flash failed or wasn't available, use the legacy prompt
            let activePrompt = visualPrompt || prompt || '';

            // ── PROMPT REFINER (Conversational iteration) ──────────────────────
            if (refinement) {
              console.log(`\n💬 [Frame Refiner] The user requested a tweak: "${refinement}"`);
              const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
              
              const rewritePrompt = [
                `You are an expert prompt engineer for an image generation model.`,
                `I have an existing aesthetic prompt for a playing card frame design:`,
                `---`,
                `${prompt}`,
                `---`,
                `The user wants to make this specific change to the design: "${refinement}"`,
                `Please rewrite the prompt to incorporate the user's request. Keep the overall artistic style and details intact, just modify or add the parts requested by the user.`,
                `IMPORTANT: Return ONLY the raw rewritten prompt text. No markdown formatting, no conversational filler, no quotation marks. Do not include structure rules (like "no text"), just the aesthetic description.`
              ].join('\n');

              try {
                const rewriteRes = await fetch(flashUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ instances: [{ contents: [{ role: 'user', parts: [{ text: rewritePrompt }] }] }] })
                });
                
                if (rewriteRes.ok) {
                  const rewriteData = await rewriteRes.json() as GeminiTextResponse;
                  const rawNewPrompt = rewriteData.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (rawNewPrompt) {
                    activePrompt = rawNewPrompt.trim();
                    console.log(`✨ [Frame Refiner] Rewritten prompt:\n${activePrompt}`);
                  }
                }
              } catch (err) {
                console.warn('[Frame Refiner] Failed to rewrite prompt, using original.', err);
              }
            }

            const w = widthMm || 70;
            const h = heightMm || 120;

            // ── FRAME IMAGE PROMPT ────────────────────────────────────────
            // activePrompt: visual direction from Flash Art Director
            // activeConstraints: layout + forbidden rules (rebuilt dynamically if layout provided)

            // If the client sent layout + cardType, rebuild structural constraints server-side
            // so they always reflect the actual configuration (not stale client-built strings)
            let derivedConstraints = structuralConstraints || '';
            if (layout && typeof layout === 'object') {
              try {
                const { buildStructuralConstraints: buildSC } = await import(
                  path.resolve(DECK_ENGINE_DIR, 'src/generator/template-prompts.ts') + '?t=' + Date.now()
                );
                
                let dynamicFields: string[] = [];
                if (cardContent && typeof cardContent === 'object') {
                  dynamicFields = Object.keys(cardContent).filter(k => 
                    !['back_image_url', 'back_image_versions', 'qr_url'].includes(k) &&
                    !isHiddenDynamicField(hiddenFields, k) &&
                    typeof cardContent[k] === 'string' &&
                    !!cardContent[k]
                  );
                }
                
                derivedConstraints = buildSC({ themeDescription: '', layout, cardType: cardType || 'custom', face, dynamicFields });
                console.log(`🗂️  [Frame Generator] Rebuilt dynamic constraints (cardType: ${cardType || 'custom'}, fields: ${dynamicFields.length})`);
              } catch (scErr) {
                console.warn('[Frame Generator] Could not rebuild constraints, using client-sent version:', scErr);
              }
            }

            const activeConstraints = customConstraints !== undefined ? customConstraints : derivedConstraints;
            
            // Assemble: Flash visual prompt + structural constraints
            const contentProfilePrompt = describeContentProfileForPrompt(contentProfile);
            const editableBackgroundContract = [
              'EDITABLE BACKGROUND CONTRACT:',
              'Generate a clean visual background/frame only. Do NOT render card copy, questions, answers, instructions, labels, placeholder text, brand names, card numbers, QR codes, or pseudo-letters into the bitmap.',
              'Leave calm empty visual zones where the app can overlay editable text and QR layers later.',
              contentProfilePrompt
                ? `VISIBLE CONTENT DENSITY:\n${contentProfilePrompt}\nUse this density profile to reserve larger calm zones for long fields and smaller calm zones for short support fields.`
                : '',
              'Non-textual borders, ornaments, gradients, textures, and empty safe areas are allowed.',
              'Do not draw fake text boxes, blank labels, opaque rectangular bands, or placeholder containers into the bitmap.',
            ].join('\n');

            const fullPrompt = [
              activePrompt,
              activeConstraints,
              editableBackgroundContract,
            ].filter(Boolean).join('\n\n');

            console.log(`\n🖼️  [Frame Generator] Generating ${face} frame ${w}×${h}mm...`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
            const cardRatio = w / h;
            let finalRatio: string;
            if (cardRatio >= 1) {
              finalRatio = cardRatio > 1.33 ? '16:9' : '4:3';
            } else {
              finalRatio = cardRatio < 0.65 ? '9:16' : '3:4';
            }
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt: fullPrompt }],
                parameters: {
                  sampleCount: 1,
                  aspectRatio: finalRatio,
                  outputOptions: { mimeType: 'image/png' },
                },
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Gemini Image API ${response.status}: ${errText.slice(0, 300)}`);
            }

            const data = await response.json() as ImagenPredictResponse;
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
              throw new Error('Imagen 4 no devolvió una imagen. Intentá de nuevo.');
            }

            const mimeType = 'image/png';
            const sizeKB = Math.round(base64Data.length * 0.75 / 1024);

            console.log(`\u2705 Frame generated: ${mimeType} (${sizeKB}KB)`);

            if (face === 'back') {
              const noTextValidation = await validateNoTextImage(apiKey, base64Data, 'background');
              if (noTextValidation.containsText) {
                res.statusCode = 422;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: `El fondo generado parece incluir texto o marcas tipograficas (${noTextValidation.reason || 'sin detalle'}). Reintentá con un fondo limpio sin texto.`,
                  validation: noTextValidation,
                }));
                return;
              }
            }

            // ── MULTIMODAL TYPOGRAPHY & LAYOUT ENGINE (Gemini Vision) ────────────────────
            // Now that we have the generated image, we use Vision to analyze the safe margins
            let typographySuggestion: TypographyHints | null = null;
            if (cardContent && typeof cardContent === 'object') {
              const deckLabel = edition?.label || 'Custom';
              const fieldDescriptions = (edition?.fields as Array<{label: string; description: string; typicalLength: string}> | undefined)
                ?.map(f => `  - ${f.label} (${f.typicalLength} text): ${f.description}`)
                .join('\n') || '';
              const instructionFirstCopy = shouldPrioritizeInstructionCopy(cardType, edition?.id);
              const primaryFieldName = instructionFirstCopy ? 'instruction' : 'phrase';
              const copyHierarchyNote = buildCopyHierarchyNote(instructionFirstCopy);

              // Extract valid text fields to process
              const textKeys: string[] = [];
              const sampleTextLines: string[] = [];
              
              for (const key of Object.keys(cardContent || {})) {
                 if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) continue;
                 if (isHiddenDynamicField(hiddenFields, key)) continue;
                 const val = cardContent[key];
                 if (typeof val === 'string' && val.trim().length > 0) {
                    textKeys.push(key);
                    sampleTextLines.push(`  ${key.toUpperCase()}: "${val}"`);
                 }
              }

              const typographyPromptText = [
                `You are a professional card game typographer and spatial layout engine. Analyze the PROVIDED RENDERED CARD BACKGROUND alongside this text content.`,
                `The card image is exactly ${w}mm x ${h}mm in ratio.`,
                ``,
                `DECK EDITION: "${deckLabel}"`,
                `CARD CONTENT STRUCTURE:`,
                fieldDescriptions,
                ...copyHierarchyNote,
                `DYNAMIC TEXT CONTENT TO FIT:`,
                ...sampleTextLines,
                '',
                `CRITICAL LAYOUT TASK:`,
                `Look at the provided image. Detect the thick ornate borders, ribbons, and decorative graphics on the edges and corners.`,
                `Find the innermost "clean" safe areas for text to avoid overlapping the borders.`,
                `For EACH of the text blocks listed above, define EXACT spatial bounding boxes (topPct, heightPct, leftPct, widthPct).`,
                `These are percentages (0 to 100).`,
                `For example, if the generated image has a 15% thick visual border on all sides, the text MUST have leftPct: 15, widthPct: 70.`,
                `CRITICAL: Adjust these boxes to perfectly match the empty spaces in the provided image! Vary the layout if the image has content on one side!`,
                `Space them apart logically depending on the content length and hierarchy.`,
                `CRITICAL CONTRAST & COLOR METADATA EXTRACTION:`,
                `1. You MUST analyze the average color of the background EXACTLY within the bounding box you defined for each text block.`,
                `2. Pick a text color that provides MAXIMUM contrast (AAA Accessibility) against that specific zone.`,
                `3. DO NOT just use plain black '#0a0a0a' or white '#ffffff'. Be creative! Extract a deeply saturated dark tone from the image's shadows for bright backgrounds. Extract a bright tint from the image's highlights for dark backgrounds.`,
                `4. ENSURE the color hex accurately matches the aesthetic atmosphere of the illustration!`,
                '',
                `FONT WEIGHT RULES:`,
                `For each text zone pick a fontWeight that creates VISUAL CONTRAST between zones. Mix aggressively:`,
                `  - Use '300' or 'thin' for secondary labels / headers that should feel delicate`,
                `  - Use 'bold' or '700' for the primary "${primaryFieldName}" field when the image is energetic/bold`,
                `  - Use '900' for a single dramatic zone if the illustration calls for heavy impact`,
                `  - Think like a magazine designer: hierarchy through weight, not just size`,
                '',
                `TYPOGRAPHY & BRANDING:`,
                `Select a font pairing that MATCHES the visual theme of the image. DO NOT just use "Inter" and "Cormorant Garamond" every time.`,
                `AVAILABLE GOOGLE FONTS (use exact names from this list):`,
                `  Serif (elegant, classic): "Cormorant Garamond", "Playfair Display", "Lora", "DM Serif Display", "EB Garamond"`,
                `  Sans-serif (clean, modern): "Inter", "DM Sans", "Outfit", "Plus Jakarta Sans", "Montserrat", "Space Grotesk"`,
                `  Display (impactful): "Bebas Neue", "Oswald", "Syne", "Cinzel"`,
                `Font sizes MUST be in points (pt), typically 8pt to 28pt.`,
                '',
                `FOCAL POINTS DETECTION:`,
                `Scan the image for the 1-4 largest, most visually prominent elements (e.g. "Large crescent moon", "Diagonal pink stripe", "Cluster of speech bubbles in center").`,
                `For each element report: description (short label), xPct (horizontal center as 0-100% of width), yPct (vertical center as 0-100% of height), sizePct (approximate radius as % of image height, e.g. 20 means the element spans ~20% of the card height).`,
                '',
                ...buildReadabilityOverlayPrompt(primaryFieldName),
                '',
                `Return ONLY a valid JSON object map that mirrors the keys of the dynamic text content provided. Example structure:`,
                `{"quote":{"fontSize":20,"fontFamily":"Playfair Display","fontWeight":"bold","lineHeight":1.15,"color":"#ecdba5","topPct":20,"heightPct":40,"leftPct":15,"widthPct":70,"containerSvg":"<defs><linearGradient id=\\"softWash\\" x1=\\"0%\\" y1=\\"0%\\" x2=\\"100%\\" y2=\\"100%\\"><stop offset=\\"0%\\" stop-color=\\"rgba(0,0,0,0.08)\\"/><stop offset=\\"100%\\" stop-color=\\"rgba(0,0,0,0.26)\\"/></linearGradient></defs><path d=\\"M4 8 C18 0 82 0 96 8 L100 86 C82 100 18 100 0 86 Z\\" fill=\\"url(#softWash)\\"/>"},"description":{"fontSize":11,"fontFamily":"Lora","fontWeight":"regular","lineHeight":1.35,"color":"#fdfbf7","topPct":62,"heightPct":20,"leftPct":15,"widthPct":70,"containerSvg":""},"brand":{"color":"#fdfbf7"},"qrFgColor":"#fdfbf7","qrSizeMm":12,"focalPoints":[{"description":"Large crescent moon","xPct":70,"yPct":25,"sizePct":22}]}`
              ].filter(Boolean).join('\n');

              try {
                console.log(`\n👁️  [Vision Engine] Analyzing boundaries and computing typography...`);
                const geminiVisionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const textRes = await fetch(geminiVisionUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ 
                        parts: [
                            { text: typographyPromptText },
                            { inlineData: { mimeType: 'image/png', data: base64Data } }
                        ] 
                    }],
                    generationConfig: { 
                      temperature: 0.1, 
                      maxOutputTokens: 4096,
                      responseMimeType: 'application/json',
                      responseSchema: {
                        type: 'OBJECT',
                        properties: {
                          ...textKeys.reduce((acc, key) => {
                            acc[key] = {
                              type: 'OBJECT',
                              properties: {
                                fontSize: { type: 'NUMBER' },
                                fontFamily: { type: 'STRING' },
                                fontWeight: { type: 'STRING' },
                                lineHeight: { type: 'NUMBER' },
                                letterSpacing: { type: 'NUMBER' },
                                color: { type: 'STRING' },
                                readabilityScore: { type: 'NUMBER' },
                                backgroundComplexity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
                                needsOverlay: { type: 'BOOLEAN' },
                                topPct: { type: 'NUMBER' },
                                heightPct: { type: 'NUMBER' },
                                leftPct: { type: 'NUMBER' },
                                widthPct: { type: 'NUMBER' },
                                containerSvg: { type: 'STRING', description: 'Valid SVG string without enclosing <svg> tag that dynamically scales (width="100%" height="100%"). Background vectors/ribbons/boxes.' }
                              },
                              required: ['topPct', 'heightPct', 'leftPct', 'widthPct', 'containerSvg', 'fontSize', 'fontFamily', 'fontWeight', 'color']
                            };
                            return acc;
                          }, {} as Record<string, unknown>),
                          brand: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
                          qrFgColor: { type: 'STRING' },
                          qrSizeMm: { type: 'NUMBER' },
                          focalPoints: {
                            type: 'ARRAY',
                            items: {
                              type: 'OBJECT',
                              properties: {
                                description: { type: 'STRING' },
                                xPct: { type: 'NUMBER' },
                                yPct: { type: 'NUMBER' },
                                sizePct: { type: 'NUMBER' }
                              },
                              required: ['description', 'xPct', 'yPct', 'sizePct']
                            }
                          }
                        },
                        required: [...textKeys]
                      }
                    },
                  }),
                });
                if (textRes.ok) {
                  const textData = await textRes.json() as GeminiTextResponse;
                  const rawText: string = textData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();
                  typographySuggestion = JSON.parse(jsonStr);
                  typographySuggestion = fitTypographyHintsToContent(typographySuggestion, {
                    cardHeightMm: h,
                    cardWidthMm: w,
                    content: cardContent,
                    primaryFieldKey: primaryFieldName,
                  }) as Record<string, unknown>;
                  typographySuggestion = enforceHumanReadableTypography(typographySuggestion, {
                    content: cardContent,
                    primaryFieldKey: primaryFieldName,
                  });
                  
                  // Resolve TTF
                  const fontFamilies = new Set<string>();
                  collectFontFamilies(typographySuggestion).forEach((family) => fontFamilies.add(family));
                  
                  const resolved: Record<string, string> = {};
                  for (const family of fontFamilies) {
                    const slug = family.toLowerCase().replace(/\s+/g, '-');
                    try {
                      const fRes = await fetch(`https://gwfh.mranftl.com/api/fonts/${slug}`);
                      if (fRes.ok) {
                        const fData = await fRes.json() as FontMetadataResponse;
                        const regular = fData.variants?.find((variant) => variant.id === 'regular' || variant.id === '400') || fData.variants?.[0];
                        if (regular && regular.ttf) {
                          resolved[family] = regular.ttf;
                        }
                      }
                    } catch {
                      console.warn(`Could not resolve TTF for ${family}`);
                    }
                  }
                  
                  typographySuggestion!.ttfUrls = resolved;
                  console.log('📝 Multimodal Layout Engine resolved:', JSON.stringify(typographySuggestion, null, 2));
                }
              } catch (typErr) {
                console.warn('[generate-frame] Typography suggestion failed (non-blocking):', typErr);
              }
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              dataUrl: `data:${mimeType};base64,${base64Data}`,
              typography: typographySuggestion,
              rewrittenPrompt: refinement ? activePrompt : undefined
            }));
          } catch (err: unknown) {
            console.error('[generate-frame]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        if (req.url === '/__cms__/analyze-typography' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { dataUrl, w, h, edition, cardContent, cardType, remixInstruction, hiddenFields } = JSON.parse(body);
            
            if (!dataUrl) throw new Error('No image provided');
            
            let base64Data = '';
            if (dataUrl.startsWith('data:image')) {
               base64Data = dataUrl.split(',')[1] || dataUrl;
            } else if (dataUrl.startsWith('/')) {
               // Load from local file system if it is a local asset (e.g., from Library)
               const fs = await import('fs/promises');
               const filePath = path.resolve(BARAJA_PUBLIC_DIR, dataUrl.replace(/^\//, ''));
               const fileBuffer = await fs.readFile(filePath);
               base64Data = fileBuffer.toString('base64');
             } else if (dataUrl.startsWith('blob:')) {
               throw new Error('Received a blob: URL which is not readable server-side. The client must send the original data: URI instead.');
             } else {
               throw new Error('Unsupported image format for Vision analysis: must be a data URI or an absolute local path (/...)');
            }

            const apiKey = getBarajaGeminiApiKey();
            if (!apiKey) throw new Error(MISSING_GEMINI_API_KEY_ERROR);


            const deckLabel = edition?.label || 'Custom';
            const fieldDescriptions = (edition?.fields as Array<EditionFieldDescription> | undefined)
              ?.map(f => `  - ${f.label} (${f.typicalLength} text): ${f.description}`)
              .join('\n') || '';
            const instructionFirstCopy = shouldPrioritizeInstructionCopy(cardType, edition?.id);
            const primaryFieldName = instructionFirstCopy ? 'instruction' : 'phrase';
            const copyHierarchyNote = buildCopyHierarchyNote(instructionFirstCopy);

            // Extract valid text fields to process
            const textKeys: string[] = [];
            const sampleTextLines: string[] = [];
            
            for (const key of Object.keys(cardContent || {})) {
               if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) continue;
               
               // Respect user UI visibility toggles! If they hid it in AdminTemplates, tell AI to skip it
               if (isHiddenDynamicField(hiddenFields, key)) continue;
               
               const val = cardContent[key];
               if (typeof val === 'string' && val.trim().length > 0) {
                  textKeys.push(key);
                  sampleTextLines.push(`  ${key.toUpperCase()}: "${val}"`);
               }
            }

            const typographyPromptText = [
                `You are a professional card game typographer and spatial layout engine. Analyze the PROVIDED RENDERED CARD BACKGROUND alongside this text content.`,
                `The card image is exactly ${w}mm x ${h}mm in ratio.`,
                ``,
                `DECK EDITION: "${deckLabel}"`,
                `CARD CONTENT STRUCTURE:`,
                fieldDescriptions,
                ...copyHierarchyNote,
                `DYNAMIC TEXT CONTENT TO FIT:`,
                ...sampleTextLines,
                '',
                remixInstruction ? `USER REMIX DIRECTIVE: ${remixInstruction}` : '',
                '',
                `CRITICAL LAYOUT TASK:`,
                `Look at the provided image. Detect the thick ornate borders, ribbons, and decorative graphics on the edges and corners.`,
                `Find the innermost "clean" safe areas for text to avoid overlapping the borders.`,
                `For EACH of the text blocks listed above, define EXACT spatial bounding boxes (topPct, heightPct, leftPct, widthPct).`,
                `These are percentages (0 to 100).`,
                `For example, if the generated image has a 15% thick visual border on all sides, the text MUST have leftPct: 15, widthPct: 70.`,
                `CRITICAL: Adjust these boxes to perfectly match the empty spaces in the provided image! Vary the layout if the image has content on one side!`,
                `Space them apart logically depending on the content length and hierarchy.`,
                `CRITICAL CONTRAST & COLOR METADATA EXTRACTION:`,
                `1. You MUST analyze the average color of the background EXACTLY within the bounding box you defined for each text block.`,
                `2. Pick a text color that provides MAXIMUM contrast (AAA Accessibility) against that specific zone.`,
                `3. DO NOT just use plain black '#0a0a0a' or white '#ffffff'. Be creative! Extract a deeply saturated dark tone from the image's shadows for bright backgrounds. Extract a bright tint from the image's highlights for dark backgrounds.`,
                `4. ENSURE the color hex accurately matches the aesthetic atmosphere of the illustration!`,
                '',
                `FONT WEIGHT RULES:`,
                `For each text zone pick a fontWeight that creates VISUAL CONTRAST between zones. Mix aggressively:`,
                `  - Use '300' or 'thin' for secondary labels / headers that should feel delicate`,
                `  - Use 'bold' or '700' for the primary "${primaryFieldName}" field when the image is energetic/bold`,
                `  - Use '900' for a single dramatic zone if the illustration calls for heavy impact`,
                `  - Think like a magazine designer: hierarchy through weight, not just size`,
                '',
                `TYPOGRAPHY & BRANDING:`,
                `Select a font pairing that MATCHES the visual theme of the image. DO NOT just use "Inter" and "Cormorant Garamond" every time.`,
                `AVAILABLE GOOGLE FONTS (use exact names from this list):`,
                `  Serif (elegant, classic): "Cormorant Garamond", "Playfair Display", "Lora", "DM Serif Display", "EB Garamond"`,
                `  Sans-serif (clean, modern): "Inter", "DM Sans", "Outfit", "Plus Jakarta Sans", "Montserrat", "Space Grotesk"`,
                `  Display (impactful): "Bebas Neue", "Oswald", "Syne", "Cinzel"`,
                `Font sizes MUST be in points (pt), typically 8pt to 28pt.`,
                '',
                `FOCAL POINTS DETECTION:`,
                `Scan the image for the 1-4 largest, most visually prominent elements (e.g. "Large crescent moon", "Diagonal pink stripe", "Cluster of speech bubbles in center").`,
                `For each element report: description (short label), xPct (horizontal center as 0-100% of width), yPct (vertical center as 0-100% of height), sizePct (approximate radius as % of image height, e.g. 20 means the element spans ~20% of the card height).`,
                '',
                ...buildReadabilityOverlayPrompt(primaryFieldName),
                '',
                `Return ONLY a valid JSON object map that mirrors the keys of the dynamic text content provided. Example structure:`,
                `{"quote":{"fontSize":20,"fontFamily":"Playfair Display","fontWeight":"bold","lineHeight":1.15,"color":"#ecdba5","topPct":20,"heightPct":40,"leftPct":15,"widthPct":70,"containerSvg":"<defs><linearGradient id=\\"softWash\\" x1=\\"0%\\" y1=\\"0%\\" x2=\\"100%\\" y2=\\"100%\\"><stop offset=\\"0%\\" stop-color=\\"rgba(0,0,0,0.08)\\"/><stop offset=\\"100%\\" stop-color=\\"rgba(0,0,0,0.26)\\"/></linearGradient></defs><path d=\\"M4 8 C18 0 82 0 96 8 L100 86 C82 100 18 100 0 86 Z\\" fill=\\"url(#softWash)\\"/>"},"description":{"fontSize":11,"fontFamily":"Lora","fontWeight":"regular","lineHeight":1.35,"color":"#fdfbf7","topPct":62,"heightPct":20,"leftPct":15,"widthPct":70,"containerSvg":""},"brand":{"color":"#fdfbf7"},"qrFgColor":"#fdfbf7","qrSizeMm":12,"focalPoints":[{"description":"Large crescent moon","xPct":70,"yPct":25,"sizePct":22}]}`
            ].filter(Boolean).join('\n');

            let typographySuggestion: TypographyHints;
            const compactTypographyPromptText = [
              `You are designing a print card back layout. Return compact JSON only.`,
              `Card ratio: ${w}mm x ${h}mm.`,
              `DECK EDITION: "${deckLabel}"`,
              fieldDescriptions ? `FIELDS:\n${fieldDescriptions}` : '',
              ...copyHierarchyNote,
              `TEXT TO FIT:`,
              ...sampleTextLines,
              remixInstruction ? `USER REMIX DIRECTIVE: ${remixInstruction}` : '',
              ...buildReadabilityOverlayPrompt(primaryFieldName),
              `For every listed text key return exactly these fields: fontSize, fontFamily, fontWeight, lineHeight, color, topPct, heightPct, leftPct, widthPct, readabilityScore, backgroundComplexity, needsOverlay.`,
              `Use short Google Font names from this set only: Cormorant Garamond, Playfair Display, Lora, DM Serif Display, EB Garamond, Inter, DM Sans, Outfit, Plus Jakarta Sans, Montserrat, Space Grotesk, Bebas Neue, Oswald, Syne, Cinzel.`,
              `Do not include focalPoints, notes, SVG markup, markdown fences, or extra prose.`,
            ].filter(Boolean).join('\n');

            const buildTypographyResponseSchema = (includeDecorations: boolean) => ({
              type: 'OBJECT',
              properties: {
                ...textKeys.reduce((acc, key) => {
                  const properties: Record<string, unknown> = {
                    fontSize: { type: 'NUMBER' },
                    fontFamily: { type: 'STRING' },
                    fontWeight: { type: 'STRING' },
                    lineHeight: { type: 'NUMBER' },
                    letterSpacing: { type: 'NUMBER' },
                    color: { type: 'STRING' },
                    readabilityScore: { type: 'NUMBER' },
                    backgroundComplexity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
                    needsOverlay: { type: 'BOOLEAN' },
                    topPct: { type: 'NUMBER' },
                    heightPct: { type: 'NUMBER' },
                    leftPct: { type: 'NUMBER' },
                    widthPct: { type: 'NUMBER' },
                  };
                  if (includeDecorations) {
                    properties.containerSvg = { type: 'STRING', description: 'Valid SVG string without enclosing <svg> tag that dynamically scales (width="100%" height="100%"). Background vectors/ribbons/boxes.' };
                  }

                  acc[key] = {
                    type: 'OBJECT',
                    properties,
                    required: includeDecorations
                      ? ['topPct', 'heightPct', 'leftPct', 'widthPct', 'containerSvg', 'fontSize', 'fontFamily', 'fontWeight', 'color']
                      : ['topPct', 'heightPct', 'leftPct', 'widthPct', 'fontSize', 'fontFamily', 'fontWeight', 'color'],
                  };
                  return acc;
                }, {} as Record<string, unknown>),
                brand: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
                qrFgColor: { type: 'STRING' },
                qrSizeMm: { type: 'NUMBER' },
                ...(includeDecorations ? {
                  focalPoints: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        description: { type: 'STRING' },
                        xPct: { type: 'NUMBER' },
                        yPct: { type: 'NUMBER' },
                        sizePct: { type: 'NUMBER' }
                      },
                      required: ['description', 'xPct', 'yPct', 'sizePct']
                    }
                  }
                } : {}),
              },
              required: [...textKeys]
            });

            const fetchTypographySuggestion = async (options: {
              promptText: string;
              includeDecorations: boolean;
              label: string;
              maxOutputTokens: number;
            }) => {
              console.log(`\n👁️  [Vision Engine] Standalone Typography Analysis (${options.label})...`);
              const geminiVisionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
              const textRes = await fetch(geminiVisionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: options.promptText },
                      { inlineData: { mimeType: 'image/png', data: base64Data } }
                    ]
                  }],
                  generationConfig: {
                    temperature: remixInstruction ? 1.2 : 0.2,
                    maxOutputTokens: options.maxOutputTokens,
                    responseMimeType: 'application/json',
                    responseSchema: buildTypographyResponseSchema(options.includeDecorations),
                  }
                })
              });

              if (!textRes.ok) {
                const errDetails = await textRes.text();
                throw new Error(`Gemini Vision API Failed: ${errDetails.slice(0, 300)}`);
              }

              const textData = await textRes.json() as GeminiTextResponse;
              const candidate = textData.candidates?.[0];
              const finishReason = candidate?.finishReason;
              const rawText = Array.isArray(candidate?.content?.parts)
                ? candidate.content.parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('')
                : '';
              const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();

              try {
                return JSON.parse(jsonStr);
              } catch {
                console.error('[analyze-typography] JSON parse failed. finishReason:', finishReason, '\nRaw (first 300):', jsonStr.slice(0, 300));
                const error = new Error(`La IA devolvio un JSON incompleto (finishReason: ${finishReason}).`) as Error & { finishReason?: string; rawText?: string };
                error.finishReason = finishReason;
                error.rawText = jsonStr;
                throw error;
              }
            };

            const buildFallbackTypographySuggestion = () => {
              const orderedKeys = Array.from(new Set([
                'when_to_use',
                primaryFieldName,
                primaryFieldName === 'instruction' ? 'phrase' : 'instruction',
                'answer',
                'fun_fact',
                ...textKeys,
              ])).filter(key => textKeys.includes(key));
              const primaryKey = orderedKeys.find(key => key === primaryFieldName) ?? orderedKeys.find(key => key !== 'when_to_use') ?? orderedKeys[0];
              const fallback: Record<string, unknown> = {
                brand: { color: '#f9fafb' },
                qrFgColor: '#f9fafb',
                qrSizeMm: 12,
                overallNotes: 'Fallback determinista: la IA no pudo cerrar JSON, se aplico una grilla segura con contenedores de contraste.',
              };
              const contentLengthFor = (key: string) => String(cardContent?.[key] ?? '').trim().length;
              const slots = [
                { topPct: 22, heightPct: 32, leftPct: 12, widthPct: 76 },
                { topPct: 58, heightPct: 17, leftPct: 14, widthPct: 72 },
                { topPct: 79, heightPct: 9, leftPct: 16, widthPct: 68 },
                { topPct: 89, heightPct: 6, leftPct: 18, widthPct: 64 },
              ];

              if (orderedKeys.includes('when_to_use')) {
                fallback.when_to_use = {
                  fontSize: 7,
                  fontFamily: 'Outfit',
                  fontWeight: '600',
                  lineHeight: 1.2,
                  color: '#f9fafb',
                  topPct: 10,
                  heightPct: 8,
                  leftPct: 14,
                  widthPct: 72,
                  containerSvg: '<rect width="100%" height="100%" rx="6" fill="rgba(0,0,0,0.28)"/>',
                };
              }

              orderedKeys.filter(key => key !== 'when_to_use').forEach((key, index) => {
                const slot = slots[Math.min(index, slots.length - 1)];
                const isPrimary = key === primaryKey;
                const textLength = contentLengthFor(key);
                const isLong = textLength > 150;
                fallback[key] = {
                  fontSize: isPrimary ? (isLong ? 9 : 15) : (textLength > 90 ? 7.5 : 8.5),
                  fontFamily: key === 'answer' || key === 'fun_fact' ? 'Outfit' : 'Cormorant Garamond',
                  fontWeight: isPrimary ? '700' : 'regular',
                  lineHeight: isLong ? 1.28 : 1.18,
                  color: '#fdfbf7',
                  ...slot,
                  containerSvg: '<rect width="100%" height="100%" rx="8" fill="rgba(0,0,0,0.38)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>',
                };
              });

              return fallback;
            };

            try {
              typographySuggestion = await fetchTypographySuggestion({
                promptText: typographyPromptText,
                includeDecorations: true,
                label: 'full',
                maxOutputTokens: 8192,
              });
            } catch (firstErr: unknown) {
              const canRetry = getErrorFinishReason(firstErr) === 'MAX_TOKENS' || /JSON incompleto|Unexpected end of JSON|Unexpected token/.test(String(getErrorMessage(firstErr)));
              if (!canRetry) throw firstErr;

              console.warn('[analyze-typography] Full JSON failed; retrying compact layout response.', getErrorMessage(firstErr));
              try {
                typographySuggestion = await fetchTypographySuggestion({
                  promptText: compactTypographyPromptText,
                  includeDecorations: false,
                  label: 'compact-retry',
                  maxOutputTokens: 8192,
                });
              } catch (retryErr: unknown) {
                const canFallback = getErrorFinishReason(retryErr) === 'MAX_TOKENS' || /JSON incompleto|Unexpected end of JSON|Unexpected token/.test(String(getErrorMessage(retryErr)));
                if (!canFallback) throw retryErr;

                console.warn('[analyze-typography] Compact JSON failed; using deterministic fallback layout.', getErrorMessage(retryErr));
                typographySuggestion = buildFallbackTypographySuggestion();
              }
            }

            typographySuggestion = fitTypographyHintsToContent(typographySuggestion, {
              cardHeightMm: h,
              cardWidthMm: w,
              content: cardContent,
              primaryFieldKey: primaryFieldName,
            }) ?? {};
            typographySuggestion = enforceHumanReadableTypography(typographySuggestion, {
              content: cardContent,
              primaryFieldKey: primaryFieldName,
            });

            // Resolve TTF
            const fontFamilies = new Set<string>();
            collectFontFamilies(typographySuggestion).forEach((family) => fontFamilies.add(family));
            const resolved: Record<string, string> = {};
            for (const family of fontFamilies) {
              const slug = family.toLowerCase().replace(/\s+/g, '-');
              try {
                const fRes = await fetch(`https://gwfh.mranftl.com/api/fonts/${slug}`);
                if (fRes.ok) {
                  const fData = await fRes.json() as FontMetadataResponse;
                  const regular = fData.variants?.find((variant) => variant.id === 'regular' || variant.id === '400') || fData.variants?.[0];
                  if (regular && regular.ttf) resolved[family] = regular.ttf;
                }
              } catch {
                // Optional font lookup; missing metadata should not block typography.
              }
            }
            typographySuggestion.ttfUrls = resolved;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, typography: typographySuggestion }));
          } catch (err: unknown) {
            console.error('[analyze-typography]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Generate AI vector container ──
        if (req.url === '/__cms__/generate-ornament-svg' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { shapePrompt, primaryColorHex } = JSON.parse(body);

            const apiKey = getBarajaGeminiApiKey();
            if (!apiKey) throw new Error(MISSING_GEMINI_API_KEY_ERROR);

            const VECTOR_STYLES = [
              "Cyberpunk angular tech borders with sharp 45-degree chamfers",
              "Retro 8-bit / Pixel Art blocky edges and rigid stair-stepping",
              "Art Deco elegant geometric symmetry and intersecting parallel lines",
              "Pop-art comic book style with thick black outlines and heavy offset drop shadows",
              "Organic, smooth blob-like irregular overlapping curves",
              "Origami / folded paper aesthetic with sharp polygon facets",
              "Gothic/Fantasy sharp ornate edges and aggressive points",
              "Minimalist Bauhaus using intersecting perfect abstract geometry",
              "Scrapbook cutout style with jagged, asymmetrical borders",
              "Steampunk mechanical panels with simulated rivets and layered plates"
            ];
            const randomStyle = VECTOR_STYLES[Math.floor(Math.random() * VECTOR_STYLES.length)];

            const systemPrompt = `You are a legendary SVG UI/UX vector artist specializing in advanced composition and geometric depth. Your ONLY output is raw, valid, scalable SVG markup.
You are tasked to generate a high quality vector graphical container (like a label, ribbon, banner, speech bubble, or badge): "${shapePrompt}".
The base color palette is: ${primaryColorHex || '#d4af64'}.

CREATIVE ROULETTE (MUST OBEY):
To mathematically ensure you NEVER generate the same boring shape twice, apply THIS specific structural flavor to your design (blend it creatively with the user's prompt):
>>> "${randomStyle}" <<<

ADVANCED AESTHETIC REQUIREMENTS (NEVER GENERATE FLAT, BORING RECTANGLES):
1. PSEUDO-3D & PERSPECTIVE: Don't think in flat x,y coordinates. Apply structural depth. You can use SVG transform (skew, rotate) or draw isometric perspectives to give the shape physical volume.
2. SHADOW STACKING: Use layered dropshadows or sharp "Offset" solid background blocks to create intense forced perspective (pop-art/comic style).
3. ASYMMETRY & EDGE CONTRAST: Use irregular corners, folded flaps, wrapping ribbons, or high-contrast bevel strokes (lighter edge on top, darker on bottom) to break visual monotony.
4. VECTOR FLAT-SHADING ONLY: Achieve depth using overlapping solid paths with different hex colors or semi-transparent solid fills (e.g., fill="#000" fill-opacity="0.2").

CRITICAL TECHNICAL LIMITATIONS (IF YOU VIOLATE THESE, THE RENDERER WILL CRASH):
5. NO GRADIENTS ALLOWED: You MUST NOT use <linearGradient>, <radialGradient>, or <defs>. Use ONLY solid colors (fill="#FFFFFF").
6. NO FILTERS ALLOWED: You MUST NOT use <filter>, <feGaussianBlur>, <feDropShadow>, or any complex SVG filters. Fake shadows using solid paths.
7. NO URL REFERENCES: Never use colors like fill="url(#id)". Every path must have a hardcoded hex or rgb color.

FUNCTIONAL REQUIREMENTS:
8. FUNCTIONAL TEXT BACKDROP: It MUST serve as a highly readable container for overlaying text. The center area must be clean and not overly busy.
9. SCALABILITY: MUST use a scalable viewBox (e.g., viewBox="0 0 500 250").
10. STRICT OUTPUT FORMAT: Output ONLY the <svg> tag. NO markdown formatting. NO wrapping. NO <text> nodes.

Do not say anything else. Just the pure valid SVG XML.`;

            // Flash is fast enough for SVG generation (~2-5s vs 30-60s+ for Pro)
            const resFetch = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 0.95, maxOutputTokens: 3000 }
              })
            });

            const aiData = await resFetch.json() as GeminiTextResponse;
            if (!resFetch.ok) throw new Error(aiData.error?.message || 'Error generating SVG from Gemini');
            
            let rawSvg = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            // Sanitize markdown wrapping
            rawSvg = rawSvg.replace(/```xml\n?|```html\n?|```svg\n?|```\n?/gi, '').trim();

            // Sanitize the root <svg> tag: remove hardcoded width/height and force it to be 100% so pdfme can scale it
            rawSvg = rawSvg.replace(/^<svg([^>]+)>/i, (_match: string, attrs: string) => {
              let cleanAttrs = attrs.replace(/\bwidth\s*=\s*(["']?)[^"'\s>]+(["']?)/i, '');
              cleanAttrs = cleanAttrs.replace(/\bheight\s*=\s*(["']?)[^"'\s>]+(["']?)/i, '');
              // Optionally we can add preserveAspectRatio="none" if we want it to stretch without retaining ratio
              if (!cleanAttrs.includes('preserveAspectRatio')) {
                  cleanAttrs += ' preserveAspectRatio="none"';
              }
              return `<svg width="100%" height="100%"${cleanAttrs}>`;
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, svg: rawSvg }));
          } catch (err: unknown) {
            console.error('[generate-ornament-svg]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Generate AI PNG container (Imagen) ──
        if (req.url === '/__cms__/generate-ornament-png' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }
          try {
            const body = await readBody(req);
            const { shapePrompt, primaryColorHex } = JSON.parse(body);

            const PNG_STYLES = [
              "3D rendered textured clay or matte acrylic material",
              "Photorealistic metallic emblem with polished edges",
              "Vibrant Gouache/Watercolor painting feeling",
              "Dark fantasy RPG UI panel with stone/wood textures",
              "Futuristic holographic volumetric glass",
              "Vintage 1950s atomic-age retro advertising badge",
              "Tactile folded cardboard or papercraft diorama styling",
              "Neon-lit synthwave vector grid structure",
              "Ornate Victorian frame with filigree",
              "Modern soft Neumorphic UI element with diffuse shadows"
            ];
            const randomStyle = PNG_STYLES[Math.floor(Math.random() * PNG_STYLES.length)];

            const prompt = [
              `A high-quality 2D detailed graphic element for a card game UI context: ${shapePrompt}.`,
              `Base color accent: ${primaryColorHex}.`,
              `STYLISTIC MODIFIER (Highly Important): Render this asset using a >>> ${randomStyle} <<< visual style.`,
              `It MUST be placed on a PURE ABSOLUTE WHITE (#FFFFFF) solid background so the background can be easily keyed out.`,
              `The center area MUST be large, clean, and flat (or visibly empty) since this is functionally a container/backdrop for overlaying text. Do not put text in the image.`
            ].join(' ');

            const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt }],
                parameters: { sampleCount: 1, aspectRatio: '4:3', outputOptions: { mimeType: 'image/png' } },
              }),
            });
            const data = await response.json() as ImagenPredictResponse;
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) {
              const errText = JSON.stringify(data).slice(0, 300);
              throw new Error(`Imagen 4 no devolvió una imagen: ${errText}`);
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, png: base64Data }));
          } catch (err: unknown) {
            console.error('[generate-ornament-png]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Save frame to public/frames/ (or public/frames/{deckId}/) ──
        if (req.url === '/__cms__/set-frame' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { dataUrl, face, deckId } = JSON.parse(body);

            if (!dataUrl || !face) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'dataUrl and face are required' }));
              return;
            }

            // Per-deck frames go to public/frames/{deckId}/, global to public/frames/
            const framesDir = deckId
              ? path.resolve(BARAJA_PUBLIC_DIR, `frames/${deckId}`)
              : path.resolve(BARAJA_PUBLIC_DIR, 'frames');
            await fs.mkdir(framesDir, { recursive: true });

            let finalBuffer: Buffer;

            if (dataUrl.startsWith('data:')) {
              const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (!matches) {
                throw new Error('Invalid base64 data URL format');
              }
              finalBuffer = Buffer.from(matches[2], 'base64');
            } else if (dataUrl.startsWith('/assets/') || dataUrl.startsWith('/frames/')) {
              const cleanUrl = dataUrl.split('?')[0] ?? dataUrl;
              const publicDir = BARAJA_PUBLIC_DIR;
              const srcPath = path.resolve(publicDir, cleanUrl.replace(/^\//, ''));
              if (!srcPath.startsWith(`${publicDir}${path.sep}`)) {
                throw new Error('Invalid local frame path');
              }
              finalBuffer = await fs.readFile(srcPath);
            } else {
              throw new Error('Unsupported dataUrl format. Must be base64, /assets/ path, or /frames/ path');
            }

            // We ALWAYS save the active frame as .png because the frontend (cardFrame.ts)
            // has hardcoded dependencies on back-frame.png / front-frame.png.
            // Modern browsers and canvas will correctly render JPEG bytes even if the file extension is .png.
            const filename = `${face}-frame.png`;
            const destPath = path.resolve(framesDir, filename);

            // Archive existing frame
            try {
              await fs.access(destPath);
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const archiveName = `${face}-frame_prev_${ts}.png`;
              await fs.rename(destPath, path.resolve(framesDir, archiveName));
              console.log(`📦 Archived previous frame as: ${archiveName}`);
            } catch {
              // No existing file, skip archive
            }

            // Write new frame
            await fs.writeFile(destPath, finalBuffer);
            const sizeKB = Math.round(finalBuffer.length / 1024);

            const relativePath = deckId
              ? `public/frames/${deckId}/${filename}`
              : `public/frames/${filename}`;
            console.log(`✅ Frame saved: ${relativePath} (${sizeKB}KB)`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, filename, sizeKB, deckId: deckId || null }));
          } catch (err: unknown) {
            console.error('[set-frame]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── List frames from library ────────────────────────
        if (req.url === '/__cms__/list-frames-library' && req.method === 'GET') {
          try {
            const libraryPath = path.resolve(CONTENT_DIR, 'frames_library.json');
            let frames = [];
            try {
              const content = await fs.readFile(libraryPath, 'utf-8');
              frames = JSON.parse(content);
            } catch {
              // File doesn't exist yet, it's fine
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, frames }));
          } catch (err: unknown) {
            console.error('[list-frames-library]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Save frame to library ────────────────────────
        if (req.url === '/__cms__/save-frame-library' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { dataUrl, prompt, typography, face, widthMm, heightMm, presetId } = JSON.parse(body);

            if (!dataUrl || !face) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'dataUrl and face are required' }));
              return;
            }

            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) throw new Error('Invalid base64 data URL format');
            
            const mimeType: string = matches[1];
            const base64Data: string = matches[2];
            const ext = mimeType === 'image/png' ? 'png' : 'jpg';

            // Generate unique ID
            const id = Date.now().toString();
            const filename = `library-${face}-${id}.${ext}`;
            const destPath = path.resolve(BARAJA_PUBLIC_DIR, `assets/frames/${filename}`);
            
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            
            // Save Image
            await fs.writeFile(destPath, Buffer.from(base64Data, 'base64'));

            // Save Metadata to JSON
            const libraryPath = path.resolve(CONTENT_DIR, 'frames_library.json');
            let frames = [];
            try {
              const content = await fs.readFile(libraryPath, 'utf-8');
              frames = JSON.parse(content);
            } catch {
              // Ignore
            }

            const newFrame = {
              id,
              url: `/assets/frames/${filename}`,
              prompt,
              typography,
              face,
              widthMm: widthMm || 70,
              heightMm: heightMm || 120,
              presetId: presetId || 'custom',
              timestamp: parseInt(id),
            };

            frames.unshift(newFrame); // Newest first
            await fs.writeFile(libraryPath, JSON.stringify(frames, null, 2));

            console.log(`✅ Frame added to library: ${filename}`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, frame: newFrame }));
          } catch (err: unknown) {
            console.error('[save-frame-library]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Generate frame prompt ideas via Gemini Flash ──────────────────
        if (req.url === '/__cms__/generate-frame-ideas' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }

          try {
            const body = await readBody(req);
            const { count = 8, seed, existingIds = [] } = JSON.parse(body || '{}');

            const diversityNote = existingIds.length > 0
              ? `Already shown styles: ${existingIds.join(', ')}. Generate COMPLETELY DIFFERENT styles.`
              : '';

            const seed_context = seed
              ? `The card deck theme/mood is: "${seed}". Adapt the palette and mood to that theme.`
              : '';

            const ideaPrompt = [
              `You are a professional card game art director specializing in print-ready playing card frames.`,
              `Generate exactly ${count} completely distinct frame design concepts for a 70mm × 120mm portrait card back.`,
              seed_context,
              diversityNote,
              ``,
              `Each concept must explore a different visual approach. Vary across these axes:`,
              `  CORNER TREATMENT: cornered (ornamental corners), cornerless (clean cuts), radius (rounded), cropped (geometric clip)`,
              `  BORDER STYLE: single line, double line, triple line, no border, dashed, dotted`,
              `  DECORATION: none, botanical/flora, geometric, Art Deco, minimal symbol, filigree, abstract brush, diagonal gradient from corner`,
              `  BACKGROUND: solid flat, subtle texture, grain, vignette, cross-hatch, linen, noise, diagonal stripe, radial gradient`,
              `  PALETTE: dark (near-black), light (cream/white), bold (jewel tones), neutral (warm gray)`,
              ``,
              `Frame rules (ALL concepts must follow):`,
              `  - The CENTER 64% of the card (from 18% to 82% from top) MUST be plain flat background — NO ornaments`,
              `  - Decorations ONLY in top strip (top 18%) and bottom strip (bottom 18%)`,
              `  - ABSOLUTELY NO text, letters, numbers, or words in the image`,
              `  - Colors must be CMYK-safe for offset printing`,
              ``,
              `Return ONLY a valid JSON array with no markdown fences, no explanation. Each element:`,
              `{`,
              `  "id": "unique-kebab-case-id",`,
              `  "label": "Emoji + Short Name (3 words max)",`,
              `  "description": "One evocative sentence describing the visual feel",`,
              `  "cornerStyle": "cornered|cornerless|radius|cropped",`,
              `  "borderStyle": "single|double|triple|none|dashed",`,  
              `  "decorationStyle": "botanical|geometric|art-deco|minimal|filigree|gradient|none",`,
              `  "palette": "dark|light|bold|neutral",`,
              `  "prompt": "Full 3-5 sentence detailed image generation prompt. Be specific about exact colors (hex or descriptive), line weights, corner ornament sizes, background texture intensity, and composition. Mention that the large center area must be a plain flat solid color. NO text in the image."`,
              `}`,
            ].filter(Boolean).join('\n');

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: ideaPrompt }] }],
                generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
              }),
            });

            if (!geminiRes.ok) {
              const errText = await geminiRes.text();
              throw new Error(`Gemini API ${geminiRes.status}: ${errText.slice(0, 200)}`);
            }

            const geminiData = await geminiRes.json() as GeminiTextResponse;
            const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();
            const ideas = JSON.parse(jsonStr);

            console.log(`💡 Generated ${ideas.length} frame ideas`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ideas }));
          } catch (err: unknown) {
            console.error('[generate-frame-ideas]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        // ── Generate legacy full card back image via Imagen 4 (Flujo B) ──────────
        if (req.url === '/__cms__/generate-card-image' && req.method === 'POST') {
          const apiKey = getBarajaGeminiApiKey();
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: MISSING_GEMINI_API_KEY_ERROR }));
            return;
          }

          try {
            const body = await readBody(req);
            const { deckId, cardId, force, legacyFullBack } = JSON.parse(body);

            if (!deckId || !cardId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'deckId and cardId are required' }));
              return;
            }

            if (legacyFullBack !== true) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                error: 'generate-card-image is legacy full-back mode. Use Studio background generation for editable backs, or pass legacyFullBack=true intentionally.',
              }));
              return;
            }

            // Load deck JSON
            const deckFile = path.resolve(CONTENT_DIR, `${deckId}.json`);
            const deckRaw = JSON.parse(await fs.readFile(deckFile, 'utf-8')) as RawDeckContent;

            const card = deckRaw.cards?.find((candidate) => candidate.id === cardId);
            if (!card) {
              throw new Error(`Card "${cardId}" not found in deck "${deckId}"`);
            }

            // Skip if already has back image and not forcing
            if (card.back?.back_image_url && !force) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, back_image_url: card.back.back_image_url, skipped: true }));
              return;
            }

            // Deck design info for aesthetic brief
            const deckName = deckRaw.name || deckId;
            const deckSlug = deckRaw.slug || deckId;
            const primaryColor = deckRaw.design_template_overrides?.primary_color || '#1a1435';
            const accentColor = deckRaw.design_template_overrides?.accent_color || '#d4af64';
            const tone = deckRaw.metadata?.tone || 'honest, calm, grounded';
            const topic = deckRaw.metadata?.topic || '';

            // Card content
            const { when_to_use, phrase, instruction, answer } = card.back;
            const cardNumber = String(card.front.number).padStart(2, '0');
            const cardTitle = card.front.title || '';
            const instructionFirstCopy = shouldPrioritizeInstructionForRawDeck(deckRaw);
            const primaryBackText = instructionFirstCopy ? (instruction || phrase) : (phrase || instruction);
            const secondaryBackText = instructionFirstCopy ? phrase : instruction;
            const typographyLayoutLines = instructionFirstCopy
              ? [
                  `In the CENTER (largest, clearest readable text, elegant serif or humanist sans, centered, 3-6 lines max):`,
                  primaryBackText ? `  "${primaryBackText}"` : `  (no main text)`,
                  ``,
                  secondaryBackText ? `Below the main instruction (smaller editorial hook, muted but readable):` : '',
                  secondaryBackText ? `  "${secondaryBackText}"` : '',
                  answer ? `Below the hook or instruction (very small, muted): "Rta: ${answer}"` : '',
                ]
              : [
                  `In the CENTER (large elegant serif font, white, centered, 2-4 lines max):`,
                  primaryBackText ? `  "${primaryBackText}"` : `  (no main text)`,
                  ``,
                  secondaryBackText ? `Below the phrase (small, readable body text, light gray, centered):` : '',
                  secondaryBackText ? `  "${secondaryBackText}"` : '',
                  answer ? `Below instruction (very small, muted): "Rta: ${answer}"` : '',
                ];

            // Build the full-card design prompt (Flujo B)
            const prompt = [
              `Design a complete playing card back face for "${deckName}" — a ${topic} card deck.`,
              `Card size: 70mm x 120mm portrait. Print-ready at 300 DPI. CMYK colors.`,
              ``,
              `AESTHETIC:`,
              `Background color: ${primaryColor} (deep dark navy/indigo). Accent color: ${accentColor} (warm gold).`,
              `Tone: ${tone}. Elegant, minimal, premium feel. Think high-end card game.`,
              `Decorative elements only at the TOP and BOTTOM edges of the card (thin borders, small corner ornaments).`,
              `The large CENTER panel must be clean and flat (just the background color) — this is where the typography lives.`,
              ``,
              `TYPOGRAPHY LAYOUT (render this text on the card):`,
              ``,
              `At the TOP (small, uppercase, spaced-out, gold/muted text, centered):`,
              when_to_use ? `  "${when_to_use.toUpperCase()}"` : `  (no header text)`,
              ``,
              ...typographyLayoutLines,
              ``,
              `At the BOTTOM CENTER leave a clean 14mm x 14mm square space — this area will have a QR code placed on top programmatically, do not draw anything there.`,
              ``,
              `Card number "N° ${cardNumber}" in tiny text at bottom left corner (inside the bottom decorative band).`,
              `Deck name "${deckName}" in tiny spaced uppercase at the very bottom center (inside decorative band).`,
              ``,
              `STRICT RULES:`,
              `- Do NOT add placeholder text, zone labels, or wireframe annotations.`,
              `- Do NOT add a QR code (it will be overlaid separately).`,
              `- No lorem ipsum, no random text.`,
              `- All text must be exactly as specified above, nothing more.`,
              `- Colors: dark background, gold accents, white main text, light-gray secondary text.`,
            ].filter(Boolean).join('\n');

            console.log(`\n🎴 [Card Back Generator] ${deckId}/${cardId} — ${cardTitle}`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt }],
                parameters: { sampleCount: 1, aspectRatio: '9:16', outputOptions: { mimeType: 'image/png' } },
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Imagen 4 API ${response.status}: ${errText.slice(0, 300)}`);
            }

            const data = await response.json() as ImagenPredictResponse;
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) throw new Error('Imagen 4 did not return an image.');

            // Save PNG to public/assets/editions/{slug}/
            const editionsDir = path.resolve(ASSETS_DIR, deckSlug);
            await fs.mkdir(editionsDir, { recursive: true });
            const filename = `${cardId}-back.png`;
            const destPath = path.resolve(editionsDir, filename);

            // Archive existing
            try {
              await fs.access(destPath);
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              await fs.rename(destPath, path.resolve(editionsDir, `${cardId}-back_prev_${ts}.png`));
            } catch { /* no existing file */ }

            await fs.writeFile(destPath, Buffer.from(base64Data, 'base64'));
            const sizeKB = Math.round(Buffer.from(base64Data, 'base64').length / 1024);

            // Public URL served by Vite dev server
            const back_image_url = `/assets/editions/${deckSlug}/${filename}`;

            // Persist to deck JSON
            const prevBackImageUrl = card.back.back_image_url;
            const prevVersions: string[] = card.back.back_image_versions || [];
            if (prevBackImageUrl) prevVersions.unshift(prevBackImageUrl);

            card.back.back_image_url = back_image_url;
            card.back.back_image_versions = prevVersions.slice(0, 5);

            await fs.writeFile(deckFile, JSON.stringify(deckRaw, null, 2));
            
            // Sync to DB
            await saveEditionToSupabase(deckRaw);

            console.log(`✅ Card back saved: ${back_image_url} (${sizeKB}KB)`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, back_image_url, sizeKB }));
          } catch (err: unknown) {
            console.error('[generate-card-image]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
          return;
        }

        next();
      });
    }
  };
}
