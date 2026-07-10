// ============================================================
// Baraja.cards — Cloudflare Worker
// Handles API routes + serves the SPA via ASSETS binding.
// ============================================================

/// <reference types="@cloudflare/workers-types" />

import {
  createSpotifyPlaylistFromQueries,
  formatSpotifyTrackForMusicBingo,
  listSpotifyUserPlaylists,
  resolveSpotifyPlaylist,
  type SpotifyCredentials,
  type SpotifyPlaylistData,
} from '@eb-packages/spotify-service';

interface Env {
  ASSETS: { fetch: typeof fetch };
  DB: D1Database;
  PRINT_FILES: R2Bucket;
  BARAJA_ADMIN_EMAIL?: string;
  BARAJA_ADMIN_PASSWORD?: string;
  BARAJA_ADMIN_SESSION_SECRET?: string;
  BARAJA_SUPABASE_SERVICE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
  SPOTIFY_ACCESS_TOKEN?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_MARKET?: string;
  SPOTIFY_REDIRECT_URI?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
  SPOTIFY_SESSION_SECRET?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── API routes ────────────────────────────────────────────
    // Note: /__cms__/* routes are handled by Vite middleware in dev (not this worker).
    // They bypass the worker automatically since they don't start with /api/.
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env);
    }

    // ── QR Card Scan handler ──────────────────────────────────
    // URL schema: /c/{deck-slug}/{card-number}
    // Scanned from physical cards — redirects to the edition landing
    // with the card number as a query param so the UI can highlight it.
    const cardScanMatch = url.pathname.match(/^\/c\/([a-z0-9-]+)\/(\d+)$/);
    if (cardScanMatch) {
      return handleCardScan(cardScanMatch[1], parseInt(cardScanMatch[2], 10), url);
    }

    // ── SPA fallback ──────────────────────────────────────────
    let assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status === 404) {
      // Client-side routing: serve index.html for unknown paths
      assetRes = await env.ASSETS.fetch(new Request(new URL('/', url.origin), request));
    }

    // ── SEO & HTML Rewriting ──────────────────────────────────
    const contentType = assetRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const slug = getEditionSlugFromUrl(url);
      if (slug) {
        return rewriteHtmlForSeo(request, assetRes, slug, env);
      }
    }

    return assetRes;
  },
};

// ── Edition detection ─────────────────────────────────────────

function getEditionSlugFromUrl(url: URL): string | null {
  const parts = url.hostname.split('.');
  if (parts.length >= 3 && !['www', 'app'].includes(parts[0])) {
    return parts[0];
  }
  const editionParam = url.searchParams.get('edition');
  if (editionParam) return editionParam;
  return null;
}

// ── SEO Injection & Context ───────────────────────────────────

function getVibeContext(cf: unknown) {
  let timeOfDay = 'day';
  let season = 'spring';
  const cfRecord = isRecord(cf) ? cf : {};

  try {
    const timezone = cfRecord.timezone;
    const tz = typeof timezone === 'string' ? timezone : 'America/Argentina/Buenos_Aires';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(new Date()), 10);
    
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 20) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const month = new Date().getMonth(); // 0-11
    const rawLatitude = cfRecord.latitude;
    const latitude = typeof rawLatitude === 'number'
      ? rawLatitude
      : typeof rawLatitude === 'string'
        ? Number(rawLatitude)
        : -34;
    const isNorth = latitude >= 0;
    
    if (month >= 2 && month <= 4) {
      season = isNorth ? 'spring' : 'autumn';
    } else if (month >= 5 && month <= 7) {
      season = isNorth ? 'summer' : 'winter';
    } else if (month >= 8 && month <= 10) {
      season = isNorth ? 'autumn' : 'spring';
    } else {
      season = isNorth ? 'winter' : 'summer';
    }
  } catch (e) {
    console.warn('[getVibeContext] Error extracting context:', e);
  }

  return {
    timeOfDay,
    season,
    city: typeof cfRecord.city === 'string' ? cfRecord.city : 'Unknown',
  };
}

