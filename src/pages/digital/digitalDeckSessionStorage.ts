import type { CardFace } from '@entity-builders/deck-engine';

export interface StoredSessionSnapshot {
  selectedCardId: string | null;
  face: CardFace;
  drawIndex: number;
  shuffleSeed: string | null;
  playedCardIds: string[];
  recentCardIds: string[];
  lastCardId: string | null;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export function getSessionStorageKey(slug: string | undefined): string {
  return `baraja:pwa:session:${slug ?? 'unknown'}`;
}

export function readStoredSession(storageKey: string): StoredSessionSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);

    if (!isSessionSnapshotLike(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(
  storageKey: string,
  snapshot: StoredSessionSnapshot
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Unable to persist Baraja session state.', error);
  }
}

export function clearStoredSession(storageKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Unable to clear Baraja session state.', error);
  }
}

function isSessionSnapshotLike(value: unknown): value is StoredSessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredSessionSnapshot>;
  const face = candidate.face;

  return (
    (candidate.selectedCardId === null || typeof candidate.selectedCardId === 'string') &&
    (face === 'front' || face === 'back') &&
    typeof candidate.drawIndex === 'number' &&
    (candidate.shuffleSeed === null || typeof candidate.shuffleSeed === 'string') &&
    Array.isArray(candidate.playedCardIds) &&
    candidate.playedCardIds.every((cardId) => typeof cardId === 'string') &&
    Array.isArray(candidate.recentCardIds) &&
    candidate.recentCardIds.every((cardId) => typeof cardId === 'string') &&
    (candidate.lastCardId === null || typeof candidate.lastCardId === 'string') &&
    typeof candidate.soundEnabled === 'boolean' &&
    typeof candidate.vibrationEnabled === 'boolean'
  );
}
