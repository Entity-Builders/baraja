// ============================================================
// useAllDecks — Fetch all decks from Supabase (resolved)
// ============================================================

import { useState, useEffect } from 'react';
import { resolveDeck } from '@eb-packages/deck-engine';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { SupabaseDeckRepository } from '../lib/deckRepository';

const repo = new SupabaseDeckRepository();

interface UseAllDecksResult {
  decks: Array<{ id: string; deck: DeckSchema }>;
  loading: boolean;
  error: string | null;
}

export function useAllDecks(): UseAllDecksResult {
  const [decks, setDecks] = useState<Array<{ id: string; deck: DeckSchema }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.getAllDecks()
      .then((rawDecks) => {
        const resolved = rawDecks.map((raw) => ({
          id: raw.slug || raw.id,
          deck: resolveDeck(raw),
        }));
        setDecks(resolved);
      })
      .catch((err) => {
        console.error('[useAllDecks]', err);
        setError('No se pudieron cargar los mazos. Revisá la conexión y volvé a intentar.');
      })
      .finally(() => setLoading(false));
  }, []);

  return { decks, loading, error };
}
