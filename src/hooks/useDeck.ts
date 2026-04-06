// ============================================================
// useDeck — Fetch a single deck from Supabase and resolve it
// ============================================================

import { useState, useEffect } from 'react';
import { resolveDeck } from '@eb-packages/deck-engine';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { SupabaseDeckRepository } from '../lib/deckRepository';

const repo = new SupabaseDeckRepository();

interface UseDeckResult {
  deck: DeckSchema | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDeck(deckId: string | undefined): UseDeckResult {
  const [deck, setDeck] = useState<DeckSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchDeck(isBackgroundRefetch = false) {
    if (!deckId) {
      setLoading(false);
      setError('No deck ID provided');
      return;
    }

    if (!isBackgroundRefetch) setLoading(true);
    setError(null);

    repo.getDeckById(deckId)
      .then((raw) => {
        if (!raw) {
          setError(`Deck "${deckId}" not found`);
          setDeck(null);
        } else {
          const resolved = resolveDeck(raw);
          setDeck(resolved);
        }
      })
      .catch((err) => {
        console.error('[useDeck]', err);
        setError(String(err));
      })
      .finally(() => {
        if (!isBackgroundRefetch) setLoading(false);
      });
  }

  useEffect(() => {
    fetchDeck();
    
    // Listen for template updates from other components/tabs
    const channel = new BroadcastChannel('baraja_template_updates');
    channel.onmessage = (event) => {
      if (event.data?.type === 'TEMPLATE_UPDATED') {
        fetchDeck(true); // background fetch to prevent UI flicker
      }
    };

    return () => {
      channel.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  return { deck, loading, error, refetch: () => fetchDeck() };
}
