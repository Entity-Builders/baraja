import {
  getPreviewCards,
  type Card,
  type DeckSchema,
} from '@eb-packages/deck-engine';

export const HERO_ROTATION_STORAGE_KEY = 'baraja:landing:giro:v2';
export const HERO_ROTATION_CONFIG_EVENT = 'baraja:giro-config-updated';

export type HeroRotationTone =
  | 'regulation'
  | 'conversation'
  | 'teams'
  | 'dates'
  | 'trivia'
  | 'film'
  | 'sports'
  | 'learning'
  | 'introspection';

export type HeroRotationSlot = {
  id: string;
  label: string;
  claim: string;
  tone: HeroRotationTone;
  deckSlug: string;
  cardId?: string;
  enabled: boolean;
};

export type HeroRotationItem = {
  slot: HeroRotationSlot;
  deck: DeckSchema;
  card: Card;
};

export const HERO_ROTATION_TONES: Array<{ value: HeroRotationTone; label: string }> = [
  { value: 'regulation', label: 'Regulación' },
  { value: 'conversation', label: 'Conversación' },
  { value: 'teams', label: 'Equipos' },
  { value: 'dates', label: 'Citas' },
  { value: 'trivia', label: 'Trivia' },
  { value: 'film', label: 'Cine' },
  { value: 'sports', label: 'Deportes' },
  { value: 'learning', label: 'Aprendizaje' },
  { value: 'introspection', label: 'Introspección' },
];

export const HERO_ROTATION_FALLBACK_CLAIMS: Record<HeroRotationTone, string> = {
  regulation: 'usar en tus sesiones',
  conversation: 'conectar sin tener que preparar nada',
  teams: 'activar dinámicas de equipo',
  dates: 'romper el hielo en una cita',
  trivia: 'jugar con tus amigos',
  film: 'hacer una ronda de cine',
  sports: 'jugar una trivia futbolera',
  learning: 'practicar sin sentirte en clase',
  introspection: 'hacer una pausa y pensar mejor',
};

export const DEFAULT_HERO_ROTATION_SLOTS: HeroRotationSlot[] = [
  {
    id: 'regulacion',
    label: 'Sesiones',
    claim: 'usar en tus sesiones',
    tone: 'regulation',
    deckSlug: 'barometro',
    enabled: true,
  },
  {
    id: 'trivia',
    label: 'Trivia',
    claim: 'jugar con tus amigos',
    tone: 'trivia',
    deckSlug: 'trivia-sobre-peliculas-de-comedia-romantica',
    enabled: true,
  },
  {
    id: 'equipos',
    label: 'Equipos',
    claim: 'activar dinámicas de equipo',
    tone: 'teams',
    deckSlug: 'mazo-de-team-building-para-equipos-de-trabajo',
    enabled: true,
  },
  {
    id: 'citas',
    label: 'Citas',
    claim: 'romper el hielo en una cita',
    tone: 'dates',
    deckSlug: 'mazo-para-romper-el-hielo-en-la-primera-cita',
    enabled: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHeroRotationTone(value: unknown): value is HeroRotationTone {
  return HERO_ROTATION_TONES.some((tone) => tone.value === value);
}

function slugifySlotLabel(label: string, fallback: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

export function normalizeHeroRotationSlots(value: unknown): HeroRotationSlot[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_HERO_ROTATION_SLOTS];
  }

  const slots = value.flatMap((candidate, index): HeroRotationSlot[] => {
    if (!isRecord(candidate)) {
      return [];
    }

    const rawLabel = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const label = rawLabel || `Categoría ${index + 1}`;
    const deckSlug = typeof candidate.deckSlug === 'string' ? candidate.deckSlug.trim() : '';

    if (!deckSlug) {
      return [];
    }

    const rawId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const id = rawId || slugifySlotLabel(label, `categoria-${index + 1}`);
    const tone = isHeroRotationTone(candidate.tone) ? candidate.tone : 'conversation';
    const rawClaim = typeof candidate.claim === 'string' ? candidate.claim.trim() : '';
    const claim = rawClaim || HERO_ROTATION_FALLBACK_CLAIMS[tone];
    const cardId = typeof candidate.cardId === 'string' && candidate.cardId.trim()
      ? candidate.cardId.trim()
      : undefined;

    return [{
      id,
      label: label.slice(0, 28),
      claim: claim.slice(0, 72),
      tone,
      deckSlug,
      cardId,
      enabled: candidate.enabled !== false,
    }];
  });

  return slots.length > 0 ? slots : [...DEFAULT_HERO_ROTATION_SLOTS];
}

export function loadHeroRotationSlots(): HeroRotationSlot[] {
  if (typeof window === 'undefined') {
    return [...DEFAULT_HERO_ROTATION_SLOTS];
  }

  const stored = window.localStorage.getItem(HERO_ROTATION_STORAGE_KEY);
  if (!stored) {
    return [...DEFAULT_HERO_ROTATION_SLOTS];
  }

  try {
    return normalizeHeroRotationSlots(JSON.parse(stored));
  } catch (error) {
    console.warn('[heroRotationConfig] Invalid stored giro config:', error);
    return [...DEFAULT_HERO_ROTATION_SLOTS];
  }
}

export function saveHeroRotationSlots(slots: HeroRotationSlot[]): HeroRotationSlot[] {
  const normalized = normalizeHeroRotationSlots(slots);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(HERO_ROTATION_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(HERO_ROTATION_CONFIG_EVENT));
  }

  return normalized;
}

export function resetHeroRotationSlots(): HeroRotationSlot[] {
  return saveHeroRotationSlots(DEFAULT_HERO_ROTATION_SLOTS);
}

function findDeckBySlug(decks: DeckSchema[], slug: string): DeckSchema | undefined {
  return decks.find((deck) => (
    deck.slug === slug ||
    deck.id === slug ||
    deck.edition === slug
  ));
}

function resolveCard(deck: DeckSchema, cardId?: string): Card | undefined {
  if (cardId) {
    const selectedCard = deck.cards.find((card) => card.id === cardId);
    if (selectedCard) {
      return selectedCard;
    }
  }

  return getPreviewCards(deck, 1)[0] ?? deck.cards[0];
}

function resolveHeroRotationItemsFromSlots(
  decks: DeckSchema[],
  slots: HeroRotationSlot[]
): HeroRotationItem[] {
  return slots.flatMap((slot): HeroRotationItem[] => {
    if (!slot.enabled) {
      return [];
    }

    const deck = findDeckBySlug(decks, slot.deckSlug);
    if (!deck) {
      return [];
    }

    const card = resolveCard(deck, slot.cardId);
    if (!card) {
      return [];
    }

    return [{ slot, deck, card }];
  });
}

export function getHeroRotationItems(
  decks: DeckSchema[],
  slots = loadHeroRotationSlots()
): HeroRotationItem[] {
  const configuredItems = resolveHeroRotationItemsFromSlots(decks, slots);

  if (configuredItems.length > 0) {
    return configuredItems;
  }

  return resolveHeroRotationItemsFromSlots(decks, DEFAULT_HERO_ROTATION_SLOTS);
}
