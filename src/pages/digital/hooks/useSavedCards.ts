import { useEffect, useState } from 'react';

export function useSavedCards(deckSlug: string) {
  const storageKey = `baraja:digital:saved:${deckSlug}`;
  const [savedCardIds, setSavedCardIds] = useState<string[]>(() => readSavedCards(storageKey));

  useEffect(() => {
    writeSavedCards(storageKey, savedCardIds);
  }, [savedCardIds, storageKey]);

  function toggleSaved(cardId: string) {
    setSavedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }

      return [...current, cardId];
    });
  }

  return { savedCardIds, toggleSaved };
}

function readSavedCards(storageKey: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed)
      ? parsed.filter((cardId): cardId is string => typeof cardId === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeSavedCards(storageKey: string, savedCardIds: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(savedCardIds));
  } catch (error) {
    console.warn('Unable to persist saved Baraja cards.', error);
  }
}
