import type React from 'react';
import type { DeckType, TriviaDifficulty } from './generationPayload';
import type { EnrichedItem } from './generationResponseParsers';

export interface GenerationLog {
  type: 'info' | 'success' | 'error' | 'progress' | 'prompt';
  message: string;
  timestamp: number;
}

export const CARD_COUNT_OPTIONS = [10, 20, 30, 40] as const;

export const DECK_TYPE_OPTIONS: Array<{ key: DeckType; label: string; desc: string }> = [
  { key: 'trivia', label: '🧩 Trivia', desc: 'Preguntas con respuestas verificadas' },
  { key: 'introspection', label: '🧠 Introspección', desc: 'Ejercicios de regulación' },
  { key: 'party', label: '🎲 Party', desc: 'Juegos sociales, retos' },
  { key: 'custom', label: '✍️ Custom', desc: 'Freetext completo' },
];

export const TRIVIA_DIFFICULTY_OPTIONS: Array<{ key: TriviaDifficulty; label: string; color: string }> = [
  { key: 'easy', label: '😊 Easy', color: '#4ade80' },
  { key: 'medium', label: '🤔 Medium', color: '#facc15' },
  { key: 'hard', label: '🔥 Hard', color: '#f87171' },
  { key: 'mixed', label: '🎯 Mixed', color: 'var(--color-gold)' },
];

export const ART_STYLE_OPTIONS = [
  { value: '', label: 'Auto (let AI decide per deck type)' },
  { value: 'abstract-fine-art', label: '🎨 Abstract Fine Art' },
  { value: 'stylized-illustration', label: '🖼️ Stylized Illustration (poster/print)' },
  { value: 'evocative-photography', label: '📸 Evocative Photography' },
  { value: 'vintage-photography', label: '📷 Vintage Photography' },
  { value: 'documentary', label: '🎥 Documentary' },
  { value: 'cinematic', label: '🎬 Cinematic (movie poster style)' },
] as const;

export const generationLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: 'var(--color-gold)',
  opacity: 0.8,
};

export const generationInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.875rem 1rem',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.85rem',
  outline: 'none',
  transition: 'border-color 0.3s',
};

export function getGenerationChipStyle(
  active: boolean,
  disabled: boolean,
  color = 'var(--color-gold)',
): React.CSSProperties {
  return {
    padding: '0.4rem 0.75rem',
    background: active ? color : 'var(--color-surface-2)',
    color: active ? '#0c0b09' : 'var(--color-text-muted)',
    border: `1px solid ${active ? color : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.8rem',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.4 : 1,
  };
}

export function getSeedItems(seedText: string): string[] {
  return seedText.split('\n').map(item => item.trim()).filter(Boolean);
}

export function getFoundEnrichedItems(enrichedData: EnrichedItem[] | null): EnrichedItem[] {
  return enrichedData?.filter(item => !item._notFound) ?? [];
}

export function normalizeCardCount(value: string): number {
  return Math.max(1, Math.min(60, parseInt(value, 10) || 1));
}

export function getDifficultyHint(difficulty: TriviaDifficulty): string {
  switch (difficulty) {
    case 'mixed':
      return '40% easy, 35% medium, 25% hard — recommended';
    case 'easy':
      return 'Common knowledge, pop culture';
    case 'medium':
      return 'Enthusiast-level, needs some interest';
    case 'hard':
      return 'Deep cuts, only experts know';
  }
}
