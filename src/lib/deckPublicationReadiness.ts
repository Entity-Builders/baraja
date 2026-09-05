import type { Card, DeckSchema } from '@entity-builders/deck-engine';
import { getEditionBySlug } from './editions';

type BackFieldKey = 'when_to_use' | 'phrase' | 'instruction' | 'answer' | 'fun_fact';

export interface CardPublicationReadiness {
  hasFrontArt: boolean;
  hasBackImage: boolean;
  hasCompleteContent: boolean;
  hasRenderableBack: boolean;
  missingRequiredFields: BackFieldKey[];
  isPublishable: boolean;
}

export interface PublicationBlocker {
  key: 'front-art' | 'back' | 'content' | 'landing';
  label: string;
  detail: string;
  count: number;
}

export interface DeckPublicationReadiness {
  totalCards: number;
  readyCardCount: number;
  missingFrontArtCount: number;
  missingBackCount: number;
  missingBackImageCount: number;
  incompleteContentCount: number;
  landingDataComplete: boolean;
  requiredBackFields: BackFieldKey[];
  blockers: PublicationBlocker[];
  isPublishable: boolean;
}

const FIELD_LABELS: Record<BackFieldKey, string> = {
  when_to_use: 'cuándo usar',
  phrase: 'frase',
  instruction: 'instrucción',
  answer: 'respuesta',
  fun_fact: 'fun fact',
};

const DEFAULT_REQUIRED_BACK_FIELDS: BackFieldKey[] = ['when_to_use', 'phrase', 'instruction'];

function isBackFieldKey(value: string): value is BackFieldKey {
  return value === 'when_to_use' ||
    value === 'phrase' ||
    value === 'instruction' ||
    value === 'answer' ||
    value === 'fun_fact';
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel;
}

export function getRequiredBackFields(deck: Pick<DeckSchema, 'slug' | 'edition'>): BackFieldKey[] {
  const edition = getEditionBySlug(deck.slug || deck.edition);
  const requiredFields = edition?.fields.reduce<BackFieldKey[]>((acc, field) => {
    if (field.required && isBackFieldKey(field.key)) {
      acc.push(field.key);
    }
    return acc;
  }, []);

  return requiredFields && requiredFields.length > 0
    ? requiredFields
    : DEFAULT_REQUIRED_BACK_FIELDS;
}

export function getMissingRequiredFieldLabels(fields: BackFieldKey[]): string {
  return fields.map(field => FIELD_LABELS[field]).join(', ');
}

export function getCardPublicationReadiness(
  deck: Pick<DeckSchema, 'slug' | 'edition'>,
  card: Card,
): CardPublicationReadiness {
  const requiredFields = getRequiredBackFields(deck);
  const missingRequiredFields = requiredFields.filter(field => !hasText(card.back[field]));
  const hasCompleteContent = missingRequiredFields.length === 0;
  const hasFrontArt = hasText(card.front.art_url);
  const hasBackImage = hasText(card.back.back_image_url);
  const hasRenderableBack = hasBackImage || hasCompleteContent;

  return {
    hasFrontArt,
    hasBackImage,
    hasCompleteContent,
    hasRenderableBack,
    missingRequiredFields,
    isPublishable: hasFrontArt && hasCompleteContent && hasRenderableBack,
  };
}

export function getDeckPublicationReadiness(
  deck: DeckSchema,
  cards: Card[] = deck.cards,
): DeckPublicationReadiness {
  const cardReadiness = cards.map(card => getCardPublicationReadiness(deck, card));
  const missingFrontArtCount = cardReadiness.filter(item => !item.hasFrontArt).length;
  const missingBackCount = cardReadiness.filter(item => !item.hasRenderableBack).length;
  const missingBackImageCount = cardReadiness.filter(item => !item.hasBackImage).length;
  const incompleteContentCount = cardReadiness.filter(item => !item.hasCompleteContent).length;
  const readyCardCount = cardReadiness.filter(item => item.isPublishable).length;
  const landingDataComplete = hasText(deck.name) && hasText(deck.slug) && hasText(deck.description);

  const blockers: PublicationBlocker[] = [];
  if (missingFrontArtCount > 0) {
    blockers.push({
      key: 'front-art',
      label: 'Arte frontal',
      detail: `${missingFrontArtCount} ${plural(missingFrontArtCount, 'carta sin arte', 'cartas sin arte')}`,
      count: missingFrontArtCount,
    });
  }

  if (missingBackCount > 0) {
    blockers.push({
      key: 'back',
      label: 'Reverso',
      detail: `${missingBackCount} ${plural(missingBackCount, 'carta sin reverso renderizable', 'cartas sin reverso renderizable')}`,
      count: missingBackCount,
    });
  }

  if (incompleteContentCount > 0) {
    blockers.push({
      key: 'content',
      label: 'Contenido',
      detail: `${incompleteContentCount} ${plural(incompleteContentCount, 'carta incompleta', 'cartas incompletas')}`,
      count: incompleteContentCount,
    });
  }

  if (!landingDataComplete) {
    blockers.push({
      key: 'landing',
      label: 'Landing',
      detail: 'falta nombre, slug o descripción',
      count: 1,
    });
  }

  return {
    totalCards: cards.length,
    readyCardCount,
    missingFrontArtCount,
    missingBackCount,
    missingBackImageCount,
    incompleteContentCount,
    landingDataComplete,
    requiredBackFields: getRequiredBackFields(deck),
    blockers,
    isPublishable: blockers.length === 0 && cards.length > 0,
  };
}