async function rewriteHtmlForSeo(request: Request, response: Response, slug: string, env: Env): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.BARAJA_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseKey) return response;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/editions?slug=eq.${slug}&select=name,description,landing_config`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept-Profile': 'baraja',
      }
    });

    if (!res.ok) return response;
    const data = await res.json() as unknown;
    if (!Array.isArray(data) || !isRecord(data[0])) return response;

    const edition = data[0];
    const config = isRecord(edition.landing_config) ? edition.landing_config : {};
    const hero = isRecord(config.hero) ? config.hero : {};
    const editionName = typeof edition.name === 'string' ? edition.name : slug;
    
    const title = typeof hero.titleHtml === 'string'
      ? hero.titleHtml.replace(/<[^>]+>/g, ' ')
      : editionName;
    const description = typeof hero.subtitle === 'string'
      ? hero.subtitle
      : typeof edition.description === 'string'
        ? edition.description
        : '';

    const vibeContext = getVibeContext(request.cf);

    const rewriter = new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent(`${title} | Baraja`, { html: false });
        }
      })
      .on('head', {
        element(element) {
          element.append(`<meta name="description" content="${description}">`, { html: true });
          element.append(`<meta property="og:title" content="${title} | Baraja">`, { html: true });
          element.append(`<meta property="og:description" content="${description}">`, { html: true });
          element.append(`<meta property="og:type" content="website">`, { html: true });
          element.append(`<script id="__VIBE_CONTEXT__">window.BARAJA_VIBE_CONTEXT = ${JSON.stringify(vibeContext)};</script>`, { html: true });
        }
      });

    return rewriter.transform(response);
  } catch (err) {
    console.error('[rewriteHtmlForSeo]', err);
    return response;
  }
}

// ── API Handler ───────────────────────────────────────────────

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  const { pathname } = url;

  if (pathname.startsWith('/api/admin/')) {
    return handleAdminApi(request, url, env);
  }

  // POST /api/leads — Email capture from landing page
  if (pathname === '/api/leads' && request.method === 'POST') {
    return handleLeadCapture(request, env);
  }

  // POST /api/webhook/stripe — Stripe payment webhook
  if (pathname === '/api/webhook/stripe' && request.method === 'POST') {
    return handleStripeWebhook(request, env);
  }

  if (pathname === '/api/music-bingo/catalog' && request.method === 'GET') {
    return handleMusicBingoCatalog(env);
  }

  if (pathname === '/api/spotify/auth/start' && request.method === 'GET') {
    return handleSpotifyAuthStart(request, env);
  }

  if (pathname === '/api/spotify/auth/callback' && request.method === 'GET') {
    return handleSpotifyAuthCallback(request, env);
  }

  if (pathname === '/api/spotify/session' && request.method === 'GET') {
    return handleSpotifySession(request, env);
  }

  if (pathname === '/api/spotify/me/playlists' && request.method === 'GET') {
    return handleSpotifyUserPlaylists(request, env);
  }

  if (pathname === '/api/spotify/playlist' && request.method === 'POST') {
    return handleSpotifyPlaylistImport(request, env);
  }

  if (pathname === '/api/spotify/seed-playlist' && request.method === 'POST') {
    return handleSpotifySeedPlaylist(request, env);
  }

  if (pathname === '/api/spotify-playlist' && request.method === 'GET') {
    return handleSpotifyPlaylistPreview(request, url, env);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Admin Auth ────────────────────────────────────────────────

interface AdminSessionPayload {
  exp: number;
  iat: number;
  sub: string;
}

interface AdminLoginPayload {
  email?: unknown;
  password?: unknown;
}

interface SupabaseAdminConfig {
  serviceKey: string;
  url: string;
}

export interface SpotifySeedQueryReport {
  submittedRowCount: number;
  normalizedQueryCount: number;
  ignoredRowCount: number;
  duplicateQueryCount: number;
  truncatedQueryCount: number;
  maxQueryCount: number;
}

export interface SpotifySeedQueryInput {
  queries: string[];
  report: SpotifySeedQueryReport;
}

const ADMIN_SESSION_COOKIE = 'baraja_admin_session';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 10;
const BARAJA_SUPABASE_SCHEMA = 'baraja';
const EDITION_UPDATE_COLUMNS = new Set([
  'name',
  'description',
  'print_spec_id',
  'design_template_id',
  'print_specs_overrides',
  'design_template_overrides',
  'landing_config',
  'metadata',
  'pricing',
  'digital',
]);
const CARD_UPDATE_COLUMNS = new Set([
  'front',
  'back',
  'tags',
  'number',
]);

async function handleAdminApi(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    const session = await readAdminSession(request, env);
    return jsonResponse({
      authenticated: Boolean(session),
      email: session?.sub ?? null,
    });
  }

  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    return handleAdminLogin(request, url, env);
  }

  if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
    return jsonResponse(
      { authenticated: false },
      200,
      { 'Set-Cookie': buildAdminSessionCookie('', url, 0) },
    );
  }

  const session = await readAdminSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Admin session required' }, 401);
  }

  const adminDbResponse = await handleAdminDatabaseApi(request, url, env);
  if (adminDbResponse) {
    return adminDbResponse;
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function handleAdminDatabaseApi(request: Request, url: URL, env: Env): Promise<Response | null> {
  const editionMatch = url.pathname.match(/^\/api\/admin\/editions\/([^/]+)$/);
  if (editionMatch) {
    if (request.method !== 'PATCH') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    return updateAdminEdition(request, decodeURIComponent(editionMatch[1]), env);
  }

  const cardMatch = url.pathname.match(/^\/api\/admin\/editions\/([^/]+)\/cards\/([^/]+)$/);
  if (cardMatch) {
    if (request.method !== 'PATCH') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    return updateAdminCard(
      request,
      decodeURIComponent(cardMatch[1]),
      decodeURIComponent(cardMatch[2]),
      env,
    );
  }

  return null;
}

async function updateAdminEdition(request: Request, editionSlug: string, env: Env): Promise<Response> {
  const config = getSupabaseAdminConfig(env);
  if (!config) {
    return jsonResponse({ error: 'Supabase admin writes are not configured.' }, 503);
  }

  const payload = await readJsonRecord(request);
  const updates = pickAllowedUpdates(getUpdatesRecord(payload), EDITION_UPDATE_COLUMNS);
  if (!updates) {
    return jsonResponse({ error: 'No editable edition fields were provided.' }, 400);
  }

  const response = await supabaseAdminRequest(
    config,
    `editions?slug=eq.${encodePostgrestFilterValue(editionSlug)}`,
    {
      method: 'PATCH',
      headers: {
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(updates),
    },
  );

  return supabaseMutationResponse(response, 'Edition was not found.');
}

async function updateAdminCard(
  request: Request,
  editionSlug: string,
  cardId: string,
  env: Env,
): Promise<Response> {
  const config = getSupabaseAdminConfig(env);
  if (!config) {
    return jsonResponse({ error: 'Supabase admin writes are not configured.' }, 503);
  }

  const payload = await readJsonRecord(request);
  const updates = pickAllowedUpdates(getUpdatesRecord(payload), CARD_UPDATE_COLUMNS);
  if (!updates) {
    return jsonResponse({ error: 'No editable card fields were provided.' }, 400);
  }

  updates.edition_slug = editionSlug;
  const front = updates.front;
  if (isRecord(front) && typeof front.number === 'number') {
    updates.number = front.number;
  }

  const response = await supabaseAdminRequest(
    config,
    `cards?id=eq.${encodePostgrestFilterValue(cardId)}&edition_slug=eq.${encodePostgrestFilterValue(editionSlug)}`,
    {
      method: 'PATCH',
      headers: {
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(updates),
    },
  );

  return supabaseMutationResponse(response, 'Card was not found.');
}

function getSupabaseAdminConfig(env: Env): SupabaseAdminConfig | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.BARAJA_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceKey) {
    return null;
  }

  return { serviceKey, url };
}

async function supabaseAdminRequest(
  config: SupabaseAdminConfig,
  pathAndQuery: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', config.serviceKey);
  headers.set('Authorization', `Bearer ${config.serviceKey}`);
  headers.set('Accept-Profile', BARAJA_SUPABASE_SCHEMA);
  headers.set('Content-Profile', BARAJA_SUPABASE_SCHEMA);
  headers.set('Content-Type', 'application/json');

  return fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers,
  });
}

async function supabaseMutationResponse(response: Response, notFoundMessage: string): Promise<Response> {
  const body = await readResponseJson(response);
  if (!response.ok) {
    return jsonResponse({
      error: getSupabaseErrorMessage(body) || 'Supabase mutation failed.',
    }, response.status);
  }

  if (Array.isArray(body) && body.length === 0) {
    return jsonResponse({ error: notFoundMessage }, 404);
  }

  return jsonResponse({ success: true, data: body ?? null });
}

async function readJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload = await request.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function getUpdatesRecord(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  return isRecord(payload.updates) ? payload.updates : payload;
}

function pickAllowedUpdates(
  source: Record<string, unknown> | null,
  allowedColumns: Set<string>,
): Record<string, unknown> | null {
  if (!source) {
    return null;
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowedColumns.has(key)) {
      updates[key] = value;
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodePostgrestFilterValue(value: string): string {
  return encodeURIComponent(value);
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getSupabaseErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const message = body.message;
  const details = body.details;
  if (typeof message === 'string' && typeof details === 'string') {
    return `${message}: ${details}`;
  }
  if (typeof message === 'string') {
    return message;
  }

  return null;
}

async function handleAdminLogin(request: Request, url: URL, env: Env): Promise<Response> {
  const config = getAdminAuthConfig(env);

  if (!config.password || !config.secret) {
    return jsonResponse({ error: 'Admin login is not configured.' }, 503);
  }

  const payload = await readAdminLoginPayload(request);
  const email = normalizeAdminEmail(payload?.email);
  const password = typeof payload?.password === 'string' ? payload.password : '';
  const emailMatches = config.email ? email === config.email : Boolean(email);
  const passwordMatches = safeEqual(password, config.password);

  if (!emailMatches || !passwordMatches) {
    return jsonResponse({ error: 'Credenciales inválidas.' }, 401);
  }

  const token = await createAdminSessionToken(
    {
      sub: email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS,
    },
    config.secret,
  );

  return jsonResponse(
    { authenticated: true, email },
    200,
    { 'Set-Cookie': buildAdminSessionCookie(token, url, ADMIN_SESSION_MAX_AGE_SECONDS) },
  );
}

async function readAdminLoginPayload(request: Request): Promise<AdminLoginPayload | null> {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    return payload as AdminLoginPayload;
  } catch {
    return null;
  }
}

async function readAdminSession(request: Request, env: Env): Promise<AdminSessionPayload | null> {
  const config = getAdminAuthConfig(env);
  if (!config.secret) {
    return null;
  }

  const token = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token, config.secret);
}

function getAdminAuthConfig(env: Env) {
  const password = env.BARAJA_ADMIN_PASSWORD || '';
  const sessionSecret = env.BARAJA_ADMIN_SESSION_SECRET || password;
  const email = normalizeAdminEmail(env.BARAJA_ADMIN_EMAIL);

  return {
    email: email || null,
    password,
    secret: sessionSecret,
  };
}

function buildAdminSessionCookie(token: string, url: URL, maxAgeSeconds: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const value = token ? `${ADMIN_SESSION_COOKIE}=${token}` : `${ADMIN_SESSION_COOKIE}=`;
  return `${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return rawValue.join('=') || null;
    }
  }

  return null;
}

