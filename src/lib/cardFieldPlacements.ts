import type {
  Card,
  CardFieldPlacement,
  CardFieldPlacementKey,
  DeckDesign,
} from '@eb-packages/deck-engine';
import type { Schema, Template } from '@pdfme/common';

export type FieldPlacementMap = Record<CardFieldPlacementKey, CardFieldPlacement>;

export interface CardFieldDefinition {
  key: CardFieldPlacementKey;
  label: string;
  shortLabel: string;
  defaultPlacement: CardFieldPlacement;
  requiredForPublication?: boolean;
}

export const CARD_FIELD_DEFINITIONS: CardFieldDefinition[] = [
  { key: 'number', label: 'Número', shortLabel: 'Nro.', defaultPlacement: 'front' },
  { key: 'title', label: 'Título', shortLabel: 'Título', defaultPlacement: 'front' },
  { key: 'when_to_use', label: 'Cuándo usar', shortLabel: 'Uso', defaultPlacement: 'back' },
  { key: 'phrase', label: 'Frase', shortLabel: 'Frase', defaultPlacement: 'back', requiredForPublication: true },
  { key: 'instruction', label: 'Instrucción', shortLabel: 'Instr.', defaultPlacement: 'back', requiredForPublication: true },
  { key: 'answer', label: 'Respuesta', shortLabel: 'Rta.', defaultPlacement: 'back' },
  { key: 'fun_fact', label: 'Fun fact', shortLabel: 'Dato', defaultPlacement: 'back' },
  { key: 'qr', label: 'QR', shortLabel: 'QR', defaultPlacement: 'back' },
  { key: 'brand', label: 'Marca', shortLabel: 'Marca', defaultPlacement: 'back' },
];

export const CARD_FIELD_KEYS = CARD_FIELD_DEFINITIONS.map(definition => definition.key);
const CARD_FIELD_KEY_SET = new Set<string>(CARD_FIELD_KEYS);
const TEMPLATE_FIELD_ALIASES: Record<string, CardFieldPlacementKey> = {
  whenToUse: 'when_to_use',
};

export function getCanonicalTemplateFieldName(name: string): string {
  return TEMPLATE_FIELD_ALIASES[name] ?? name;
}

function getCanonicalTemplateFieldKey(name: string): CardFieldPlacementKey | null {
  const canonicalName = getCanonicalTemplateFieldName(name);
  return CARD_FIELD_KEY_SET.has(canonicalName)
    ? canonicalName as CardFieldPlacementKey
    : null;
}

export function normalizeTemplateFieldAliases(template: Template): Template {
  const next = cloneTemplate(template);

  next.schemas = next.schemas.map(page => {
    const fieldIndexes = new Map<CardFieldPlacementKey, number>();
    const normalizedPage: Schema[] = [];

    page.forEach(schema => {
      const canonicalKey = getCanonicalTemplateFieldKey(schema.name);
      if (!canonicalKey) {
        normalizedPage.push(schema);
        return;
      }

      const normalizedSchema = schema.name === canonicalKey
        ? schema
        : { ...schema, name: canonicalKey } as Schema;
      const existingIndex = fieldIndexes.get(canonicalKey);

      if (existingIndex !== undefined) {
        if (schema.name !== canonicalKey) {
          normalizedPage[existingIndex] = normalizedSchema;
        }
        return;
      }

      fieldIndexes.set(canonicalKey, normalizedPage.length);
      normalizedPage.push(normalizedSchema);
    });

    return normalizedPage;
  });

  return next;
}

export function normalizeFieldPlacements(
  design?: Pick<DeckDesign, 'field_placements' | 'hidden_fields' | 'hide_player_count'> | null,
): FieldPlacementMap {
  const placements = CARD_FIELD_DEFINITIONS.reduce<FieldPlacementMap>((acc, definition) => {
    acc[definition.key] = definition.defaultPlacement;
    return acc;
  }, {} as FieldPlacementMap);

  const rawPlacements = design?.field_placements ?? {};
  CARD_FIELD_KEYS.forEach(key => {
    const placement = rawPlacements[key];
    if (placement === 'front' || placement === 'back' || placement === 'hidden') {
      placements[key] = placement;
    }
  });

  const hiddenFields = design?.hidden_fields ?? {};
  CARD_FIELD_KEYS.forEach(key => {
    if (hiddenFields[key] || (key === 'when_to_use' && hiddenFields.whenToUse)) {
      placements[key] = 'hidden';
    }
  });

  return placements;
}

