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
  options: { forceFrontAutoLayout?: boolean } = {},
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

  pages[0] = normalizeFrontFaceForPlacements(
    pages[0],
    sourceSchemas[0],
    placements,
    widthMm,
    heightMm,
    options,
  );

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

const FRONT_PAYLOAD_FIELDS = new Set<CardFieldPlacementKey>([
  'when_to_use',
  'phrase',
  'instruction',
  'answer',
  'fun_fact',
]);

const FRONT_UTILITY_FIELDS = new Set<CardFieldPlacementKey>([
  'qr',
  'brand',
]);

type FrontLayoutVariant = 'poster' | 'captioned-art' | 'content-panel';

interface ApplyFieldPlacementOptions {
  forceFrontAutoLayout?: boolean;
}

function normalizeFrontFaceForPlacements(
  page: Schema[],
  sourcePage: Schema[],
  placements: FieldPlacementMap,
  widthMm: number,
  heightMm: number,
  options: ApplyFieldPlacementOptions,
): Schema[] {
  const visibleFrontKeys = CARD_FIELD_DEFINITIONS
    .filter(definition => placements[definition.key] === 'front')
    .map(definition => definition.key);

  if (!shouldUseAutomaticFrontLayout(page, sourcePage, visibleFrontKeys, widthMm, heightMm, options)) {
    return page;
  }

  return buildAutomaticFrontLayout(page, visibleFrontKeys, widthMm, heightMm);
}

function shouldUseAutomaticFrontLayout(
  page: Schema[],
  sourcePage: Schema[],
  visibleFrontKeys: CardFieldPlacementKey[],
  widthMm: number,
  heightMm: number,
  options: ApplyFieldPlacementOptions,
): boolean {
  if (options.forceFrontAutoLayout) return true;

  const sourceArt = sourcePage.find(schema => schema.name === 'art');
  const hasGeneratedSupport = sourcePage.some(isGeneratedFrontSupportSchema);
  const hasCustomSupport = sourcePage.some(schema => (
    schema.name !== 'art' &&
    !CARD_FIELD_KEY_SET.has(schema.name) &&
    !isGeneratedFrontSupportSchema(schema)
  ));
  const artNeedsReset = !sourceArt || !isFullBleedSchema(sourceArt, widthMm, heightMm);
  const isDefaultLike = !hasCustomSupport;
  const needsTextSupport = visibleFrontKeys.some(key => key !== 'brand');
  const hasTextSupport = page.some(isGeneratedFrontSupportSchema);
  const fieldsLookDefault = visibleFrontKeys.every(key => {
    const sourceSchema = sourcePage.find(schema => schema.name === key);
    return !sourceSchema || isFrontFieldNearDefault(sourceSchema, key, widthMm, heightMm);
  });

  return artNeedsReset || hasGeneratedSupport || (isDefaultLike && needsTextSupport && !hasTextSupport && fieldsLookDefault);
}

