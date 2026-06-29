// ============================================================
// Baraja.cards — Cloudflare Worker
// Handles API routes + serves the SPA via ASSETS binding.
// ============================================================

/// <reference types="@cloudflare/workers-types" />

interface Env {
  ASSETS: { fetch: typeof fetch };
  DB: D1Database;
  PRINT_FILES: R2Bucket;
  BARAJA_ADMIN_EMAIL?: string;
  BARAJA_ADMIN_PASSWORD?: string;
  BARAJA_ADMIN_SESSION_SECRET?: string;
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

type BarajaCfProperties = Request['cf'];

interface SeoEditionRow {
  name?: string;
  description?: string;
  landing_config?: {
    hero?: {
      titleHtml?: string;
      subtitle?: string;
    };
  };
}

function getVibeContext(cf: BarajaCfProperties) {
  let timeOfDay = 'day';
  let season = 'spring';

  try {
    const tz = typeof cf?.timezone === 'string'
      ? cf.timezone
      : 'America/Argentina/Buenos_Aires';
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
    const latitude = typeof cf?.latitude === 'number'
      ? cf.latitude
      : Number.parseFloat(String(cf?.latitude ?? -34));
    const isNorth = Number.isFinite(latitude) ? latitude >= 0 : false;
    
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
    city: typeof cf?.city === 'string' ? cf.city : 'Unknown',
  };
}

async function rewriteHtmlForSeo(request: Request, response: Response, slug: string, env: Env): Promise<Response> {
  const supabaseUrl = env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || '';

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
    const data = await res.json() as SeoEditionRow[];
    if (!data || data.length === 0) return response;

    const edition = data[0];
    const config = edition.landing_config || {};
    
    const title = config.hero?.titleHtml
      ? config.hero.titleHtml.replace(/<[^>]+>/g, ' ')
      : edition.name || 'Baraja';
    const description = config.hero?.subtitle || edition.description || '';

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

const ADMIN_SESSION_COOKIE = 'baraja_admin_session';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 10;

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

  return jsonResponse({ error: 'Not found' }, 404);
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
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