export function getHiddenFieldsFromPlacements(
  placements: FieldPlacementMap,
  previousHiddenFields: Record<string, boolean> = {},
): Record<string, boolean> {
  const nextHiddenFields = { ...previousHiddenFields };

  CARD_FIELD_KEYS.forEach(key => {
    nextHiddenFields[key] = placements[key] === 'hidden';
  });

  nextHiddenFields.whenToUse = placements.when_to_use === 'hidden';
  return nextHiddenFields;
}

export function getFieldDefinitionsForPlacement(
  placements: FieldPlacementMap,
  placement: Exclude<CardFieldPlacement, 'hidden'>,
): CardFieldDefinition[] {
  return CARD_FIELD_DEFINITIONS.filter(definition => placements[definition.key] === placement);
}

export function getCardFieldText(
  card: Card,
  deckName: string,
  key: CardFieldPlacementKey,
): string {
  switch (key) {
    case 'number':
      return `#${String(card.front.number).padStart(2, '0')}`;
    case 'title':
      return card.front.title;
    case 'when_to_use':
      return card.back.when_to_use ?? '';
    case 'phrase':
      return card.back.phrase ? `"${card.back.phrase}"` : '';
    case 'instruction':
      return card.back.instruction ?? '';
    case 'answer':
      return card.back.answer ? `Rta: ${card.back.answer}` : '';
    case 'fun_fact':
      return card.back.fun_fact ? `Dato: ${card.back.fun_fact}` : '';
    case 'qr':
      return card.back.qr_url ?? '';
    case 'brand':
      return `Baraja · ${deckName}`;
  }
}

type TemplateFace = Exclude<CardFieldPlacement, 'hidden'>;

interface LocatedSchema {
  face: TemplateFace;
  schema: Schema;
}

export function applyFieldPlacementsToTemplate(
  template: Template,
  placements: FieldPlacementMap,
  widthMm: number,
  heightMm: number,
): Template {
  const next = normalizeTemplateFieldAliases(template);
  const sourceSchemas = [
    next.schemas?.[0] ? [...next.schemas[0]] : [],
    next.schemas?.[1] ? [...next.schemas[1]] : [],
  ];
  const movableNames = new Set<string>(CARD_FIELD_KEYS);
  const located = new Map<CardFieldPlacementKey, LocatedSchema>();

  sourceSchemas.forEach((page, pageIndex) => {
    page.forEach(schema => {
      if (!movableNames.has(schema.name)) return;
      const fieldKey = schema.name as CardFieldPlacementKey;
      const face = pageIndex === 0 ? 'front' : 'back';
      const existing = located.get(fieldKey);
      const targetPlacement = placements[fieldKey];
      if (
        existing &&
        (targetPlacement === 'hidden' || existing.face === targetPlacement || face !== targetPlacement)
      ) {
        return;
      }

      located.set(fieldKey, {
        face,
        schema,
      });
    });
  });

  const pages: [Schema[], Schema[]] = [
    sourceSchemas[0].filter(schema => !movableNames.has(schema.name)),
    sourceSchemas[1].filter(schema => !movableNames.has(schema.name)),
  ];

  CARD_FIELD_DEFINITIONS.forEach(definition => {
    const placement = placements[definition.key];
    if (placement === 'hidden') return;

    const locatedSchema = located.get(definition.key);
    const schema = locatedSchema?.face === placement
      ? cloneSchema(locatedSchema.schema)
      : createDefaultFieldSchema(definition.key, placement, widthMm, heightMm, locatedSchema?.schema);

    pages[placement === 'front' ? 0 : 1].push(schema);
  });

  next.schemas = pages;
  return next;
}

function cloneTemplate(template: Template): Template {
  return JSON.parse(JSON.stringify(template)) as Template;
}

function cloneSchema(schema: Schema): Schema {
  return JSON.parse(JSON.stringify(schema)) as Schema;
}

