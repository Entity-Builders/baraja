---
name: baraja-edition-landing
description: Design and build conversion-focused product landing pages for Baraja.cards editions (e.g. Cable a Tierra). Use when creating or updating an edition landing page, writing copy, structuring the sales flow, or deciding what sections to include. Covers tone, layout structure, copy principles, and CTA strategy for the Baraja product line.
---

# Baraja Edition Landing Pages

## 1. PHILOSOPHY

A Baraja edition landing is a **product page, not a marketing page**.

The visitor already has intent (they clicked a link or typed the URL). The job of the page is to:
1. Make them feel the product
2. Remove friction to purchase
3. Give them one clear action to take

**What it is NOT:**
- A brand manifesto
- A blog post about print specs
- An explainer of the on-demand model

## 2. PAGE STRUCTURE (in order)

### A. HERO — Above the fold
- **Product name** (large, serif, dominant)
- **One-line emotional hook** — not a description, a feeling
- **Primary CTA** — "Quiero el mazo" / "Avisame" / "Comprarlo" 
- **Product visual** — cards shown, not described

**Rules:**
- No mention of paper, printing, or logistics in the hero
- The CTA must be visible without scrolling
- The hook must answer: "what does this DO for me?"

### B. THE CARDS — What's inside
- Show 3–5 real cards (interactive flip)
- Each card shows the PHRASE + INSTRUCTION
- No explanation needed — the cards sell themselves
- "30 cartas · Una por día" — that's all the context needed

### C. WHY THIS — 3 benefits max
Short, punchy, benefit-first. Format:
```
🧲  Una carta por día
    No requiere rutina, app, ni compromiso. Solo agarrás una carta.

💬  Frases que no escuchaste mil veces
    Sin clichés de autoayuda. Sin pastel. Solo verdad.

📦  Llega a tu puerta
    Impreso localmente. En tus manos en días.
```

### D. PRICE + CTA
- **Price prominent** — don't hide it
- For pre-order: email capture as primary action
- For live product: "Comprarlo" → Stripe
- Urgency if available (limited run, launch date)

### E. FAQ — 3 questions max
Only answer the questions that kill the sale:
- "¿Cuándo llega?" 
- "¿Puedo regalarlo?"
- "¿Es recurrente o pago una vez?"

### F. FOOTER
Edition name · Baraja.cards · back to catalog

## 3. COPY PRINCIPLES

**Tone:** Like a friend who tells you the truth. Not a brand. Not an influencer.

| ❌ No | ✅ Sí |
|---|---|
| "Transformá tu vida con estas cartas" | "Una carta by día. Sin app, sin rutina." |
| "Premium artisanal handcrafted..." | "Papel 350g. Se nota en la mano." |
| "Join thousands of..." | "30 cartas. Un mes. Vos." |
| Emojis in every bullet | No emojis or 1 max |
| "¡Compralo YA!" | "Quiero el mazo" |

**CTA copy:**
- Pre-order: "Avisame del lanzamiento" / "Reservar mi mazo"
- Live: "Quiero el mazo" / "Comprarlo" 
- Avoid: "Shop Now", "Buy Now", "Add to Cart" (too generic)

## 4. WHAT TO NEVER INCLUDE

- Description of the print process or paper specs in the hero
- Mention of Cloudflare, D1, R2, or any tech stack
- "Entity Builders" branding (footer only, subtle)
- More than one primary CTA per section
- Stock photos or placeholder images
- Auto-playing anything

## 5. SECTION MAPPING TO CODE

```
apps/baraja/src/editions/{edition-slug}/index.tsx

Sections (in order):
  <Navbar />          → back to baraja.cards, one CTA button
  <Hero />            → name + hook + CTA + card visual
  <CardShowcase />    → interactive flip cards (real deck data)
  <WhyThis />         → 3 benefits
  <PriceCTA />        → price + primary action (email or Stripe)
  <FAQ />             → 3 questions
  <Footer />          → edition · baraja.cards
```

## 6. DATA SOURCE

Always import deck data from `@eb-packages/deck-engine`:

```typescript
import { DECKS } from '@eb-packages/deck-engine';
const deck = DECKS['cable-a-tierra']; // or whatever the edition slug is

// Show real cards — never hardcode content
const showcaseCards = deck.cards.slice(0, 4);
```

## 7. LEAD CAPTURE (Pre-Stripe)

```typescript
// API endpoint: POST /api/leads
// Body: { email: string, edition: string }
// edition must match the deck slug from deck-engine

fetch('/api/leads', {
  method: 'POST',  
  body: JSON.stringify({ email, edition: 'cable-a-tierra' })
})
```

## 8. WHEN STRIPE IS READY

Replace the email capture section with:
- Price display: `deck.pricing.amount / 100` in ARS
- "Quiero el mazo" → Stripe Checkout session via Worker
- Worker endpoint: `POST /api/checkout` with `{ edition, deck_id }`

## 9. REFERENCE INSPIRATIONS

- **Daily Stoic Store** (store.dailystoic.com) — premium physical product, copy-first
- **We're Not Really Strangers** — emotional hook, card-forward design
- **Headspace** — benefit-first, no feature dumping
