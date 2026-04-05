-- Baraja.cards — D1 Database Schema
-- Migration: 0001_initial

-- Email leads captured from landing pages (all editions)
CREATE TABLE IF NOT EXISTS baraja_leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  edition    TEXT,       -- which edition subdomain captured this lead (e.g. 'stoica')
  source     TEXT DEFAULT 'landing',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Orders (stub — activated in Phase 2 when Stripe is wired up)
CREATE TABLE IF NOT EXISTS baraja_orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id  TEXT NOT NULL UNIQUE,
  customer_email     TEXT NOT NULL,
  customer_name      TEXT,
  shipping_address   TEXT,  -- JSON blob
  shipping_zone      TEXT,  -- CABA | AMBA | INTERIOR | INTERNATIONAL
  deck_id            TEXT NOT NULL,
  edition            TEXT NOT NULL,
  quantity           INTEGER DEFAULT 1,
  amount_total       INTEGER, -- in cents
  currency           TEXT DEFAULT 'ars',
  status             TEXT DEFAULT 'pending',
  print_file_key     TEXT,   -- R2 object key of the generated PDF
  print_provider     TEXT,   -- local | gelato | manual
  tracking_number    TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON baraja_leads(email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON baraja_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_edition ON baraja_orders(edition);