function buildAutomaticFrontLayout(
  page: Schema[],
  visibleFrontKeys: CardFieldPlacementKey[],
  widthMm: number,
  heightMm: number,
): Schema[] {
  const byName = new Map(page.map(schema => [schema.name, schema]));
  const payloadKeys = visibleFrontKeys.filter(key => FRONT_PAYLOAD_FIELDS.has(key));
  const utilityKeys = visibleFrontKeys.filter(key => FRONT_UTILITY_FIELDS.has(key));
  const variant = getFrontLayoutVariant(payloadKeys.length);
  const safe = getFrontSafeMargin(widthMm, heightMm);
  const safeWidth = widthMm - (safe * 2);
  const output: Schema[] = [createFullBleedArtSchema(byName.get('art'), widthMm, heightMm)];

  if (variant !== 'poster') {
    output.push(createFrontPanelSchema(variant, safe, safeWidth, heightMm, payloadKeys.length));
  }

  const numberSchema = visibleFrontKeys.includes('number')
    ? createFrontNumberSchema(byName.get('number'), safe)
    : null;
  if (numberSchema) {
    output.push(createFrontPlateSchema('number_front_plate', numberSchema, 2.4, 2.1, 2.6));
  }

  const titleSchema = visibleFrontKeys.includes('title')
    ? createFrontTitleSchema(byName.get('title'), variant, safe, safeWidth, heightMm, payloadKeys.length)
    : null;
  if (titleSchema) {
    output.push(createFrontPlateSchema('title_front_plate', titleSchema, 2.8, 2.2, 3));
  }

  const payloadSchemas = createFrontPayloadSchemas(
    payloadKeys,
    byName,
    variant,
    safe,
    safeWidth,
    heightMm,
    Boolean(titleSchema),
  );
  payloadSchemas.forEach(schema => {
    output.push(createFrontPlateSchema(`${schema.name}_front_plate`, schema, 2.6, 2.1, 2.8));
  });

  const qrSchema = utilityKeys.includes('qr')
    ? createFrontQrSchema(byName.get('qr'), variant, safe, widthMm, heightMm)
    : null;
  if (qrSchema) {
    output.push(createFrontPlateSchema('qr_front_plate', qrSchema, 2.2, 2.2, 2.4, '#fffaf0', 0.94));
  }

  const brandSchema = utilityKeys.includes('brand')
    ? createFrontBrandSchema(byName.get('brand'), variant, safe, safeWidth, heightMm)
    : null;

  if (numberSchema) output.push(numberSchema);
  if (titleSchema) output.push(titleSchema);
  output.push(...payloadSchemas);
  if (qrSchema) output.push(qrSchema);
  if (brandSchema) output.push(brandSchema);

  return output;
}

function getFrontLayoutVariant(payloadCount: number): FrontLayoutVariant {
  if (payloadCount === 0) return 'poster';
  if (payloadCount <= 2) return 'captioned-art';
  return 'content-panel';
}

function createFullBleedArtSchema(previous: Schema | undefined, widthMm: number, heightMm: number): Schema {
  return {
    ...(previous ? cloneSchema(previous) : {}),
    name: 'art',
    type: 'image',
    position: { x: 0, y: 0 },
    width: widthMm,
    height: heightMm,
    rotate: 0,
  } as Schema;
}

function createFrontNumberSchema(previous: Schema | undefined, safe: number): Schema {
  return createFrontTextSchema('number', previous, {
    x: safe,
    y: safe,
    width: 16,
    height: 8,
    fontSize: 12,
    alignment: 'center',
    fontName: 'Outfit',
    fontColor: '#ffffff',
    letterSpacing: 0.7,
  });
}

function createFrontTitleSchema(
  previous: Schema | undefined,
  variant: FrontLayoutVariant,
  safe: number,
  safeWidth: number,
  heightMm: number,
  payloadCount: number,
): Schema {
  const titleHeight = variant === 'poster' ? 10 : 8.5;
  const posterY = heightMm - safe - titleHeight - 5;
  const panelY = variant === 'captioned-art'
    ? heightMm - getCaptionPanelHeight(heightMm, payloadCount) - safe + 4
    : safe + 5;

  return createFrontTextSchema('title', previous, {
    x: safe,
    y: variant === 'poster' ? posterY : panelY,
    width: safeWidth,
    height: titleHeight,
    fontSize: variant === 'content-panel' ? 10.5 : 11.5,
    alignment: 'center',
    fontName: 'Cormorant Garamond',
    fontColor: '#ffffff',
    letterSpacing: variant === 'content-panel' ? 1.4 : 2.4,
  });
}

