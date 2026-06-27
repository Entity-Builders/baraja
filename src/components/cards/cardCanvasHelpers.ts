import type { CSSProperties } from 'react';
import type { Schema, Template } from '@pdfme/common';
import type { DeckSchema } from '@eb-packages/deck-engine';
import {
  normalizeTemplateFieldAliases,
  type CardFieldDefinition,
} from '../../lib/cardFieldPlacements';

export interface TypographyZone {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
}

export interface TypographyHints {
  whenToUse?: TypographyZone;
  phrase?: TypographyZone;
  instruction?: TypographyZone;
  answer?: TypographyZone;
  brand?: { color?: string; fontFamily?: string };
  qrFgColor?: string;
  qrSizeMm?: number;
}

export function adaptiveFontSize(
  text: string | undefined | null,
  aiSizeMm: number | undefined,
  defaultCqi: number,
  isSmallZone = false
): string {
  const safeText = text || '';
  const len = safeText.length;
  const maxCqi = aiSizeMm ? (aiSizeMm * (100 / 70)) : defaultCqi;
  let scale: number;

  if (isSmallZone) {
    if      (len <= 60)  scale = 1.00;
    else if (len <= 100) scale = 0.85;
    else if (len <= 150) scale = 0.75;
    else if (len <= 200) scale = 0.65;
    else                 scale = 0.55;
  } else {
    if      (len <= 40)  scale = 1.00;
    else if (len <= 60)  scale = 0.88;
    else if (len <= 80)  scale = 0.76;
    else if (len <= 100) scale = 0.65;
    else if (len <= 130) scale = 0.56;
    else                 scale = 0.48;
  }

  return `${(maxCqi * scale).toFixed(2)}cqi`;
}

export function getPdfmeLayoutConfig(deck: DeckSchema): Template | null {
  const config = deck.design?.layout_config;

  if (typeof config === 'object' && config !== null && 'basePdf' in config && 'schemas' in config) {
    return normalizeTemplateFieldAliases(config as Template);
  }

  return null;
}

export function buildFallbackBackSchemas(theme: 'light' | 'dark', typo: TypographyHints | null): Schema[] {
  const makeTextSchema = (
    name: string,
    position: { x: number; y: number },
    width: number,
    height: number,
  ): Schema => ({
    name,
    type: 'text',
    position,
    width,
    height,
    fontColor: getFallbackBackColor(theme, typo, name),
    rotate: 0,
  } as Schema);

  return [
    {
      name: 'bg',
      type: 'image',
      position: { x: 0, y: 0 },
      width: 70,
      height: 120,
      rotate: 0,
    } as Schema,
    makeTextSchema('when_to_use', { x: 9.8, y: 11.4 }, 50.4, 8),
    makeTextSchema('phrase', { x: 8, y: 22 }, 54, 40),
    makeTextSchema('instruction', { x: 8, y: 62 }, 54, 24),
    makeTextSchema('answer', { x: 8, y: 86 }, 54, 8),
    makeTextSchema('fun_fact', { x: 8, y: 94 }, 54, 8),
    makeTextSchema('brand', { x: 8, y: 105 }, 54, 5),
  ];
}

export function getFallbackContrastVars(overrides: Record<string, string>): CSSProperties {
  const vars: Record<string, string> = {};
  if (overrides.when_to_use) vars['--c-when'] = overrides.when_to_use;
  if (overrides.phrase) vars['--c-phrase'] = overrides.phrase;
  if (overrides.instruction) vars['--c-instruction'] = overrides.instruction;
  if (overrides.answer) vars['--c-answer'] = overrides.answer;
  if (overrides.fun_fact) vars['--c-answer'] = overrides.fun_fact;
  if (overrides.brand) vars['--c-brand'] = overrides.brand;
  return vars as CSSProperties;
}

export function shouldUseInstructionFirstBack(deck: DeckSchema): boolean {
  const category = deck.digital?.category;
  const collection = deck.digital?.catalog?.collection;

  return Boolean(
    (category && INSTRUCTION_FIRST_DIGITAL_CATEGORIES.has(category)) ||
    (collection && INSTRUCTION_FIRST_CATALOG_COLLECTIONS.has(collection)),
  );
}

export function sortInstructionFirstBackFields(fields: CardFieldDefinition[]): CardFieldDefinition[] {
  return [...fields].sort((a, b) => {
    const orderA = INSTRUCTION_FIRST_BACK_FIELD_ORDER[a.key] ?? 99;
    const orderB = INSTRUCTION_FIRST_BACK_FIELD_ORDER[b.key] ?? 99;
    return orderA - orderB;
  });
}

function getFallbackBackColor(theme: 'light' | 'dark', typo: TypographyHints | null, key: string): string {
  const darkThemeColors: Record<string, string> = {
    when_to_use: 'rgba(200, 200, 200, 0.8)',
    phrase: '#ffffff',
    instruction: 'rgba(230, 230, 230, 0.88)',
    answer: 'rgba(180, 180, 180, 0.75)',
    fun_fact: 'rgba(180, 180, 180, 0.75)',
    brand: 'rgba(255, 255, 255, 0.28)',
  };
  const lightThemeColors: Record<string, string> = {
    when_to_use: 'rgba(60, 35, 10, 0.7)',
    phrase: '#1a0d02',
    instruction: 'rgba(45, 28, 8, 0.88)',
    answer: 'rgba(70, 45, 15, 0.72)',
    fun_fact: 'rgba(70, 45, 15, 0.72)',
    brand: 'rgba(90, 58, 22, 0.55)',
  };

  const aiColors: Record<string, string | undefined> = {
    when_to_use: typo?.whenToUse?.color,
    phrase: typo?.phrase?.color,
    instruction: typo?.instruction?.color,
    answer: typo?.answer?.color,
    fun_fact: typo?.answer?.color,
    brand: typo?.brand?.color,
  };

  return aiColors[key] ?? (theme === 'light' ? lightThemeColors[key] : darkThemeColors[key]);
}

const INSTRUCTION_FIRST_DIGITAL_CATEGORIES = new Set([
  'conversation',
  'trivia',
  'language-learning',
  'team-building',
  'coaching',
  'creative-prompts',
]);

const INSTRUCTION_FIRST_CATALOG_COLLECTIONS = new Set([
  'social-games',
  'couples-dating',
  'team-tools',
  'trivia-games',
  'learning',
]);

const INSTRUCTION_FIRST_BACK_FIELD_ORDER: Partial<Record<CardFieldDefinition['key'], number>> = {
  when_to_use: 0,
  instruction: 1,
  answer: 2,
  fun_fact: 3,
  phrase: 4,
  qr: 5,
  brand: 6,
};
