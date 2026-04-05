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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── API routes ────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env);
    }

    // ── SPA fallback ──────────────────────────────────────────
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status !== 404) return assetRes;

    // Client-side routing: serve index.html for unknown paths
    return env.ASSETS.fetch(new Request(new URL('/', url.origin), request));
  },
};

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
