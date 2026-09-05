// ============================================================
// useDeck — Fetch a single deck from Supabase and resolve it
// ============================================================

import { useState, useEffect } from 'react';
import { DECKS, resolveDeck } from '@entity-builders/deck-engine';
import type { DeckSchema } from '@entity-builders/deck-engine';
import { SupabaseDeckRepository } from '../lib/deckRepository';

const repo = new SupabaseDeckRepository();
const localDecks = DECKS as Record<string, DeckSchema>;
const DECK_FETCH_TIMEOUT_MS = 4000;

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

  function getLocalDeckFallback(): DeckSchema | null {
    if (!deckId) return null;
    return localDecks[deckId] ?? null;
  }

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error('La base de datos tardó demasiado en responder.'));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((err: unknown) => {
          window.clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  function fetchDeck(isBackgroundRefetch = false) {
    if (!deckId) {
      setLoading(false);
      setError('No deck ID provided');
      return;
    }

    if (!isBackgroundRefetch) setLoading(true);
    setError(null);

    withTimeout(repo.getDeckById(deckId), DECK_FETCH_TIMEOUT_MS)
      .then((raw) => {
        if (!raw) {
          const localDeck = getLocalDeckFallback();
          if (localDeck) {
            setDeck(localDeck);
            setError(null);
          } else {
            setError(`Deck "${deckId}" not found`);
            setDeck(null);
          }
        } else {
          const resolved = resolveDeck(raw);
          setDeck(resolved);
        }
      })
      .catch((err) => {
        console.error('[useDeck]', err);
        const localDeck = getLocalDeckFallback();
        if (localDeck) {
          setDeck(localDeck);
          setError(null);
        } else {
          setError('No se pudo cargar el deck. Revisá Supabase y volvé a intentar.');
        }
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