async function createAdminSessionToken(
  payload: AdminSessionPayload,
  secret: string,
): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signAdminValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifyAdminSessionToken(
  token: string,
  secret: string,
): Promise<AdminSessionPayload | null> {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signAdminValue(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function signAdminValue(value: string, secret: string): Promise<string> {
  return signWorkerValue(value, secret);
}

async function signWorkerValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64EncodeUtf8(value: string): string {
  let binary = '';
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

function base64UrlDecodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeAdminEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

// ── Lead Capture ──────────────────────────────────────────────

async function handleLeadCapture(request: Request, env: Env): Promise<Response> {
  try {
    const { email, edition } = await request.json() as { email: string; edition?: string };

    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Invalid email' }, 400);
    }

    await env.DB.prepare(
      'INSERT OR IGNORE INTO baraja_leads (email, edition) VALUES (?, ?)'
    ).bind(email, edition ?? null).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[/api/leads]', err);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

// ── Stripe Webhook ────────────────────────────────────────────

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  void request;
  void env;
  // TODO: Phase 2 — verify Stripe signature, create order, trigger PDF generation
  console.log('[/api/webhook/stripe] received — stub, not yet implemented');
  return jsonResponse({ received: true });
}

// ── Music Bingo Catalog ───────────────────────────────────────

async function handleMusicBingoCatalog(env: Env): Promise<Response> {
  try {
    const result = await env.DB.prepare(
      `SELECT
        id,
        title,
        description,
        spotify_playlist_id,
        spotify_url,
        cover_image_url,
        market,
        visibility,
        status,
        category_id,
        category_label,
        genre_label,
        energy_label,
        decade_label,
        use_case_label,
        occasion_labels,
        supported_board_sizes,
        search_terms,
        tracks_json,
        song_count,
        minimum_song_count,
        target_song_count,
        seeded_song_count,
        synced_at
      FROM baraja_music_bingo_collections
      WHERE status = 'published'
      ORDER BY sort_order ASC, title ASC`
    ).all<MusicBingoCatalogCollectionRow>();

    return jsonResponse({
      ok: true,
      source: 'd1',
      collections: (result.results ?? []).map(normalizeMusicBingoCatalogCollectionRow),
    });
  } catch (error) {
    console.warn('[music_bingo.catalog]', error instanceof Error ? error.message : error);
    return jsonResponse({
      ok: true,
      source: 'empty',
      collections: [],
    });
  }
}

function normalizeMusicBingoCatalogCollectionRow(row: MusicBingoCatalogCollectionRow) {
  const tracks = parseJsonArray(row.tracks_json).filter(isMusicBingoCatalogTrack);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    spotifyPlaylistId: row.spotify_playlist_id,
    spotifyUrl: row.spotify_url,
    coverImageUrl: row.cover_image_url,
    market: row.market,
    visibility: row.visibility,
    categoryId: row.category_id,
    categoryLabel: row.category_label,
    genreLabel: row.genre_label,
    energyLabel: row.energy_label,
    decadeLabel: row.decade_label,
    useCaseLabel: row.use_case_label,
    occasionLabels: parseStringArray(row.occasion_labels),
    supportedBoardSizes: parseNumberArray(row.supported_board_sizes),
    searchTerms: parseStringArray(row.search_terms),
    tracks,
    songCount: row.song_count,
    minimumSongCount: row.minimum_song_count,
    targetSongCount: row.target_song_count,
    seededSongCount: row.seeded_song_count,
    syncedAt: row.synced_at,
  };
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === 'string');
}

function parseNumberArray(value: string): number[] {
  return parseJsonArray(value).filter((item): item is number => typeof item === 'number');
}

function isMusicBingoCatalogTrack(value: unknown): value is MusicBingoCatalogTrack {
  return (
    isRecord(value) &&
    (typeof value.id === 'string' || value.id === null) &&
    typeof value.title === 'string' &&
    typeof value.artistDisplayName === 'string' &&
    (typeof value.imageUrl === 'string' || value.imageUrl === null) &&
    (typeof value.spotifyUrl === 'string' || value.spotifyUrl === null)
  );
}

// ── Spotify OAuth + Playlist Import ───────────────────────────

interface SpotifyAuthStatePayload {
  exp: number;
  iat: number;
  nonce: string;
  returnTo: string;
}

interface SpotifyConnectionPayload {
  accessToken?: string;
  expiresAt?: number;
  iat: number;
  refreshToken?: string;
  scope?: string;
}

interface SpotifyOAuthTokenResponse {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

interface SpotifyImportAuthStatus {
  connected: boolean;
  attempted: boolean;
  fallbackReason?: string;
  fallbackStatus?: number;
}

interface MusicBingoCatalogTrack {
  id: string | null;
  title: string;
  artistDisplayName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

interface MusicBingoCatalogCollectionRow {
  id: string;
  title: string;
  description: string;
  spotify_playlist_id: string | null;
  spotify_url: string | null;
  cover_image_url: string | null;
  market: string;
  visibility: string;
  status: string;
  category_id: string;
  category_label: string;
  genre_label: string;
  energy_label: string;
  decade_label: string | null;
  use_case_label: string;
  occasion_labels: string;
  supported_board_sizes: string;
  search_terms: string;
  tracks_json: string;
  song_count: number;
  minimum_song_count: number;
  target_song_count: number;
  seeded_song_count: number | null;
  synced_at: string | null;
}

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_AUTH_STATE_MAX_AGE_SECONDS = 60 * 10;
const SPOTIFY_CONNECTION_COOKIE = 'baraja_spotify_connection';
const SPOTIFY_CONNECTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const SPOTIFY_READ_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
];
export const SPOTIFY_WRITE_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
];
const SPOTIFY_OAUTH_SCOPES = [
  ...SPOTIFY_READ_SCOPES,
  ...SPOTIFY_WRITE_SCOPES,
];

async function handleSpotifyAuthStart(request: Request, env: Env): Promise<Response> {
  const url = getPublicRequestUrl(request);
  const config = getSpotifyOAuthConfig(url, env);
  if (!config) {
    return jsonResponse({ error: 'Spotify OAuth is not configured.' }, 503);
  }

  const state = await createSpotifyAuthStateToken(
    {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SPOTIFY_AUTH_STATE_MAX_AGE_SECONDS,
      nonce: crypto.randomUUID(),
      returnTo: normalizeSpotifyReturnTo(url.searchParams.get('returnTo'), url),
    },
    config.sessionSecret,
  );
  const authorizationUrl = new URL(SPOTIFY_AUTHORIZE_URL);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('scope', SPOTIFY_OAUTH_SCOPES.join(' '));
  authorizationUrl.searchParams.set('state', state);

  return Response.redirect(authorizationUrl.toString(), 302);
}

async function handleSpotifyAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = getPublicRequestUrl(request);
  const config = getSpotifyOAuthConfig(url, env);
  const state = config
    ? await verifySpotifyAuthStateToken(url.searchParams.get('state') || '', config.sessionSecret)
    : null;
  const destination = buildSpotifyAuthReturnUrl(url, state?.returnTo ?? null);

  if (!config || !state) {
    destination.searchParams.set('spotify', 'error');
    return Response.redirect(destination.toString(), 302);
  }

  const providerError = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (providerError || !code) {
    destination.searchParams.set('spotify', providerError || 'error');
    return Response.redirect(destination.toString(), 302);
  }

  const tokenResult = await exchangeSpotifyAuthorizationCode(code, config);
  if (!tokenResult.ok) {
    destination.searchParams.set('spotify', 'error');
    return Response.redirect(destination.toString(), 302);
  }

  const cookieValue = await encryptSpotifyConnectionCookie(
    {
      accessToken: tokenResult.accessToken,
      expiresAt: tokenResult.expiresAt,
      iat: Math.floor(Date.now() / 1000),
      refreshToken: tokenResult.refreshToken,
      scope: tokenResult.scope,
    },
    config.sessionSecret,
  );
  destination.searchParams.set('spotify', 'connected');

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Set-Cookie': buildSpotifyConnectionCookie(
        cookieValue,
        url,
        SPOTIFY_CONNECTION_COOKIE_MAX_AGE_SECONDS,
      ),
    },
  });
}

