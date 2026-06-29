-- Baraja.cards — D1 deck catalog mirror
-- Migration: 0002_deck_catalog

CREATE TABLE IF NOT EXISTS baraja_editions (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  card_count INTEGER NOT NULL DEFAULT 0,
  print_spec_id TEXT NOT NULL,
  design_template_id TEXT NOT NULL,
  print_specs_overrides TEXT NOT NULL DEFAULT '{}',
  design_template_overrides TEXT NOT NULL DEFAULT '{}',
  landing_config TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  pricing TEXT NOT NULL DEFAULT '{}',
  digital TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'deck-engine',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS baraja_cards (
  id TEXT PRIMARY KEY,
  edition_slug TEXT NOT NULL,
  number INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'deck-engine',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (edition_slug) REFERENCES baraja_editions(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_baraja_cards_edition_slug
  ON baraja_cards(edition_slug);

CREATE INDEX IF NOT EXISTS idx_baraja_cards_edition_number
  ON baraja_cards(edition_slug, number);
