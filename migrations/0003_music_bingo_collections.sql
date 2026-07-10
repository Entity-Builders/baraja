-- Baraja.cards — Music bingo catalog cache
-- Migration: 0003_music_bingo_collections

CREATE TABLE IF NOT EXISTS baraja_music_bingo_collections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  spotify_playlist_id TEXT,
  spotify_url TEXT,
  cover_image_url TEXT,
  market TEXT NOT NULL DEFAULT 'AR',
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'published',
  category_id TEXT NOT NULL DEFAULT 'pop',
  category_label TEXT NOT NULL DEFAULT 'Pop',
  genre_label TEXT NOT NULL DEFAULT '',
  energy_label TEXT NOT NULL DEFAULT '',
  decade_label TEXT,
  use_case_label TEXT NOT NULL DEFAULT '',
  occasion_labels TEXT NOT NULL DEFAULT '[]',
  supported_board_sizes TEXT NOT NULL DEFAULT '[3,4,5]',
  search_terms TEXT NOT NULL DEFAULT '[]',
  tracks_json TEXT NOT NULL DEFAULT '[]',
  song_count INTEGER NOT NULL DEFAULT 0,
  minimum_song_count INTEGER NOT NULL DEFAULT 0,
  target_song_count INTEGER NOT NULL DEFAULT 0,
  seeded_song_count INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 100,
  source TEXT NOT NULL DEFAULT 'spotify-seed',
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_baraja_music_bingo_collections_status
  ON baraja_music_bingo_collections(status, sort_order, title);

CREATE INDEX IF NOT EXISTS idx_baraja_music_bingo_collections_category
  ON baraja_music_bingo_collections(category_id, status);

CREATE INDEX IF NOT EXISTS idx_baraja_music_bingo_collections_spotify_playlist
  ON baraja_music_bingo_collections(spotify_playlist_id);
