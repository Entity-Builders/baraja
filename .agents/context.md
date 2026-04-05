---
description: Baraja project context, brand identity, architecture, editions model, and Entity Builders universe integration
---

# Baraja — Project Context

## 1. IDENTITY & NARRATIVE HIERARCHY

```
Entity Builders (the studio)
  └── Baraja (la fábrica de cartas)
        ├── Edición: Stoica       → stoica.baraja.cards
        ├── Edición: Trivia Night → trivia-night.baraja.cards  (próximamente)
        └── Edición: Entre Dos   → entre-dos.baraja.cards      (próximamente)
```

### Entity Builders
- El **studio** detrás de Baraja. Aparece solo en créditos de footer.

### Baraja
- **Dominio:** `baraja.cards`
- **Tagline:** *"Sabiduría que podés sostener."*
- **Rol:** La fábrica pública de cartas. Es una editorial de cartas físicas.
- **Modelo:** On-demand, local-first. No hay stock. Cada pedido se imprime localmente.
- **Voz:** Sobria, directa, premium. Habla en plural ("hacemos", "imprimimos").
- **Qué NO es:** Una tienda de regalos genérica. Es una marca de estilo de vida con filosofía clara.

### Las Ediciones
- Cada edición es un **producto independiente** con su propia identidad visual, landing, y dominio.
- Comparten el mismo engine de producción (PDF + impresión + envío).
- El cliente ve la edición, no la fábrica.

---

## 2. MODELO DE PRODUCCIÓN

**Local-first, on demand:**

1. Cliente compra en `stoica.baraja.cards` (Stripe Checkout)
2. Webhook dispara el Worker de Cloudflare
3. Worker genera PDF print-ready a partir del deck schema (300dpi, CMYK)
4. PDF se guarda en R2 (`baraja-print-files`)
5. Worker detecta zona de envío y rutea:
   - `CABA` → Imprenta local (email automatizado con PDF)
   - `AMBA/INTERIOR` → Imprenta local o mensajería
   - `INTERNATIONAL` → Gelato API (future)

**Specs de impresión estándar para todas las ediciones:**
- Papel: 350g
- Acabado: Laminado Mate
- Esquinas: Redondeadas
- Dimensiones: 88mm × 138mm (tamaño carta estándar)
- Bleed: 3mm
- Perfil de color: CMYK

---

## 3. TECH STACK

| Capa | Tecnología |
|---|---|
| **Frontend** | Vite + React 19 + Vanilla CSS |
| **Worker / API** | Cloudflare Workers (src/worker.ts) |
| **Base de datos** | Cloudflare D1 (SQLite) — `baraja-db` |
| **Storage PDFs** | Cloudflare R2 — `baraja-print-files` |
| **Deploy** | Cloudflare Pages + Workers |
| **Pagos** | Stripe (Phase 2) |
| **Shared logic** | `@eb-packages/deck-engine` |

**Comandos clave:**
```bash
yarn start:baraja                 # Dev local (desde raíz del monorepo)
yarn deploy:prod                  # Deploy a Cloudflare
yarn db:migrate                   # Aplica migrations a D1 local
yarn db:migrate:remote            # Aplica migrations a D1 en Cloudflare
```

**Secrets (Cloudflare, no .env):**
```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
```
Para dev local, crear `.dev.vars` (no commitear).

---

## 4. BASE DE DATOS (D1)

**Database:** `baraja-db` (ID: `1be18d08-7120-4df6-9892-bfd1938aa37c`)

| Tabla | Descripción |
|---|---|
| `baraja_leads` | Emails capturados desde todas las landings |
| `baraja_orders` | Órdenes de todas las ediciones |

Columna `edition` en ambas tablas para filtrar por producto.

---

## 5. DECK ENGINE (`@eb-packages/deck-engine`)

El motor invisible. Vive en `packages/deck-engine/`.

**Tipos principales:**
- `Card` — Una carta individual (front: quote, back: ejercicio)
- `DeckSchema` — Un mazo completo con diseño, specs de impresión y precios
- `Edition` — Una edición con sus mazos y branding
- `DeckOrder` — Un pedido con su estado y ruteo

**Regla:** Toda lógica de negocio (PDF, Stripe, routing) va al package, no a los apps.

---

## 6. EDICIONES

### 🏛️ Stoica (`apps/stoica` → `stoica.baraja.cards`)
- **Status:** Primera edición — en desarrollo
- **Contenido:** 30 cartas de filosofía estoica (Marco Aurelio, Epicteto, Séneca)
- **Idioma:** Español
- **Target:** Mercado hispanohablante
- **Categorías:** Reflexión (10), Ejercicio (8), Visualización (6), Diario (6)
- **Diferenciación vs. Daily Stoic:** Local, en español, sin envío internacional
- **Extra:** Código QR en cada carta → audio de meditación guiada (fase futura)

### 🎲 Trivia Night (`apps/trivia-night` → `trivia-night.baraja.cards`)
- **Status:** Próximamente
- **Contenido:** 60 preguntas de cultura general, historia, curiosidades
- **Target:** Grupos, noches de juego

### 💕 Entre Dos (`apps/entre-dos` → `entre-dos.baraja.cards`)
- **Status:** Próximamente
- **Contenido:** 52 preguntas y desafíos para parejas
- **Target:** Parejas que quieren conectar

---

## 7. API ROUTES (Worker)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/leads` | Captura email de landing. Body: `{ email, edition }` |
| `POST` | `/api/webhook/stripe` | Webhook de Stripe para procesar compras (Phase 2) |

---

## 8. INFRAESTRUCTURA CLOUDFLARE

| Recurso | Nombre | Binding |
|---|---|---|
| D1 Database | `baraja-db` | `env.DB` |
| R2 Bucket | `baraja-print-files` | `env.PRINT_FILES` |
| Assets (SPA) | — | `env.ASSETS` |

**Rutas de producción en `wrangler.jsonc`:**
- `baraja.cards` → la fábrica principal
- `*.baraja.cards` → cualquier subdominio de edición

---

## 9. DISEÑO

**Paleta (baraja.cards — la fábrica):**
- Background: `#0c0b09` (negro cálido)
- Surface: `#141210`
- Gold accent: `#d4af64`
- Text: `#f0ebe0`
- Tipografía: `Cormorant Garamond` (serif, títulos) + `Inter` (body)

Cada edición tendrá su propia paleta. La fábrica usa negro/dorado como identidad maestra.

---

## 10. KEY FILES

```
apps/baraja/
├── src/
│   ├── App.tsx          # Landing page completa (Navbar, Hero, Editions, HowItWorks, LeadCapture, Footer)
│   ├── index.css        # Design system completo
│   ├── worker.ts        # Cloudflare Worker (API + SPA serving)
│   └── lib/             # (futuro: helpers de cliente)
├── migrations/
│   └── 0001_initial.sql # Schema D1: baraja_leads + baraja_orders
└── wrangler.jsonc        # Config Cloudflare: D1, R2, routes

packages/deck-engine/
├── src/
│   ├── index.ts         # Public API
│   └── types.ts         # Card, DeckSchema, Edition, DeckOrder, PrintSpecs
```