function createFrontPayloadSchemas(
  payloadKeys: CardFieldPlacementKey[],
  byName: Map<string, Schema>,
  variant: FrontLayoutVariant,
  safe: number,
  safeWidth: number,
  heightMm: number,
  hasTitle: boolean,
): Schema[] {
  if (payloadKeys.length === 0) return [];

  const panelY = variant === 'captioned-art'
    ? heightMm - getCaptionPanelHeight(heightMm, payloadKeys.length) - safe
    : safe;
  const panelBottom = variant === 'captioned-art'
    ? heightMm - safe
    : heightMm - safe;
  let cursorY = panelY + (hasTitle ? 16 : 5);
  const gap = variant === 'captioned-art' ? 2.4 : 3;
  const availableHeight = Math.max(12, panelBottom - cursorY - 6);
  const weights = payloadKeys.map(getFrontPayloadWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return payloadKeys.map((key, index) => {
    const height = Math.max(
      getFrontPayloadMinimumHeight(key),
      (availableHeight - (gap * Math.max(0, payloadKeys.length - 1))) * (weights[index] / totalWeight),
    );
    const schema = createFrontTextSchema(key, byName.get(key), {
      x: safe + 3,
      y: cursorY,
      width: safeWidth - 6,
      height,
      fontSize: getFrontPayloadFontSize(key, variant),
      alignment: key === 'answer' || key === 'fun_fact' ? 'left' : 'center',
      fontName: key === 'phrase' ? 'Cormorant Garamond' : 'Outfit',
      fontColor: '#ffffff',
      letterSpacing: key === 'when_to_use' ? 1.1 : 0,
    });

    cursorY += height + gap;
    return schema;
  });
}

function createFrontQrSchema(
  previous: Schema | undefined,
  variant: FrontLayoutVariant,
  safe: number,
  widthMm: number,
  heightMm: number,
): Schema {
  const size = Math.max(8, Math.min(widthMm, heightMm) * 0.13);
  const inContentPanel = variant === 'content-panel';
  return {
    name: 'qr',
    type: 'qrcode',
    position: {
      x: widthMm - safe - size,
      y: inContentPanel ? heightMm - safe - size : safe,
    },
    width: size,
    height: size,
    barColor: getPreviousString(previous, 'barColor') ?? '#111111',
    rotate: 0,
  } as Schema;
}

function createFrontBrandSchema(
  previous: Schema | undefined,
  variant: FrontLayoutVariant,
  safe: number,
  safeWidth: number,
  heightMm: number,
): Schema {
  return createFrontTextSchema('brand', previous, {
    x: safe,
    y: variant === 'content-panel' ? heightMm - safe - 5 : heightMm - safe - 3.8,
    width: safeWidth,
    height: 4,
    fontSize: 3.8,
    alignment: 'center',
    fontName: 'Outfit',
    fontColor: 'rgba(255,255,255,0.68)',
    letterSpacing: 2,
  });
}

function createFrontTextSchema(
  key: CardFieldPlacementKey,
  previous: Schema | undefined,
  preset: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    alignment: 'left' | 'center' | 'right';
    fontName: string;
    fontColor: string;
    letterSpacing?: number;
  },
): Schema {
  const previousFontName = getPreviousString(previous, 'fontName');
  return {
    name: key,
    type: 'text',
    position: { x: preset.x, y: preset.y },
    width: preset.width,
    height: preset.height,
    fontSize: preset.fontSize,
    alignment: preset.alignment,
    verticalAlignment: 'middle',
    fontName: previousFontName ?? preset.fontName,
    fontColor: preset.fontColor,
    letterSpacing: preset.letterSpacing ?? 0,
    rotate: 0,
    dynamicFontSize: {
      min: Math.max(3.8, preset.fontSize * 0.46),
      max: preset.fontSize,
      fit: 'vertical',
    },
  } as Schema;
}

function createFrontPanelSchema(
  variant: Exclude<FrontLayoutVariant, 'poster'>,
  safe: number,
  safeWidth: number,
  heightMm: number,
  payloadCount: number,
): Schema {
  const panelHeight = variant === 'captioned-art'
    ? getCaptionPanelHeight(heightMm, payloadCount)
    : heightMm - (safe * 2);
  const y = variant === 'captioned-art'
    ? heightMm - safe - panelHeight
    : safe;

  return createSvgRectSchema(
    'front_content_panel',
    safe,
    y,
    safeWidth,
    panelHeight,
    3.2,
    '#111111',
    variant === 'captioned-art' ? 0.68 : 0.76,
    'rgba(255,255,255,0.2)',
  );
}