async function handleSpotifySession(request: Request, env: Env): Promise<Response> {
  const url = getPublicRequestUrl(request);
  const config = getSpotifyOAuthConfig(url, env);
  const connection = config ? await readSpotifyConnectionCookie(request, config.sessionSecret) : null;

  return jsonResponse({
    configured: Boolean(config),
    connected: hasUsableSpotifyConnection(connection),
    scopes: connection?.scope ? connection.scope.split(' ') : [],
  });
}

async function handleSpotifyUserPlaylists(request: Request, env: Env): Promise<Response> {
  const visitorCredentials = await spotifyCredentialsFromRequest(request, env);
  if (!visitorCredentials) {
    return jsonResponse({
      ok: false,
      reason: 'not_connected',
      message: 'Conecta Spotify para ver tus playlists.',
    }, 401);
  }

  const url = new URL(request.url);
  const maxPlaylistsParam = Number(url.searchParams.get('maxPlaylists') || '250');
  const maxPlaylists = Number.isFinite(maxPlaylistsParam) ? maxPlaylistsParam : 250;
  const result = await listSpotifyUserPlaylists({
    credentials: visitorCredentials,
    maxPlaylists,
  });

  if (!result.ok) {
    return jsonResponse(result, result.status && result.status >= 400 ? result.status : 502);
  }

  return jsonResponse({
    ok: true,
    playlists: result.playlists,
  });
}

