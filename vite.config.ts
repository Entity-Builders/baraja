import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

// Load root .env for GEMINI_API_KEY
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const CONTENT_DIR = path.resolve(__dirname, '../../packages/deck-engine/src/content');
const ASSETS_DIR = path.resolve(__dirname, 'public/assets/editions');

/** Generate a single card's illustration via Gemini */
async function generateCardArt(
  deck: any,
  cardId: string,
  slug: string,
  apiKey: string
): Promise<{ success: boolean; art_url?: string; art_versions?: string[]; error?: string }> {
  const card = deck.cards.find((c: any) => c.id === cardId);
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

  if (artDir?.global_brief) {
    promptParts.push(artDir.global_brief);
  }
  if (artDir?.faces && artDir.faces !== 'realistic') {
    const faceRules: Record<string, string> = {
      'none': 'IMPORTANT: Do NOT show any human faces at all. Show people ONLY as solid black silhouettes, or from behind, or cropped below the neck. No facial features whatsoever.',
      'silhouette': 'Show human figures as solid dark silhouettes or from behind. No recognizable facial features.',
      'stylized': 'Show faces only in a stylized, cartoon, or caricature style — never photorealistic.',
    };
    if (faceRules[artDir.faces]) promptParts.push(faceRules[artDir.faces]);
  }
  if (card.front.subject_hint) {
    promptParts.push(`Context: This card is about ${card.front.subject_hint}. Use the correct team colors, stadium, and era — but remember: NO faces, NO photographs.`);
  }
  // Anti-spoiler rule for trivia cards
  if (card.back?.answer) {
    promptParts.push(`ANTI-SPOILER: This card asks a trivia question. The answer is "${card.back.answer}". The illustration must NOT reveal or hint at this answer. Focus on the question's theme, not the answer.`);
  }
  promptParts.push(basePrompt);

  const width = deck.print_specs?.dimensions?.width || 88;
  const height = deck.print_specs?.dimensions?.height || 138;
  const isLandscape = width > height;

  // Set the precise ratio flag for Imagen 4
  // 88x63 (Landscape) is ~1.39 ratio. "4:3" (1.33) is the closest fit.
  // 63x88 (Portrait) is ~0.71 ratio. "3:4" (0.75) is the closest fit.
  const targetRatio = isLandscape ? "4:3" : "3:4";

  // Add safe zone instructions to prevent subject cropping
  promptParts.push('CRITICAL FORMATTING REQUIREMENT: Keep the main subject and action perfectly centered. Leave generous breathing room (padding) around the edges of the canvas to ensure no important details get cropped out when fitting the illustration into a standard playing card frame.');


  const prompt = promptParts.join('\n');

  console.log(`🎨 Generating art for ${cardId} [${targetRatio}]: "${basePrompt.slice(0, 80)}..."`);

  // Using Imagen 4 which officially supports aspect ratio parameters!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: prompt }],
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

  const data: any = await response.json();
  const base64Data = data.predictions?.[0]?.bytesBase64Encoded;

  if (!base64Data) {
    throw new Error('No image returned by Imagen API');
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

  console.log(`✅ Saved: ${art_url}`);
  return { success: true, art_url, art_versions: card.front.art_versions || [] };
}

// Helper to read POST body
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Fetch Wikipedia summary for a movie.
 * Uses the Spanish Wikipedia API.
 */
async function fetchWikiExtract(title: string, year?: string): Promise<string | undefined> {
  try {
    const searchQuery = encodeURIComponent(`${title} ${year ? year : ''} película`.trim());
    const searchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&utf8=&format=json&origin=*`;
    
    const searchRes = await fetch(searchUrl);
    const searchData: any = await searchRes.json();
    
    if (searchData.query?.search?.length > 0) {
      // Get the top matching page ID
      const pageId = searchData.query.search[0].pageid;
      
      const extractUrl = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=false&explaintext=true&pageids=${pageId}&format=json&origin=*`;
      const extractRes = await fetch(extractUrl);
      const extractData: any = await extractRes.json();
      
      const text = extractData.query?.pages[pageId]?.extract;
      if (text) {
        // Limit to ~2000 chars to avoid blowing up the prompt token count
        return text.length > 2000 ? text.substring(0, 2000) + '...' : text;
      }
    }
  } catch (err: any) {
    console.error(`  ❌ Wiki error for "${title}": ${err.message}`);
  }
  return undefined;
}

