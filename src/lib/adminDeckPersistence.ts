import type { Card, RawDeckContent } from '@eb-packages/deck-engine';
import { SupabaseDeckRepository } from './deckRepository';

const localDeckRepo = new SupabaseDeckRepository();
const shouldUseWorkerAdminApi = !import.meta.env.DEV;

export async function persistAdminEditionUpdates(
  deckId: string,
  updates: Partial<RawDeckContent>,
): Promise<void> {
  if (!shouldUseWorkerAdminApi) {
    await localDeckRepo.updateDeckSettings(deckId, updates);
    return;
  }

  await requestWorkerAdminApi(`/api/admin/editions/${encodeURIComponent(deckId)}`, updates);
}

export async function persistAdminCardUpdates(
  deckId: string,
  cardId: string,
  updates: Partial<Card>,
): Promise<void> {
  if (!shouldUseWorkerAdminApi) {
    await localDeckRepo.updateCard(deckId, cardId, updates);
    return;
  }

  await requestWorkerAdminApi(
    `/api/admin/editions/${encodeURIComponent(deckId)}/cards/${encodeURIComponent(cardId)}`,
    updates,
  );
}

async function requestWorkerAdminApi(path: string, updates: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

async function readApiError(response: Response): Promise<string> {
  const fallback = `Admin API request failed with status ${response.status}.`;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return fallback;
  }

  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : fallback;
  } catch {
    return fallback;
  }
}