async function handleSpotifySeedPlaylist(request: Request, env: Env): Promise<Response> {
  const payload = await readJsonRecord(request);
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const description = typeof payload?.description === 'string' ? payload.description.trim() : undefined;
  const seedInput = buildSpotifySeedQueryInput(payload);
  const queries = seedInput.queries;

  if (!name) {
    return jsonResponse({
      ok: false,
      reason: 'invalid_request',
      message: 'La playlist necesita un nombre.',
      queryReport: seedInput.report,
    }, 400);
  }

  if (queries.length === 0) {
    return jsonResponse({
      ok: false,
      reason: 'invalid_request',
      message: 'Agrega canciones para crear la playlist.',
      queryReport: seedInput.report,
    }, 400);
  }

  const adminSession = await readAdminSession(request, env);
  if (!adminSession) {
    return jsonResponse({
      ok: false,
      reason: 'operator_required',
      message: 'Inicia sesion como operador Baraja para crear playlists oficiales.',
      queryReport: seedInput.report,
    }, 401);
  }

  const connectionContext = await spotifyConnectionContextFromRequest(request, env);
  if (!connectionContext) {
    return jsonResponse({
      ok: false,
      reason: 'not_connected',
      message: 'Conecta Spotify para crear playlists.',
      queryReport: seedInput.report,
    }, 401);
  }

  const missingScopes = getMissingSpotifyWriteScopes(connectionContext.scopes);
  if (missingScopes.length > 0) {
    return jsonResponse({
      ok: false,
      reason: 'missing_scopes',
      message: 'Volvé a conectar Spotify para permitir crear playlists.',
      missingScopes,
      queryReport: seedInput.report,
    }, 403);
  }

  const result = await createSpotifyPlaylistFromQueries({
    credentials: connectionContext.credentials,
    name,
    description,
    queries,
    dryRun: payload?.dryRun === true,
    isPublic: payload?.public === true || payload?.isPublic === true,
    market: env.SPOTIFY_MARKET,
    maxQueries: 200,
  });

  if (!result.ok) {
    return jsonResponse({
      ...result,
      queryReport: seedInput.report,
    }, result.status && result.status >= 400 ? result.status : 502);
  }

  return jsonResponse({
    ...result,
    queryReport: seedInput.report,
  });
}