/** Enrich movie titles via TMDB API and Wikipedia */
async function enrichMovieData(titles: string[], apiKey: string): Promise<any[]> {
  const results: any[] = [];

  for (const title of titles) {
    try {
      console.log(`🎬 TMDB lookup: "${title.trim()}"`);
      // Step 1: Search movie
      const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title.trim())}&language=es&api_key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      const searchData: any = await searchRes.json();

      if (searchData.results && searchData.results.length > 0) {
        const topMatch = searchData.results[0];
        
        // Step 2: Grab full details (for credits)
        const detailsUrl = `https://api.themoviedb.org/3/movie/${topMatch.id}?append_to_response=credits&language=es&api_key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData: any = await detailsRes.json();

        const director = detailsData.credits?.crew?.find((c: any) => c.job === 'Director')?.name;
        const actors = detailsData.credits?.cast?.slice(0, 3).map((a: any) => a.name).join(', ');
        const year = detailsData.release_date ? detailsData.release_date.split('-')[0] : undefined;

        // Step 3: Fetch Wikipedia extract for deep lore
        let wikiExtract = undefined;
        if (detailsData.title) {
           console.log(`  📚 Wikipedia lookup for lore...`);
           wikiExtract = await fetchWikiExtract(detailsData.title, year);
        }

        results.push({
          title: detailsData.title,
          year,
          director,
          genre: detailsData.genres?.map((g: any) => g.name).join(', '),
          actors,
          plot: detailsData.overview,
          poster: detailsData.poster_path ? `https://image.tmdb.org/t/p/w500${detailsData.poster_path}` : undefined,
          imdbRating: detailsData.vote_average ? detailsData.vote_average.toFixed(1) : undefined,
          country: detailsData.production_countries?.map((c: any) => c.iso_3166_1).join(', '),
          wikiExtract,
        });
        console.log(`  ✅ Found: ${detailsData.title} (${year}) — ⭐ ${detailsData.vote_average?.toFixed(1)}${wikiExtract ? ' [+Wiki Lore]' : ''}`);
      } else {
        console.log(`  ⚠️ Not found: "${title}"`);
        results.push({ title: title.trim(), _notFound: true });
      }

      // Rate limit TMDB (40 req per 10s -> ~250ms per req safety)
      await new Promise(r => setTimeout(r, 250));
    } catch (err: any) {
      console.error(`  ❌ TMDB error for "${title}": ${err.message}`);
      results.push({ title: title.trim(), _error: err.message });
    }
  }

  return results;
}

