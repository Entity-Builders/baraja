import type { CardType } from '@eb-packages/deck-engine';
import { getEditionBySlug } from '../../../../lib/editions';

export const INSPIRATION_CHIPS = [
  { label: 'Cyberpunk Neón', icon: '⚡' },
  { label: 'Acuarela Botánica', icon: '🌿' },
  { label: 'Retrofuturismo 80s', icon: '📼' },
  { label: 'Minimalismo Zen', icon: '🧘' },
  { label: 'Gótico Oscuro', icon: '🦇' },
  { label: 'Bauhaus Geométrico', icon: '📐' },
  { label: 'Pop Art', icon: '💥' },
  { label: 'Rococó Elegante', icon: '👑' },
];

export const CARD_TYPES: { id: CardType; label: string; hint: string }[] = [
  { id: 'therapeutic', label: '🧘 Terapéutica', hint: 'Ejercicios / regulación' },
  { id: 'trivia', label: '🎯 Trivia', hint: 'Preguntas y respuestas' },
  { id: 'party', label: '🎉 Fiesta', hint: 'Social / irreverente' },
  { id: 'game', label: '🎲 Juego', hint: 'Mecánicas / reglas' },
  { id: 'custom', label: '✍️ Custom', hint: 'Personalizado' },
];

export function inferCardType(slug: string): CardType {
  const edition = getEditionBySlug(slug);
  if (!edition) return 'custom';
  const map: Record<string, CardType> = {
    barometro: 'therapeutic',
    trivia: 'trivia',
    juegos: 'game',
    rompelo: 'party',
    custom: 'custom',
  };
  return map[edition.id] ?? 'party';
}