async function handleSpotifyPlaylistImport(request: Request, env: Env): Promise<Response> {
  const payload = await readJsonRecord(request);
  const playlistUrl = typeof payload?.playlistUrl === 'string' ? payload.playlistUrl : '';
  const maxTracks = typeof payload?.maxTracks === 'number' ? payload.maxTracks : undefined;

  const visitorCredentials = await spotifyCredentialsFromRequest(request, env);
  const authStatus: SpotifyImportAuthStatus = {
    connected: Boolean(visitorCredentials),
    attempted: false,
  };
  if (visitorCredentials) {
    authStatus.attempted = true;
    const visitorResult = await resolveSpotifyPlaylist({
      playlistUrl,
      maxTracks,
      market: env.SPOTIFY_MARKET,
      credentials: visitorCredentials,
      allowPublicPageFallback: false,
    });

    if (visitorResult.ok) {
      return spotifyPlaylistImportResponse(visitorResult.playlist, authStatus);
    }

    authStatus.fallbackReason = visitorResult.reason;
    authStatus.fallbackStatus = visitorResult.status;
    console.warn('[spotify.playlist.import.visitor_fallback]', {
      reason: visitorResult.reason,
      status: visitorResult.status,
    });
  }

  const result = await resolveSpotifyPlaylist({
    playlistUrl,
    maxTracks,
    market: env.SPOTIFY_MARKET,
    credentials: spotifyCredentialsFromEnv(env),
  });

  if (!result.ok) {
    console.warn('[spotify.playlist.import]', {
      reason: result.reason,
      status: result.status,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return jsonResponse(result);
  }

  return spotifyPlaylistImportResponse(result.playlist, authStatus);
}

async function handleSpotifyPlaylistPreview(request: Request, url: URL, env: Env): Promise<Response> {
  const playlistUrl = url.searchParams.get('url') || url.searchParams.get('playlistUrl') || '';
  const maxTracksParam = Number(url.searchParams.get('maxTracks') || '500');
  const maxTracks = Number.isFinite(maxTracksParam) ? maxTracksParam : 500;

  const visitorCredentials = await spotifyCredentialsFromRequest(request, env);
  if (visitorCredentials) {
    const visitorResult = await resolveSpotifyPlaylist({
      playlistUrl,
      maxTracks,
      market: env.SPOTIFY_MARKET,
      credentials: visitorCredentials,
      allowPublicPageFallback: false,
    });

    if (visitorResult.ok) {
      return spotifyPlaylistPreviewResponse(visitorResult.playlist);
    }
  }

  const result = await resolveSpotifyPlaylist({
    playlistUrl,
    maxTracks,
    market: env.SPOTIFY_MARKET,
    credentials: spotifyCredentialsFromEnv(env),
  });

  if (!result.ok) {
    const status =
      result.reason === 'invalid_url'
        ? 400
        : result.status && result.status >= 400
          ? result.status
          : 502;
    return jsonResponse(
      {
        error: result.message,
        reason: result.reason,
        status: result.status,
      },
      status,
    );
  }

  return spotifyPlaylistPreviewResponse(result.playlist);
}

function spotifyPlaylistImportResponse(
  playlist: SpotifyPlaylistData,
  authStatus?: SpotifyImportAuthStatus,
): Response {
  return jsonResponse({
    ok: true,
    playlist,
    spotifyAuth: authStatus,
    musicBingoSongs: playlist.tracks.map(formatSpotifyTrackForMusicBingo),
  });
}

function spotifyPlaylistPreviewResponse(playlist: SpotifyPlaylistData): Response {
  return jsonResponse({
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    coverImageUrl: playlist.coverImageUrl,
    spotifyUrl: playlist.spotifyUrl,
    totalTracks: playlist.totalTracks,
    importedTrackCount: playlist.importedTrackCount,
    importSource: playlist.importSource,
    isPartial: playlist.isPartial,
    tracks: playlist.tracks.map((track) => ({
      id: track.id,
      name: track.title,
      artist: track.artistDisplayName,
      artists: track.artists,
      image: track.imageUrl,
      durationMs: track.durationMs,
      spotifyUrl: track.spotifyUrl,
    })),
  });
}

export function buildSpotifySeedQueryInput(
  payload: Record<string, unknown> | null,
  maxQueryCount = 200,
): SpotifySeedQueryInput {
  const maxQueries = Math.max(1, Math.floor(maxQueryCount));
  const report: SpotifySeedQueryReport = {
    submittedRowCount: 0,
    normalizedQueryCount: 0,
    ignoredRowCount: 0,
    duplicateQueryCount: 0,
    truncatedQueryCount: 0,
    maxQueryCount: maxQueries,
  };

  if (!payload) {
    return { queries: [], report };
  }

  const rawItems = getSpotifySeedRawItems(payload);
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    report.submittedRowCount += 1;
    const query = spotifySeedQueryFromItem(item);
    if (!query) {
      report.ignoredRowCount += 1;
      continue;
    }

    const dedupeKey = query.toLowerCase();
    if (seen.has(dedupeKey)) {
      report.duplicateQueryCount += 1;
      continue;
    }

    if (queries.length >= maxQueries) {
      report.truncatedQueryCount += 1;
      continue;
    }

    queries.push(query);
    seen.add(dedupeKey);
  }

  report.normalizedQueryCount = queries.length;

  return { queries, report };
}

function getSpotifySeedRawItems(payload: Record<string, unknown>): unknown[] {
  return [
    ...(Array.isArray(payload.queries) ? payload.queries : []),
    ...(Array.isArray(payload.songs) ? payload.songs : []),
    ...(typeof payload.songLines === 'string' ? payload.songLines.split(/\r?\n/) : []),
  ];
}

function spotifySeedQueryFromItem(item: unknown): string | null {
  if (typeof item === 'string') {
    const query = item.trim().replace(/\s+/g, ' ');
    return query || null;
  }

  if (!isRecord(item)) return null;

  const query = typeof item.query === 'string' ? item.query.trim().replace(/\s+/g, ' ') : '';
  if (query) return query;

  const artist = typeof item.artist === 'string' ? item.artist.trim() : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (artist && title) return `${artist} - ${title}`;
  if (title) return title;

  return null;
}

export function getMissingSpotifyWriteScopes(scopes: string[]): string[] {
  return SPOTIFY_WRITE_SCOPES.filter((scope) => !scopes.includes(scope));
}

async function spotifyConnectionContextFromRequest(
  request: Request,
  env: Env,
): Promise<{ credentials: SpotifyCredentials; scopes: string[] } | null> {
  const url = getPublicRequestUrl(request);
  const config = getSpotifyOAuthConfig(url, env);
  if (!config) return null;

  const connection = await readSpotifyConnectionCookie(request, config.sessionSecret);
  if (!hasUsableSpotifyConnection(connection)) return null;

  const credentials = spotifyCredentialsFromConnection(connection, config);
  if (!credentials) return null;

  return {
    credentials,
    scopes: connection?.scope ? connection.scope.split(/\s+/).filter(Boolean) : [],
  };
}

async function spotifyCredentialsFromRequest(
  request: Request,
  env: Env,
): Promise<SpotifyCredentials | null> {
  const connectionContext = await spotifyConnectionContextFromRequest(request, env);
  return connectionContext?.credentials ?? null;
}

function spotifyCredentialsFromConnection(
  connection: SpotifyConnectionPayload | null,
  config: NonNullable<ReturnType<typeof getSpotifyOAuthConfig>>,
): SpotifyCredentials | null {
  if (connection?.refreshToken) {
    return {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: connection.refreshToken,
    };
  }

  if (connection?.accessToken && (!connection.expiresAt || connection.expiresAt > Math.floor(Date.now() / 1000))) {
    return {
      accessToken: connection.accessToken,
    };
  }

  return null;
}

function hasUsableSpotifyConnection(connection: SpotifyConnectionPayload | null): boolean {
  if (!connection) return false;
  if (connection.refreshToken) return true;
  return Boolean(
    connection.accessToken &&
    (!connection.expiresAt || connection.expiresAt > Math.floor(Date.now() / 1000)),
  );
}

function spotifyCredentialsFromEnv(env: Env): SpotifyCredentials {
  return {
    accessToken: env.SPOTIFY_ACCESS_TOKEN,
    refreshToken: env.SPOTIFY_REFRESH_TOKEN,
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
  };
}

function getSpotifyOAuthConfig(url: URL, env: Env) {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim();
  const sessionSecret = (
    env.SPOTIFY_SESSION_SECRET ||
    env.BARAJA_ADMIN_SESSION_SECRET ||
    env.BARAJA_ADMIN_PASSWORD ||
    ''
  ).trim();

  if (!clientId || !clientSecret || !sessionSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: env.SPOTIFY_REDIRECT_URI?.trim() || new URL('/api/spotify/auth/callback', getSpotifyRedirectOrigin(url)).toString(),
    sessionSecret,
  };
}

function getPublicRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  const forwardedHost = firstForwardedValue(
    request.headers.get('X-Forwarded-Host') || getForwardedHeaderParam(request.headers, 'host'),
  );
  const forwardedProto = firstForwardedValue(
    request.headers.get('X-Forwarded-Proto') || getForwardedHeaderParam(request.headers, 'proto'),
  );

  if (forwardedHost) {
    url.host = forwardedHost;
  }

  if (forwardedProto === 'https' || forwardedProto === 'http') {
    url.protocol = `${forwardedProto}:`;
  } else if (url.protocol === 'http:' && url.hostname.endsWith('.ts.net')) {
    url.protocol = 'https:';
  }

  return url;
}