// Local CMS plugin: only available during dev, allows saving edits to JSON cards
function localDeckCmsPlugin() {
  return {
    name: 'local-deck-cms',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {

        // ── Delete edition ──────────────────────────────────
        if (req.url?.startsWith('/api/admin/delete-edition/') && req.method === 'DELETE') {
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
            } catch (e) {
              // Ignore if assets folder doesn't exist
            }

            console.log(`✅ [Admin] Deleted edition: ${slug}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (err: any) {
            console.error('[delete-edition]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Save card edits ──────────────────────────────────
        if (req.url === '/api/admin/save-edition' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { deckId, cardId, updates } = JSON.parse(body);
            const jsonPath = path.resolve(CONTENT_DIR, `${deckId}.json`);

            const content = await fs.readFile(jsonPath, 'utf-8');
            const deck = JSON.parse(content);

            const cardIndex = deck.cards.findIndex((c: any) => c.id === cardId);
            if (cardIndex !== -1) {
              deck.cards[cardIndex] = {
                ...deck.cards[cardIndex],
                ...updates,
                front: { ...deck.cards[cardIndex].front, ...updates.front },
                back: { ...deck.cards[cardIndex].back, ...updates.back },
              };
              await fs.writeFile(jsonPath, JSON.stringify(deck, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Card not found' }));
            }
          } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }


        // ── Generate art (single or batch) ───────────────────
        if (req.url === '/api/admin/generate-art' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set in root .env' }));
            return;
          }

          try {
            const body = await readBody(req);
            const { deckId, cardId, force } = JSON.parse(body);
            // cardId: string → single card | undefined → batch all missing (or all if force=true)

            const jsonPath = path.resolve(CONTENT_DIR, `${deckId}.json`);
            const deck = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
            const slug = deck.slug || deckId;

            if (cardId) {
              // ── Single card ──
              if (force) {
                const card = deck.cards.find((c: any) => c.id === cardId);
                if (card) card.front.art_url = undefined; // clear so it regenerates
              }
              const result = await generateCardArt(deck, cardId, slug, apiKey);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } else {
              // ── Batch ──
              const targets = deck.cards.filter((c: any) => force || !c.front.art_url);
              const results: any[] = [];

              for (const card of targets) {
                if (force) card.front.art_url = undefined;
                try {
                  const r = await generateCardArt(deck, card.id, slug, apiKey);
                  results.push({ id: card.id, ...r });
                } catch (e: any) {
                  results.push({ id: card.id, success: false, error: e.message });
                }
                // Rate limit
                await new Promise(r => setTimeout(r, 2500));
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, results }));
            }
          } catch (err: any) {
            console.error(err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message || String(err) }));
          }
          return;
        }

        // ── Enrich seed items via OMDB ─────────────────────
        if (req.url === '/api/admin/enrich' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { seedItems, enrichmentType } = JSON.parse(body);

            if (!seedItems || !Array.isArray(seedItems) || seedItems.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'seedItems array is required' }));
              return;
            }

            let enriched: any[] = [];

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
          } catch (err: any) {
            console.error('[enrich]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Preview assembled prompt ──────────────────────
        if (req.url === '/api/admin/preview-prompt' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const params = JSON.parse(body);

            const { buildDeckPrompt, BARAJA_SYSTEM_PROMPT } = await import(
              path.resolve(__dirname, '../../packages/deck-engine/src/generator/prompts.ts') + '?t=' + Date.now()
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
          } catch (err: any) {
            console.error('[preview-prompt]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Generate full edition via AI ─────────────────────
        if (req.url === '/api/admin/generate-edition' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY not set in root .env' }));
            return;
          }

          try {
            const body = await readBody(req);
            const { topic, cardCount, additionalContext, deckType, difficulty, artStyle, enrichedData } = JSON.parse(body);

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

            const sendEvent = (eventData: any) => {
              res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            };

            sendEvent({ type: 'progress', message: 'Initializing Gemini 2.5 Pro...' });

            // Dynamic import to avoid bundling issues
            const { GoogleGenAI } = await import('@google/genai');
            const { BARAJA_SYSTEM_PROMPT, buildDeckPrompt } = await import(
              path.resolve(__dirname, '../../packages/deck-engine/src/generator/prompts.ts') + '?t=' + Date.now()
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
                responseSchema: aiSchema as any,
              },
            });

            let rawJson = response.text;
            if (!rawJson) {
              sendEvent({ type: 'error', message: 'No text returned from Gemini' });
              return res.end();
            }

            // Strip markdown if present
            rawJson = rawJson.replace(/^```json/mi, '').replace(/```$/m, '').trim();

            let parsed = JSON.parse(rawJson);
            sendEvent({ type: 'progress', message: `✅ Generation complete: ${parsed.cards.length} cards drafted` });

            // --- CRITIC PHASE ---
            if (deckType === 'trivia' && enrichedData && enrichedData.length > 0) {
              console.log(`\n🕵️‍♂️ [Critic] Validating facts against Source of Truth...`);
              sendEvent({ type: 'progress', message: '🕵️‍♂️ [Critic] Validating facts against Source of Truth... (this might take 15-20s)' });
              
              try {
                const { BARAJA_CRITIC_SYSTEM_PROMPT, buildCriticPrompt } = await import(
                  path.resolve(__dirname, '../../packages/deck-engine/src/generator/prompts.ts') + '?t=' + Date.now()
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
              } catch (criticErr: any) {
                console.error(`⚠️ [Critic] Validation failed, falling back to draft: ${criticErr.message}`);
                sendEvent({ type: 'progress', message: `⚠️ [Critic] Validation skipped due to error: ${criticErr.message}` });
              }
            }
            // --- END CRITIC PHASE ---

            sendEvent({ type: 'progress', message: 'Saving deck to content directory...' });

            // Build slug and save
            const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const finalId = `${slug}-v1`;

            const rawDeckContent = {
              id: finalId,
              edition: slug,
              name: parsed.name,
              slug,
              description: parsed.description,
              language: parsed.language,
              card_count: parsed.cards.length,
              metadata: parsed.metadata,
              print_spec_id: 'baraja-standard',
              design_template_id: 'dark-minimal-01',
              pricing: { amount: 1500000, currency: 'ars' },
              cards: parsed.cards,
            };

            const outputPath = path.resolve(CONTENT_DIR, `${slug}.json`);
            await fs.writeFile(outputPath, JSON.stringify(rawDeckContent, null, 2), 'utf-8');

            console.log(`✅ Edition saved: content/${slug}.json (${parsed.cards.length} cards)`);
            sendEvent({ type: 'progress', message: '✅ Saved to disk successfully' });

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
          } catch (err: any) {
            console.error('[generate-edition]', err);
            // If headers were already sent we can't send a 500, so we send an error event
            if (res.headersSent) {
              res.write(`data: ${JSON.stringify({ type: 'error', message: err.message || String(err) })}\n\n`);
              res.end();
            } else {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
            }
            return;
          }
        }

        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare(), localDeckCmsPlugin()],
  publicDir: 'public',
  server: {
    allowedHosts: true,
    port: 5175,
  },
});
