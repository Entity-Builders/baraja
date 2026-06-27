import {
  CARD_FIELD_DEFINITIONS,
  type FieldPlacementMap,
} from '../../../lib/cardFieldPlacements';

export type DeckCardLike = {
  front?: {
    art_url?: string;
    number?: number | string;
    title?: string;
  };
  back?: {
    back_image_url?: string;
    when_to_use?: string;
    phrase?: string;
    instruction?: string;
    answer?: string;
    fun_fact?: string;
    qr_url?: string;
  };
};

export type CardFieldStatus = 'visible' | 'hidden' | 'missing' | 'base';

export type CardFieldState = {
  label: string;
  status: CardFieldStatus;
  value: string;
};

export function getCardFieldInventory({
  deckName,
  card,
  mockData,
  hiddenFields,
  fieldPlacements,
}: {
  deckName: string;
  card?: DeckCardLike;
  mockData: Record<string, string>;
  hiddenFields: Record<string, boolean>;
  fieldPlacements: FieldPlacementMap;
}): { front: CardFieldState[]; back: CardFieldState[] } {
  const frontNumber = card?.front?.number == null ? '' : `#${String(card.front.number).padStart(2, '0')}`;
  const frontTitle = card?.front?.title || mockData.title || '';
  const frontArt = card?.front?.art_url || mockData.art || '';
  const front: CardFieldState[] = [
    buildFieldState('Arte', frontArt, false, frontArt ? 'Imagen generada' : ''),
  ];
  const back: CardFieldState[] = [
    buildFieldState('Fondo', mockData.bg, false, mockData.bg ? 'Frame base' : '', mockData.bg ? 'base' : undefined),
    buildFieldState('Reverso IA', card?.back?.back_image_url || mockData.back_ai_image || '', false, card?.back?.back_image_url ? 'Imagen generada' : ''),
  ];

  CARD_FIELD_DEFINITIONS.forEach(field => {
    const value = getInventoryFieldValue(field.key, {
      card,
      deckName,
      frontNumber,
      frontTitle,
      mockData,
    });
    const hidden = fieldPlacements[field.key] === 'hidden'
      || hiddenFields[field.key]
      || (field.key === 'when_to_use' && hiddenFields.whenToUse);
    const preview = field.key === 'qr' && value ? 'Generado' : undefined;
    const state = buildFieldState(field.label, value, hidden, preview);
    const target = fieldPlacements[field.key] === 'front'
      ? front
      : back;
    target.push(state);
  });

  return { front, back };
}

function getInventoryFieldValue(
  key: (typeof CARD_FIELD_DEFINITIONS)[number]['key'],
  context: {
    card?: DeckCardLike;
    deckName: string;
    frontNumber: string;
    frontTitle: string;
    mockData: Record<string, string>;
  },
): string {
  const { card, deckName, frontNumber, frontTitle, mockData } = context;

  switch (key) {
    case 'number':
      return frontNumber || mockData.number || '';
    case 'title':
      return frontTitle || mockData.title || '';
    case 'when_to_use':
      return card?.back?.when_to_use || mockData.when_to_use || mockData.whenToUse || '';
    case 'phrase':
      return card?.back?.phrase || mockData.phrase || '';
    case 'instruction':
      return card?.back?.instruction || mockData.instruction || '';
    case 'answer':
      return card?.back?.answer || mockData.answer || '';
    case 'fun_fact':
      return card?.back?.fun_fact || mockData.fun_fact || '';
    case 'qr':
      return card?.back?.qr_url || mockData.qr || mockData.qr_overlay || '';
    case 'brand':
      return mockData.brand || `Baraja · ${deckName}`;
  }
}

function buildFieldState(
  label: string,
  rawValue: string | undefined,
  hidden = false,
  previewOverride?: string,
  forcedStatus?: CardFieldStatus,
): CardFieldState {
  const value = cleanFieldPreview(previewOverride ?? rawValue ?? '');
  const hasValue = Boolean(cleanFieldPreview(rawValue ?? ''));

  if (forcedStatus) {
    return { label, status: forcedStatus, value: value || statusCopy[forcedStatus] };
  }

  if (hidden) {
    return { label, status: 'hidden', value: hasValue ? value : 'Sin contenido cargado' };
  }

  if (!hasValue) {
    return { label, status: 'missing', value: 'Sin contenido' };
  }

  return { label, status: 'visible', value };
}

function cleanFieldPreview(value: string): string {
  return value
    .replace(/^Rta:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
}

const statusCopy: Record<CardFieldStatus, string> = {
  visible: 'Visible',
  hidden: 'Oculto',
  missing: 'Falta',
  base: 'Base',
};