function firstForwardedValue(value: string | null): string | null {
  if (!value) return null;
  const firstValue = value.split(',')[0]?.trim().replace(/^"|"$/g, '');
  return firstValue || null;
}

function getForwardedHeaderParam(headers: Headers, key: string): string | null {
  const forwarded = headers.get('Forwarded');
  if (!forwarded) return null;

  const firstEntry = forwarded.split(',')[0];
  for (const part of firstEntry.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName.toLowerCase() === key) {
      return rawValue.join('=').trim();
    }
  }

  return null;
}

function getSpotifyRedirectOrigin(url: URL): string {
  if (url.hostname === 'localhost' || url.hostname === '0.0.0.0') {
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//127.0.0.1${port}`;
  }

  return url.origin;
}

function normalizeSpotifyReturnTo(value: string | null, requestUrl: URL): string {
  const fallback = '/bingo-musical/crear';
  if (!value) return fallback;

  try {
    if (value.startsWith('/') && !value.startsWith('//')) {
      return value.slice(0, 700);
    }

    const parsed = new URL(value);
    if (parsed.origin === requestUrl.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 700);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function buildSpotifyAuthReturnUrl(requestUrl: URL, returnTo: string | null): URL {
  return new URL(normalizeSpotifyReturnTo(returnTo, requestUrl), requestUrl.origin);
}

async function createSpotifyAuthStateToken(
  payload: SpotifyAuthStatePayload,
  secret: string,
): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signWorkerValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifySpotifyAuthStateToken(
  token: string,
  secret: string,
): Promise<SpotifyAuthStatePayload | null> {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await signWorkerValue(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SpotifyAuthStatePayload;
    if (
      !payload ||
      typeof payload.returnTo !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function exchangeSpotifyAuthorizationCode(
  code: string,
  config: NonNullable<ReturnType<typeof getSpotifyOAuthConfig>>,
): Promise<
  | {
      ok: true;
      accessToken: string;
      expiresAt: number | undefined;
      refreshToken: string | undefined;
      scope: string | undefined;
    }
  | { ok: false }
> {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', config.redirectUri);

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${base64EncodeUtf8(`${config.clientId}:${config.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const tokenBody = await readResponseJson(response) as SpotifyOAuthTokenResponse;
    if (!response.ok || typeof tokenBody.access_token !== 'string') {
      return { ok: false };
    }

    const expiresIn = typeof tokenBody.expires_in === 'number' ? tokenBody.expires_in : undefined;
    return {
      ok: true,
      accessToken: tokenBody.access_token,
      expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
      refreshToken: typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : undefined,
      scope: typeof tokenBody.scope === 'string' ? tokenBody.scope : undefined,
    };
  } catch {
    return { ok: false };
  }
}

async function readSpotifyConnectionCookie(
  request: Request,
  secret: string,
): Promise<SpotifyConnectionPayload | null> {
  const value = getCookieValue(request, SPOTIFY_CONNECTION_COOKIE);
  if (!value) return null;

  return decryptSpotifyConnectionCookie(value, secret);
}

function buildSpotifyConnectionCookie(value: string, url: URL, maxAgeSeconds: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const cookieValue = value ? `${SPOTIFY_CONNECTION_COOKIE}=${value}` : `${SPOTIFY_CONNECTION_COOKIE}=`;
  return `${cookieValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

async function encryptSpotifyConnectionCookie(
  payload: SpotifyConnectionPayload,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesGcmKey(secret);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedPayload);
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
}

async function decryptSpotifyConnectionCookie(
  value: string,
  secret: string,
): Promise<SpotifyConnectionPayload | null> {
  const [encodedIv, encodedPayload] = value.split('.');
  if (!encodedIv || !encodedPayload) return null;

  try {
    const iv = base64UrlDecodeBytes(encodedIv);
    const encryptedPayload = base64UrlDecodeBytes(encodedPayload);
    const key = await importAesGcmKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedPayload);
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as SpotifyConnectionPayload;

    if (
      !payload ||
      typeof payload.iat !== 'number' ||
      (payload.refreshToken !== undefined && typeof payload.refreshToken !== 'string') ||
      (payload.accessToken !== undefined && typeof payload.accessToken !== 'string') ||
      (payload.expiresAt !== undefined && typeof payload.expiresAt !== 'number') ||
      (payload.scope !== undefined && typeof payload.scope !== 'string')
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.iat + SPOTIFY_CONNECTION_COOKIE_MAX_AGE_SECONDS <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function importAesGcmKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ── Helpers ───────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

// ── QR Card Scan ──────────────────────────────────────────────
// Handles physical card scans.
// Redirects to the edition's landing page with the card number
// as a query param so the frontend can highlight / open that card.
//
// Example:  /c/rompelo/03  →  https://baraja.cards/?edition=rompelo&card=03
//           /c/barometro/12 →  https://barometro.baraja.cards/?card=12  (future subdomain)
//
function handleCardScan(slug: string, cardNumber: number, requestUrl: URL): Response {
  const paddedNumber = String(cardNumber).padStart(2, '0');
  const destination = new URL('/', requestUrl.origin);
  destination.searchParams.set('edition', slug);
  destination.searchParams.set('card', paddedNumber);

  return Response.redirect(destination.toString(), 302);
}
