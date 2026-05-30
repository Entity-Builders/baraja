import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Local Supabase — service key bypasses RLS for server-side writes
const _supabaseLocal = createClient(
  'http://127.0.0.1:54321',
  'REDACTED_SUPABASE_SERVICE_KEY',
  { db: { schema: 'baraja' } }
);

// Load root .env for GEMINI_API_KEY
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const CONTENT_DIR = path.resolve(__dirname, '../../packages/deck-engine/src/content');
const ASSETS_DIR = path.resolve(__dirname, 'public/assets/editions');

/** Regenerate decks.ts so Vite HMR picks up new JSON files */
function triggerDeckSync() {
  exec('npm run sync', { cwd: path.resolve(__dirname, '../../packages/deck-engine') }, (error) => {
    if (error) {
      console.error('⚠️ [Auto-Sync] Failed to regenerate decks.ts:', error);
    } else {
      console.log('🔄 [Auto-Sync] decks.ts regenerated.');
    }
  });
}

/** Persist a freshly-generated edition directly into Supabase */
async function saveEditionToSupabase(rawDeckContent: any): Promise<void> {
  const { slug, cards = [] } = rawDeckContent;

  // Upsert edition row
  const { error: editionErr } = await _supabaseLocal
    .from('editions')
    .upsert({
      slug,
      name: rawDeckContent.name,
      description: rawDeckContent.description,
      print_spec_id: rawDeckContent.print_spec_id,
      design_template_id: rawDeckContent.design_template_id || null,
      print_specs_overrides: rawDeckContent.print_specs_overrides || {},
      design_template_overrides: rawDeckContent.design_template_overrides || {},
    }, { onConflict: 'slug' });

  if (editionErr) {
    console.error(`❌ [Supabase] Failed to upsert edition ${slug}:`, editionErr.message);
    return;
  }

  // Replace cards — delete existing then bulk insert
  await _supabaseLocal.from('cards').delete().eq('edition_slug', slug);

  if (cards.length > 0) {
    const cardsToInsert = cards.map((card: any) => ({
      id: card.id,
      edition_slug: slug,
      number: card.front.number,
      front: card.front,
      back: card.back,
      tags: card.tags || [],
    }));

    const { error: cardsErr } = await _supabaseLocal
      .from('cards')
      .insert(cardsToInsert);

    if (cardsErr) {
      console.error(`❌ [Supabase] Failed to insert cards for ${slug}:`, cardsErr.message);
    } else {
      console.log(`✅ [Supabase] ${slug}: ${cards.length} cards saved.`);
    }
  }
}

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
  promptParts.push(`CRITICAL OUTPUT RULES:
- The output IS the artwork itself — NOT a photograph of a painting, NOT a canvas on a wall, NOT a framed picture.
- DO NOT render the artwork as a physical object (no canvas edges, no frame, no wall behind it, no shadow, no 3D perspective of a painting).
- The artwork MUST fill the ENTIRE image edge-to-edge with absolutely NO margins, borders, white space, or empty background.
- Colors, textures, and visual elements MUST extend all the way to every single edge of the image.
- DO NOT paint any card shape, rounded corners, or decorative border into the image.
- Think of the output as a seamless texture/artwork that will be cropped — every pixel must be part of the art.`);


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

  // Sync to DB
  await saveEditionToSupabase(deck);

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
            } catch (e) {
              // Ignore if assets folder doesn't exist
            }

            console.log(`✅ [Admin] Deleted edition: ${slug}`);
            triggerDeckSync();
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
        if (req.url === '/__cms__/save-edition' && req.method === 'POST') {
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
              
              // Sync to DB
              await saveEditionToSupabase(deck);

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
        if (req.url === '/__cms__/generate-art' && req.method === 'POST') {
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
        if (req.url === '/__cms__/preview-prompt' && req.method === 'POST') {
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
        if (req.url === '/__cms__/generate-edition' && req.method === 'POST') {
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

            // 1. Save JSON to disk (local backup & decks.ts source)
            const outputPath = path.resolve(CONTENT_DIR, `${slug}.json`);
            await fs.writeFile(outputPath, JSON.stringify(rawDeckContent, null, 2), 'utf-8');
            sendEvent({ type: 'progress', message: '💾 JSON backup saved to disk' });

            // 2. Persist directly to Supabase (source of truth for Admin UI)
            sendEvent({ type: 'progress', message: '🌱 Saving to database...' });
            await saveEditionToSupabase(rawDeckContent);

            // 3. Regenerate decks.ts for runtime client
            triggerDeckSync();

            console.log(`✅ Edition saved: ${slug} (${parsed.cards.length} cards) → DB + disk`);
            sendEvent({ type: 'progress', message: '✅ Edition saved to database successfully' });

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

        // ── Generate frame via Gemini ────────────────────────
        if (req.url === '/__cms__/generate-frame' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY not set in root .env' }));
            return;
          }

          try {
            const body = await readBody(req);
            const { prompt, artDirectorPrompt, structuralConstraints, face, widthMm, heightMm, cardContent, edition, refinement, customVisualPrompt, customConstraints, enforceBorderless, layout, cardType } = JSON.parse(body);

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
                const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const flashRes = await fetch(flashUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: artDirectorPrompt }] }],
                    generationConfig: { temperature: 1.0, maxOutputTokens: 400 },
                  }),
                });
                if (flashRes.ok) {
                  const flashData: any = await flashRes.json();
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
              const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
              
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
                  const rewriteData: any = await rewriteRes.json();
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

            // Content zone dimensions (for logging only)
            const topZoneMm = Math.round(h * 0.18);
            const bottomStartMm = Math.round(h * 0.82);

            // ── FRAME IMAGE PROMPT ────────────────────────────────────────
            // activePrompt: visual direction from Flash Art Director
            // activeConstraints: layout + forbidden rules (rebuilt dynamically if layout provided)

            // If the client sent layout + cardType, rebuild structural constraints server-side
            // so they always reflect the actual configuration (not stale client-built strings)
            let derivedConstraints = structuralConstraints || '';
            if (layout && typeof layout === 'object') {
              try {
                const { buildStructuralConstraints: buildSC } = await import(
                  path.resolve(__dirname, '../../packages/deck-engine/src/generator/template-prompts.ts') + '?t=' + Date.now()
                );
                
                let dynamicFields: string[] = [];
                if (cardContent && typeof cardContent === 'object') {
                  dynamicFields = Object.keys(cardContent).filter(k => 
                    !['back_image_url', 'back_image_versions', 'qr_url'].includes(k) && typeof cardContent[k] === 'string' && !!cardContent[k]
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
            const fullPrompt = [
              activePrompt,
              activeConstraints,
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

            const data: any = await response.json();
            const base64Data: string = data.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
              throw new Error('Imagen 4 no devolvió una imagen. Intentá de nuevo.');
            }

            const mimeType = 'image/png';
            const sizeKB = Math.round(base64Data.length * 0.75 / 1024);

            console.log(`\u2705 Frame generated: ${mimeType} (${sizeKB}KB)`);

            // ── MULTIMODAL TYPOGRAPHY & LAYOUT ENGINE (Gemini Vision) ────────────────────
            // Now that we have the generated image, we use Vision to analyze the safe margins
            let typographySuggestion: Record<string, any> | null = null;
            if (cardContent && typeof cardContent === 'object') {
              const deckLabel = edition?.label || 'Custom';
              const deckDescription = edition?.description || 'General purpose card deck.';
              const fieldDescriptions = (edition?.fields as Array<{label: string; description: string; typicalLength: string}> | undefined)
                ?.map(f => `  - ${f.label} (${f.typicalLength} text): ${f.description}`)
                .join('\n') || '';

              // Extract valid text fields to process
              const textKeys: string[] = [];
              const sampleTextLines: string[] = [];
              
              for (const key of Object.keys(cardContent || {})) {
                 if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) continue;
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
                `  - Use 'bold' or '700' for the main phrase when the image is energetic/bold`,
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
                `VECTOR CONTAINER DECORATION (CRITICAL):`,
                `Instead of forcing the image background to paint boxes, YOU must generate an SVG string for EACH text block to act as a sleek container or backdrop (e.g., a frosted glass rectangle, a sleek rounded pill, an elegant ribbon, or a minimalist border).`,
                `REQUIREMENTS FOR containerSvg:`,
                `- Must be pure SVG markup representing the shapes ONLY. Do NOT wrap it in an <svg> or </svg> tag! (We will inject it into an existing svg wrapper).`,
                `- Must use relative coordinates to stretch perfectly. For example: <rect width="100%" height="100%" rx="10" fill="rgba(0,0,0,0.4)" stroke="#d4af64" stroke-width="2"/>`,
                `- Design the container to match the deck's aesthetic. Use fills, strokes, or even simple paths that fit perfectly behind the text.`,
                `- If no container is needed (because the background is clear enough), generate a simple transparent invisible rect or an empty string.`,
                '',
                `Return ONLY a valid JSON object map that mirrors the keys of the dynamic text content provided. Example structure:`,
                `{"quote":{"fontSize":20,"fontFamily":"Playfair Display","fontWeight":"bold","lineHeight":1.15,"color":"#ecdba5","topPct":20,"heightPct":40,"leftPct":15,"widthPct":70,"containerSvg":"<rect width=\\"100%\\" height=\\"100%\\" rx=\\"8\\" fill=\\"rgba(0,0,0,0.6)\\"/>"},"description":{"fontSize":11,"fontFamily":"Lora","fontWeight":"regular","lineHeight":1.35,"color":"#fdfbf7","topPct":62,"heightPct":20,"leftPct":15,"widthPct":70,"containerSvg":""},"brand":{"color":"#fdfbf7"},"qrFgColor":"#fdfbf7","qrSizeMm":12,"focalPoints":[{"description":"Large crescent moon","xPct":70,"yPct":25,"sizePct":22}]}`
              ].filter(Boolean).join('\n');

              try {
                console.log(`\n👁️  [Vision Engine] Analyzing boundaries and computing typography...`);
                const geminiVisionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
                                topPct: { type: 'NUMBER' },
                                heightPct: { type: 'NUMBER' },
                                leftPct: { type: 'NUMBER' },
                                widthPct: { type: 'NUMBER' },
                                containerSvg: { type: 'STRING', description: 'Valid SVG string without enclosing <svg> tag that dynamically scales (width="100%" height="100%"). Background vectors/ribbons/boxes.' }
                              },
                              required: ['topPct', 'heightPct', 'leftPct', 'widthPct', 'containerSvg', 'fontSize', 'fontFamily', 'fontWeight', 'color']
                            };
                            return acc;
                          }, {} as Record<string, any>),
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
                  const textData: any = await textRes.json();
                  const rawText: string = textData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();
                  typographySuggestion = JSON.parse(jsonStr);
                  
                  // Resolve TTF
                  const fontFamilies = new Set<string>();
                  Object.values(typographySuggestion as any).forEach((v: any) => {
                    if (v && typeof v === 'object' && v.fontFamily) fontFamilies.add(v.fontFamily);
                  });
                  
                  const resolved: Record<string, string> = {};
                  for (const family of fontFamilies) {
                    const slug = family.toLowerCase().replace(/\s+/g, '-');
                    try {
                      const fRes = await fetch(`https://gwfh.mranftl.com/api/fonts/${slug}`);
                      if (fRes.ok) {
                        const fData: any = await fRes.json();
                        const regular = fData.variants?.find((v: any) => v.id === 'regular' || v.id === '400') || fData.variants?.[0];
                        if (regular && regular.ttf) {
                          resolved[family] = regular.ttf;
                        }
                      }
                    } catch (e) {
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
          } catch (err: any) {
            console.error('[generate-frame]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        if (req.url === '/__cms__/analyze-typography' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { dataUrl, w, h, edition, cardContent, remixInstruction, hiddenFields } = JSON.parse(body);
            
            if (!dataUrl) throw new Error('No image provided');
            
            let base64Data = '';
            if (dataUrl.startsWith('data:image')) {
               base64Data = dataUrl.split(',')[1] || dataUrl;
            } else if (dataUrl.startsWith('/')) {
               // Load from local file system if it is a local asset (e.g., from Library)
               const fs = await import('fs/promises');
               const path = await import('path');
               const filePath = path.resolve(__dirname, 'public', dataUrl.replace(/^\//, ''));
               const fileBuffer = await fs.readFile(filePath);
               base64Data = fileBuffer.toString('base64');
             } else if (dataUrl.startsWith('blob:')) {
               throw new Error('Received a blob: URL which is not readable server-side. The client must send the original data: URI instead.');
             } else {
               throw new Error('Unsupported image format for Vision analysis: must be a data URI or an absolute local path (/...)');
            }

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('Missing GEMINI_API_KEY — check your .env file');


            const deckLabel = edition?.label || 'Custom';
            const deckDescription = edition?.description || 'General purpose card deck.';
            const fieldDescriptions = (edition?.fields as Array<any> | undefined)
              ?.map(f => `  - ${f.label} (${f.typicalLength} text): ${f.description}`)
              .join('\n') || '';

            // Extract valid text fields to process
            const textKeys: string[] = [];
            const sampleTextLines: string[] = [];
            
            for (const key of Object.keys(cardContent || {})) {
               if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) continue;
               
               // Respect user UI visibility toggles! If they hid it in AdminTemplates, tell AI to skip it
               if (hiddenFields?.[key] === true) continue;
               
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
                `  - Use 'bold' or '700' for the main phrase when the image is energetic/bold`,
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
                `Return ONLY a valid JSON object map that mirrors the keys of the dynamic text content provided. Example structure:`,
                `{"quote":{"fontSize":20,"fontFamily":"Playfair Display","fontWeight":"bold","lineHeight":1.15,"color":"#ecdba5","topPct":20,"heightPct":40,"leftPct":15,"widthPct":70,"containerSvg":"<rect width=\\"100%\\" height=\\"100%\\" rx=\\"8\\" fill=\\"rgba(0,0,0,0.6)\\"/>"},"description":{"fontSize":11,"fontFamily":"Lora","fontWeight":"regular","lineHeight":1.35,"color":"#fdfbf7","topPct":62,"heightPct":20,"leftPct":15,"widthPct":70,"containerSvg":""},"brand":{"color":"#fdfbf7"},"qrFgColor":"#fdfbf7","qrSizeMm":12,"focalPoints":[{"description":"Large crescent moon","xPct":70,"yPct":25,"sizePct":22}]}`
            ].filter(Boolean).join('\n');

            console.log(`\n👁️  [Vision Engine] Standalone Typography Analysis...`);
            const geminiVisionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
                  temperature: remixInstruction ? 1.2 : 0.2, 
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
                            topPct: { type: 'NUMBER' },
                            heightPct: { type: 'NUMBER' },
                            leftPct: { type: 'NUMBER' },
                            widthPct: { type: 'NUMBER' },
                            containerSvg: { type: 'STRING', description: 'Valid SVG string without enclosing <svg> tag that dynamically scales (width="100%" height="100%"). Background vectors/ribbons/boxes.' }
                          },
                          required: ['topPct', 'heightPct', 'leftPct', 'widthPct', 'containerSvg', 'fontSize', 'fontFamily', 'fontWeight', 'color']
                        };
                        return acc;
                      }, {} as Record<string, any>),
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
                }
              })
            });

            if (!textRes.ok) {
              const errDetails = await textRes.text();
              throw new Error(`Gemini Vision API Failed: ${errDetails.slice(0, 300)}`);
            }

            const textData = await textRes.json() as any;
            const finishReason = textData.candidates?.[0]?.finishReason;
            const rawText: string = textData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();
            
            let typographySuggestion: any;
            try {
              typographySuggestion = JSON.parse(jsonStr);
            } catch (parseErr) {
              console.error('[analyze-typography] JSON parse failed. finishReason:', finishReason, '\nRaw (first 300):', jsonStr.slice(0, 300));
              throw new Error(`La IA devolvio un JSON incompleto (finishReason: ${finishReason}). Intentá de nuevo.`);
            }


            // Resolve TTF
            const fontFamilies = new Set<string>();
            Object.values(typographySuggestion as any).forEach((v: any) => {
              if (v && typeof v === 'object' && v.fontFamily) fontFamilies.add(v.fontFamily);
            });
            const resolved: Record<string, string> = {};
            for (const family of fontFamilies) {
              const slug = family.toLowerCase().replace(/\s+/g, '-');
              try {
                const fRes = await fetch(`https://gwfh.mranftl.com/api/fonts/${slug}`);
                if (fRes.ok) {
                  const fData: any = await fRes.json();
                  const regular = fData.variants?.find((v: any) => v.id === 'regular' || v.id === '400') || fData.variants?.[0];
                  if (regular && regular.ttf) resolved[family] = regular.ttf;
                }
              } catch (e) { }
            }
            typographySuggestion.ttfUrls = resolved;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, typography: typographySuggestion }));
          } catch (err: any) {
            console.error('[analyze-typography]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Generate AI vector container ──
        if (req.url === '/__cms__/generate-ornament-svg' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const { shapePrompt, primaryColorHex } = JSON.parse(body);

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

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
            const resFetch = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 0.95, maxOutputTokens: 3000 }
              })
            });

            const aiData: any = await resFetch.json();
            if (!resFetch.ok) throw new Error(aiData.error?.message || 'Error generating SVG from Gemini');
            
            let rawSvg = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            // Sanitize markdown wrapping
            rawSvg = rawSvg.replace(/```xml\n?|```html\n?|```svg\n?|```\n?/gi, '').trim();

            // Sanitize the root <svg> tag: remove hardcoded width/height and force it to be 100% so pdfme can scale it
            rawSvg = rawSvg.replace(/^<svg([^>]+)>/i, (match, attrs) => {
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
          } catch (err: any) {
            console.error('[generate-ornament-svg]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Generate AI PNG container (Imagen) ──
        if (req.url === '/__cms__/generate-ornament-png' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY not set' }));
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
            const data: any = await response.json();
            const base64Data: string = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) {
              const errText = JSON.stringify(data).slice(0, 300);
              throw new Error(`Imagen 4 no devolvió una imagen: ${errText}`);
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, png: base64Data }));
          } catch(err: any) {
            console.error('[generate-ornament-png]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
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
              ? path.resolve(__dirname, `public/frames/${deckId}`)
              : path.resolve(__dirname, 'public/frames');
            await fs.mkdir(framesDir, { recursive: true });

            let ext = 'png';
            let finalBuffer: Buffer;

            if (dataUrl.startsWith('data:')) {
              const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (!matches) {
                throw new Error('Invalid base64 data URL format');
              }
              const mimeType = matches[1];
              ext = mimeType === 'image/png' ? 'png' : 'jpg';
              finalBuffer = Buffer.from(matches[2], 'base64');
            } else if (dataUrl.startsWith('/assets/')) {
              // Local path: /assets/frames/... -> public/assets/frames/...
              const srcPath = path.resolve(__dirname, 'public', dataUrl.replace(/^\//, ''));
              ext = srcPath.endsWith('.jpg') || srcPath.endsWith('.jpeg') ? 'jpg' : 'png';
              finalBuffer = await fs.readFile(srcPath);
            } else {
              throw new Error('Unsupported dataUrl format. Must be base64 or /assets/ path');
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
          } catch (err: any) {
            console.error('[set-frame]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
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
            } catch (e) {
              // File doesn't exist yet, it's fine
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, frames }));
          } catch (err: any) {
            console.error('[list-frames-library]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
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
            const destPath = path.resolve(__dirname, `public/assets/frames/${filename}`);
            
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            
            // Save Image
            await fs.writeFile(destPath, Buffer.from(base64Data, 'base64'));

            // Save Metadata to JSON
            const libraryPath = path.resolve(CONTENT_DIR, 'frames_library.json');
            let frames = [];
            try {
              const content = await fs.readFile(libraryPath, 'utf-8');
              frames = JSON.parse(content);
            } catch (e) {
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
          } catch (err: any) {
            console.error('[save-frame-library]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Generate frame prompt ideas via Gemini Flash ──────────────────
        if (req.url === '/__cms__/generate-frame-ideas' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY not set' }));
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

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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

            const geminiData: any = await geminiRes.json();
            const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            const jsonStr = rawText.replace(/```json\n?|```\n?/g, '').trim();
            const ideas = JSON.parse(jsonStr);

            console.log(`💡 Generated ${ideas.length} frame ideas`);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ideas }));
          } catch (err: any) {
            console.error('[generate-frame-ideas]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
        }

        // ── Generate full card back image via Imagen 4 (Flujo B) ──────────
        if (req.url === '/__cms__/generate-card-image' && req.method === 'POST') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'GEMINI_API_KEY not set' }));
            return;
          }

          try {
            const body = await readBody(req);
            const { deckId, cardId, force } = JSON.parse(body);

            if (!deckId || !cardId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'deckId and cardId are required' }));
              return;
            }

            // Load deck JSON
            const contentDir = path.resolve(__dirname, '../../packages/deck-engine/src/content');
            const deckFile = path.resolve(contentDir, `${deckId}.json`);
            const deckRaw = JSON.parse(await fs.readFile(deckFile, 'utf-8'));

            const card = deckRaw.cards?.find((c: any) => c.id === cardId);
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
            const { when_to_use, phrase, instruction, answer, fun_fact } = card.back;
            const cardNumber = String(card.front.number).padStart(2, '0');
            const cardTitle = card.front.title || '';

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
              `In the CENTER (large elegant serif font, white, centered, 2-4 lines max):`,
              `  "${phrase}"`,
              ``,
              `Below the phrase (small, readable body text, light gray, centered):`,
              instruction ? `  "${instruction}"` : `  (no instruction)`,
              answer ? `Below instruction (very small, muted): "Rta: ${answer}"` : '',
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

            const data: any = await response.json();
            const base64Data: string = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) throw new Error('Imagen 4 did not return an image.');

            // Save PNG to public/assets/editions/{slug}/
            const editionsDir = path.resolve(__dirname, 'public/assets/editions', deckSlug);
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
          } catch (err: any) {
            console.error('[generate-card-image]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
          }
          return;
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