function createDefaultFieldSchema(
  key: CardFieldPlacementKey,
  face: TemplateFace,
  widthMm: number,
  heightMm: number,
  previous?: Schema,
): Schema {
  if (key === 'qr') {
    const size = Math.max(7.5, Math.min(widthMm, heightMm) * 0.11);
    const y = face === 'front' ? heightMm - size - 8 : heightMm - size - 16.5;
    return {
      name: key,
      type: 'qrcode',
      position: { x: (widthMm / 2) - (size / 2), y },
      width: size,
      height: size,
      barColor: getPreviousString(previous, 'barColor') ?? '#ffffff',
      rotate: 0,
    } as Schema;
  }

  const preset = getDefaultTextPreset(key, face, widthMm, heightMm);
  return {
    name: key,
    type: 'text',
    position: { x: preset.x, y: preset.y },
    width: preset.width,
    height: preset.height,
    fontSize: preset.fontSize,
    alignment: preset.alignment,
    verticalAlignment: 'middle',
    fontName: getPreviousString(previous, 'fontName') ?? preset.fontName,
    fontColor: getPreviousString(previous, 'fontColor') ?? preset.fontColor,
    letterSpacing: preset.letterSpacing,
    rotate: 0,
    dynamicFontSize: {
      min: preset.fontSize * 0.45,
      max: preset.fontSize,
      fit: 'vertical',
    },
  } as Schema;
}

function getPreviousString(schema: Schema | undefined, key: string): string | undefined {
  if (!schema || !(key in schema)) return undefined;
  const value = (schema as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function getDefaultTextPreset(
  key: CardFieldPlacementKey,
  face: TemplateFace,
  widthMm: number,
  heightMm: number,
) {
  const safeX = Math.max(4, widthMm * 0.115);
  const safeWidth = widthMm - (safeX * 2);
  const frontColor = '#ffffff';
  const backMuted = '#d6d6d6';

  if (face === 'front') {
    switch (key) {
      case 'number':
        return textPreset(4, 3, Math.min(20, widthMm * 0.3), 8, 14, 'left', 'Cormorant Garamond', frontColor);
      case 'title':
        return textPreset(4, heightMm - 10, widthMm - 8, 8, 11, 'center', 'Cormorant Garamond', frontColor, 3);
      case 'when_to_use':
        return textPreset(safeX, heightMm * 0.13, safeWidth, 10, 5, 'center', 'Outfit', frontColor, 2);
      case 'phrase':
        return textPreset(safeX, heightMm * 0.28, safeWidth, heightMm * 0.32, 15, 'center', 'Cormorant Garamond', frontColor);
      case 'instruction':
        return textPreset(safeX, heightMm * 0.6, safeWidth, heightMm * 0.18, 6.5, 'center', 'Cormorant Garamond', frontColor);
      case 'answer':
        return textPreset(safeX, heightMm * 0.76, safeWidth, 8, 5.5, 'center', 'Outfit', frontColor);
      case 'fun_fact':
        return textPreset(safeX, heightMm * 0.82, safeWidth, 8, 5.2, 'center', 'Outfit', frontColor);
      case 'brand':
        return textPreset(safeX, heightMm - 7, safeWidth, 4, 4, 'center', 'Outfit', 'rgba(255,255,255,0.62)', 2);
      case 'qr':
        return textPreset(safeX, heightMm - 16, safeWidth, 8, 4, 'center', 'Outfit', frontColor);
    }
  }

  switch (key) {
    case 'number':
      return textPreset(4, 3, Math.min(20, widthMm * 0.3), 8, 12, 'left', 'Cormorant Garamond', backMuted);
    case 'title':
      return textPreset(safeX, heightMm * 0.12, safeWidth, 12, 10, 'center', 'Cormorant Garamond', '#ffffff');
    case 'when_to_use':
      return textPreset(safeX, heightMm * 0.095, safeWidth, 8, 4.5, 'center', 'Outfit', backMuted, 2);
    case 'phrase':
      return textPreset(safeX, heightMm * 0.2, safeWidth, heightMm * 0.35, 15, 'center', 'Cormorant Garamond', '#ffffff');
    case 'instruction':
      return textPreset(safeX, heightMm * 0.54, safeWidth, heightMm * 0.17, 6.5, 'center', 'Cormorant Garamond', '#e0e0e0');
    case 'answer':
      return textPreset(safeX, heightMm * 0.73, safeWidth, 7, 5.5, 'center', 'Outfit', '#aaaaaa');
    case 'fun_fact':
      return textPreset(safeX, heightMm * 0.8, safeWidth, 7, 5.2, 'center', 'Outfit', '#aaaaaa');
    case 'brand':
      return textPreset(safeX, heightMm - 14.5, safeWidth, 4, 4, 'center', 'Outfit', '#444444', 2);
    case 'qr':
      return textPreset(safeX, heightMm - 24, safeWidth, 8, 4, 'center', 'Outfit', '#ffffff');
  }
}

function textPreset(
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  alignment: 'left' | 'center' | 'right',
  fontName: string,
  fontColor: string,
  letterSpacing = 0,
) {
  return { x, y, width, height, fontSize, alignment, fontName, fontColor, letterSpacing };
}
