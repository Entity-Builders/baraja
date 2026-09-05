import type {
  Card,
  DeckLegacyFullBackReference,
  DeckReverseModel,
  DeckSchema,
} from '@entity-builders/deck-engine';
import type { Schema, Template } from '@pdfme/common';
import { CARD_FIELD_KEYS } from './cardFieldPlacements';

export type { DeckReverseModel, DeckLegacyFullBackReference };

export interface DeckReverseModelInfo {
  model: DeckReverseModel;
  source: 'operator-override' | 'card-assets' | 'template' | 'empty';
  totalCards: number;
  fullBackCardCount: number;
  editableBackFieldCount: number;
  hasFullBackImageLayer: boolean;
  hasQrOverlay: boolean;
  legacyReferences: DeckLegacyFullBackReference[];
}

const EDITABLE_BACK_FIELD_NAMES = new Set<string>([
  ...CARD_FIELD_KEYS,
  'whenToUse',
]);

const FULL_BACK_IMAGE_SCHEMA_NAMES = new Set<string>([
  'back_ai_image',
  'full_back_image',
  'back_image_url',
]);

export function cardUsesFlujob(card: Pick<Card, 'back'> | { back?: { back_image_url?: string } }): boolean {
  return typeof card?.back?.back_image_url === 'string' && card.back.back_image_url.trim().length > 0;
}

export function getDeckReverseModel(deck: DeckSchema, template?: Template | null): DeckReverseModelInfo {
  const totalCards = deck.cards.length;
  const fullBackCards = deck.cards.filter(cardUsesFlujob);
  const templateSignals = getTemplateReverseSignals(template);
  const legacyReferences = buildLegacyFullBackReferences(deck);
  const override = getValidReverseModel(deck.design?.reverse_model);

  if (override) {
    return {
      ...templateSignals,
      model: override,
      source: 'operator-override',
      totalCards,
      fullBackCardCount: fullBackCards.length,
      legacyReferences,
    };
  }

  if (totalCards > 0 && fullBackCards.length === totalCards) {
    return {
      ...templateSignals,
      model: 'legacy-full-back',
      source: 'card-assets',
      totalCards,
      fullBackCardCount: fullBackCards.length,
      legacyReferences,
    };
  }

  if (fullBackCards.length > 0) {
    return {
      ...templateSignals,
      model: 'mixed',
      source: 'card-assets',
      totalCards,
      fullBackCardCount: fullBackCards.length,
      legacyReferences,
    };
  }

  if (templateSignals.hasFullBackImageLayer && templateSignals.editableBackFieldCount > 0) {
    return {
      ...templateSignals,
      model: 'mixed',
      source: 'template',
      totalCards,
      fullBackCardCount: 0,
      legacyReferences,
    };
  }

  if (templateSignals.hasFullBackImageLayer) {
    return {
      ...templateSignals,
      model: 'legacy-full-back',
      source: 'template',
      totalCards,
      fullBackCardCount: 0,
      legacyReferences,
    };
  }

  return {
    ...templateSignals,
    model: 'editable-layout',
    source: totalCards > 0 ? 'card-assets' : 'empty',
    totalCards,
    fullBackCardCount: 0,
    legacyReferences,
  };
}

export function shouldUseEditableReverseLayout(info: DeckReverseModelInfo): boolean {
  return info.model === 'editable-layout';
}

export function shouldUseLegacyFullBackTemplate(info: DeckReverseModelInfo): boolean {
  return info.model === 'legacy-full-back' || info.model === 'mixed';
}

export function buildLegacyFullBackReferences(deck: DeckSchema): DeckLegacyFullBackReference[] {
  return deck.cards
    .filter(cardUsesFlujob)
    .map(card => ({
      card_id: card.id,
      card_number: card.front.number,
      back_image_url: card.back.back_image_url ?? '',
      ...(card.back.back_image_versions?.length
        ? { back_image_versions: [...card.back.back_image_versions] }
        : {}),
    }));
}

export function getReverseModelLabel(info: DeckReverseModelInfo): string {
  if (info.model === 'editable-layout') return 'Layout editable';
  if (info.model === 'mixed') return 'Mixto';
  return 'Dorso completo heredado';
}

export function getReverseModelDescription(info: DeckReverseModelInfo): string {
  if (info.model === 'editable-layout') {
    return 'Fondo limpio + campos de texto editables.';
  }

  if (info.model === 'mixed') {
    return `${info.fullBackCardCount}/${info.totalCards} cartas tienen dorsos completos. Conviene migrar antes de editar layout.`;
  }

  return `${info.fullBackCardCount || info.totalCards} cartas usan imagen completa de dorso. La edicion se limita a imagen y QR hasta migrar.`;
}

function getTemplateReverseSignals(template?: Template | null): Pick<
  DeckReverseModelInfo,
  'editableBackFieldCount' | 'hasFullBackImageLayer' | 'hasQrOverlay'
> {
  const backPage = Array.isArray(template?.schemas?.[1]) ? template.schemas[1] : [];
  return {
    editableBackFieldCount: backPage.filter(schema => isEditableBackField(schema)).length,
    hasFullBackImageLayer: backPage.some(schema => FULL_BACK_IMAGE_SCHEMA_NAMES.has(schema.name)),
    hasQrOverlay: backPage.some(schema => schema.name === 'qr_overlay' || schema.name === 'qr'),
  };
}

function isEditableBackField(schema: Schema): boolean {
  if (!EDITABLE_BACK_FIELD_NAMES.has(schema.name)) return false;
  if (schema.name === 'qr') return false;
  return schema.type === 'text';
}

function getValidReverseModel(value: unknown): DeckReverseModel | null {
  return value === 'editable-layout' || value === 'legacy-full-back' || value === 'mixed'
    ? value
    : null;
}
