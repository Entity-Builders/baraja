import type { Schema, Template } from '@pdfme/common';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { applyReadableSchemaColors } from '../../../../lib/cardReadability';
import {
  applyFieldPlacementsToTemplate,
  CARD_FIELD_KEYS,
  normalizeTemplateFieldAliases,
  type FieldPlacementMap,
} from '../../../../lib/cardFieldPlacements';
import { createDefaultCardTemplate } from '../../../../lib/pdfmeConfig';
import {
  cardUsesFlujob,
  shouldUseLegacyFullBackTemplate,
  type DeckReverseModelInfo,
} from '../../../../lib/reverseModel';

type SchemaWithContent = Schema & {
  content?: string;
};

const FULL_BLEED_ELEMENT_NAMES = new Set(['art', 'bg', 'back_ai_image']);
const DEFAULT_TEMPLATE_WIDTH_MM = 70;
const DEFAULT_TEMPLATE_HEIGHT_MM = 120;
const EDITABLE_BACK_PREVIEW_NAMES = new Set<string>(['bg', ...CARD_FIELD_KEYS]);

export function getTemplateDimensions(template: Template): { width: number; height: number } {
  if (typeof template.basePdf === 'object' && 'width' in template.basePdf && 'height' in template.basePdf) {
    return {
      width: template.basePdf.width,
      height: template.basePdf.height,
    };
  }

  return {
    width: DEFAULT_TEMPLATE_WIDTH_MM,
    height: DEFAULT_TEMPLATE_HEIGHT_MM,
  };
}

export function scaleTemplateToCardSize(
  template: Template,
  width: number,
  height: number,
  previousWidth: number,
  previousHeight: number,
): Template {
  const ratioW = previousWidth > 0 ? width / previousWidth : 1;
  const ratioH = previousHeight > 0 ? height / previousHeight : 1;

  return {
    ...template,
    basePdf: { width, height, padding: [0, 0, 0, 0] as [number, number, number, number] },
    schemas: template.schemas.map(page =>
      page.map(schema => scaleSchema(schema, width, height, ratioW, ratioH))
    ),
  };
}

export function injectMockDataIntoSchemas(schemas: Schema[][], mockData: Record<string, string>): Schema[][] {
  return schemas.map(pageSchema =>
    pageSchema.map(schema => injectMockContent(schema, mockData))
  );
}

export function stripMockDataFromSchemas(schemas: Schema[][], mockData: Record<string, string>): Schema[][] {
  return schemas.map(pageSchema =>
    pageSchema.map(schema => stripMockContent(schema, mockData))
  );
}

export async function prepareDesignerTemplate(template: Template, mockData: Record<string, string>): Promise<Template> {
  const withMockContent = normalizeTemplateFieldAliases(template);
  withMockContent.schemas = injectMockDataIntoSchemas(withMockContent.schemas, mockData);
  return applyReadableSchemaColors(withMockContent, mockData, { respectExplicitColors: true });
}

export function getStoredSchemas(template: Template, mockData: Record<string, string>): [Schema[], Schema[]] {
  const cleanedSchemas = stripMockDataFromSchemas(template.schemas, mockData);
  return [cleanedSchemas[0] || [], cleanedSchemas[1] || []];
}

export function buildStudioPreviewTemplate({
  activeCardIndex,
  deck,
  fieldPlacements,
  height,
  reverseModelInfo,
  template,
  width,
}: {
  activeCardIndex: number;
  deck: DeckSchema;
  fieldPlacements: FieldPlacementMap;
  height: number;
  reverseModelInfo: DeckReverseModelInfo | null;
  template: Template;
  width: number;
}): Template {
  if (!reverseModelInfo || !shouldUseLegacyFullBackTemplate(reverseModelInfo)) {
    return template;
  }

  const card = deck.cards[activeCardIndex];
  if (!card || cardUsesFlujob(card)) {
    return template;
  }

  const sourceTemplate = getEditablePreviewSourceTemplate(deck.design?.layout_config, width, height);
  return applyFieldPlacementsToTemplate(sourceTemplate, fieldPlacements, width, height);
}

function injectMockContent(schema: Schema, mockData: Record<string, string>): Schema {
  const next = { ...schema } as SchemaWithContent;
  if (mockData[next.name] !== undefined) next.content = String(mockData[next.name]);
  return next;
}

function stripMockContent(schema: Schema, mockData: Record<string, string>): Schema {
  const next = { ...schema } as SchemaWithContent;
  if (mockData[next.name] !== undefined) delete next.content;
  return next;
}

function getEditablePreviewSourceTemplate(
  layoutConfig: unknown,
  width: number,
  height: number,
): Template {
  const configuredTemplate = coerceEditablePreviewTemplate(layoutConfig, width, height);
  if (configuredTemplate) return configuredTemplate;

  return createDefaultCardTemplate(width, height);
}

function coerceEditablePreviewTemplate(
  layoutConfig: unknown,
  width: number,
  height: number,
): Template | null {
  if (!isTemplateLike(layoutConfig)) return null;

  const template = normalizeTemplateFieldAliases(JSON.parse(JSON.stringify(layoutConfig)) as Template);
  const backPage = template.schemas[1];
  if (Array.isArray(backPage) && hasEditableBackPreview(backPage)) {
    return template;
  }

  const singlePage = template.schemas[0];
  if (template.schemas.length === 1 && Array.isArray(singlePage) && hasEditableBackPreview(singlePage)) {
    const defaults = createDefaultCardTemplate(width, height);
    return {
      ...template,
      basePdf: template.basePdf || defaults.basePdf,
      schemas: [defaults.schemas[0] || [], singlePage],
    };
  }

  return null;
}

function isTemplateLike(value: unknown): value is Template {
  return (
    typeof value === 'object' &&
    value !== null &&
    'basePdf' in value &&
    'schemas' in value &&
    Array.isArray((value as { schemas?: unknown }).schemas)
  );
}

function hasEditableBackPreview(schemas: Schema[]): boolean {
  return schemas.some(schema => EDITABLE_BACK_PREVIEW_NAMES.has(schema.name));
}

function scaleSchema(
  schema: Schema,
  width: number,
  height: number,
  ratioW: number,
  ratioH: number,
): Schema {
  if (FULL_BLEED_ELEMENT_NAMES.has(schema.name)) {
    return {
      ...schema,
      position: { x: 0, y: 0 },
      width,
      height,
    };
  }

  const pos = schema.position as { x: number; y: number };
  return {
    ...schema,
    position: {
      x: Math.round((pos.x * ratioW) * 100) / 100,
      y: Math.round((pos.y * ratioH) * 100) / 100,
    },
    width: Math.round((schema.width * ratioW) * 100) / 100,
    height: Math.round((schema.height * ratioH) * 100) / 100,
  };
}
