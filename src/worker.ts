// ============================================================
// Baraja.cards — Cloudflare Worker
// Handles API routes + serves the SPA via ASSETS binding.
// ============================================================

/// <reference types="@cloudflare/workers-types" />

interface Env {
  ASSETS: { fetch: typeof fetch };
  DB: D1Database;
  PRINT_FILES: R2Bucket;
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

function getVibeContext(cf: any) {
  let timeOfDay = 'day';
  let season = 'spring';

  try {
    const tz = cf?.timezone || 'America/Argentina/Buenos_Aires';
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
    const isNorth = (cf?.latitude || -34) >= 0;
    
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

  return { timeOfDay, season, city: cf?.city || 'Unknown' };
}

async function rewriteHtmlForSeo(request: Request, response: Response, slug: string, env: Env): Promise<Response> {
  const supabaseUrl = env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseKey) return response;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/baraja_editions?slug=eq.${slug}&select=name,description,landing_config`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!res.ok) return response;
    const data = await res.json() as any[];
    if (!data || data.length === 0) return response;

    const edition = data[0];
    const config = edition.landing_config || {};
    
    const title = config.hero?.titleHtml ? config.hero.titleHtml.replace(/<[^>]+>/g, ' ') : edition.name;
    const description = config.hero?.subtitle || edition.description || '';

    const vibeContext = getVibeContext(request.cf);

    let rewriter = new HTMLRewriter()
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

async function handleStripeWebhook(_request: Request, _env: Env): Promise<Response> {
  // TODO: Phase 2 — verify Stripe signature, create order, trigger PDF generation
  console.log('[/api/webhook/stripe] received — stub, not yet implemented');
  return jsonResponse({ received: true });
}

// ── Helpers ───────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
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