function createFrontPlateSchema(
  name: string,
  target: Schema,
  padX: number,
  padY: number,
  radius: number,
  fill = '#111111',
  opacity = 0.72,
): Schema {
  const x = Math.max(0, target.position.x - padX);
  const y = Math.max(0, target.position.y - padY);
  return createSvgRectSchema(
    name,
    x,
    y,
    target.width + (padX * 2),
    target.height + (padY * 2),
    radius,
    fill,
    opacity,
    fill === '#111111' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)',
  );
}

function createSvgRectSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  opacity: number,
  stroke: string,
): Schema {
  const content = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">',
    `<rect x="0.5" y="0.5" width="99%" height="99%" rx="${radius}" ry="${radius}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1"/>`,
    '</svg>',
  ].join('');

  return {
    name,
    type: 'svg',
    content,
    position: { x, y },
    width,
    height,
    rotate: 0,
  } as Schema;
}

function getCaptionPanelHeight(heightMm: number, payloadCount: number): number {
  return Math.min(heightMm * 0.42, Math.max(heightMm * 0.26, 24 + (payloadCount * 9)));
}

function getFrontSafeMargin(widthMm: number, heightMm: number): number {
  return Math.max(4, Math.min(widthMm, heightMm) * 0.08);
}

function getFrontPayloadWeight(key: CardFieldPlacementKey): number {
  switch (key) {
    case 'phrase':
      return 1.6;
    case 'instruction':
      return 2.2;
    case 'when_to_use':
      return 0.9;
    case 'answer':
      return 1;
    case 'fun_fact':
      return 0.9;
    default:
      return 1;
  }
}

function getFrontPayloadMinimumHeight(key: CardFieldPlacementKey): number {
  switch (key) {
    case 'instruction':
      return 14;
    case 'phrase':
      return 12;
    case 'when_to_use':
      return 7;
    default:
      return 7;
  }
}

function getFrontPayloadFontSize(key: CardFieldPlacementKey, variant: FrontLayoutVariant): number {
  const compact = variant === 'captioned-art';
  switch (key) {
    case 'phrase':
      return compact ? 9.8 : 12.5;
    case 'instruction':
      return compact ? 6.4 : 7.2;
    case 'when_to_use':
      return compact ? 4.6 : 5.4;
    case 'answer':
    case 'fun_fact':
      return compact ? 5.2 : 5.8;
    default:
      return 5.8;
  }
}

function isFullBleedSchema(schema: Schema, widthMm: number, heightMm: number): boolean {
  const tolerance = 0.4;
  return Math.abs((schema.position?.x ?? 0)) <= tolerance &&
    Math.abs((schema.position?.y ?? 0)) <= tolerance &&
    Math.abs((schema.width ?? 0) - widthMm) <= tolerance &&
    Math.abs((schema.height ?? 0) - heightMm) <= tolerance &&
    Math.abs(schema.rotate ?? 0) <= tolerance;
}

function isFrontFieldNearDefault(
  schema: Schema,
  key: CardFieldPlacementKey,
  widthMm: number,
  heightMm: number,
): boolean {
  const preset = getDefaultTextPreset(key, 'front', widthMm, heightMm);
  const tolerance = 1.2;
  return Math.abs((schema.position?.x ?? 0) - preset.x) <= tolerance &&
    Math.abs((schema.position?.y ?? 0) - preset.y) <= tolerance &&
    Math.abs((schema.width ?? 0) - preset.width) <= tolerance &&
    Math.abs((schema.height ?? 0) - preset.height) <= tolerance;
}

function isGeneratedFrontSupportSchema(schema: Schema): boolean {
  return schema.name === 'front_content_panel' ||
    schema.name.endsWith('_front_plate') ||
    schema.name === 'front_art_scrim';
}
