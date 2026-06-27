import type { Schema, Template } from '@pdfme/common';
import { applyReadableSchemaColors } from '../../../../lib/cardReadability';
import { normalizeTemplateFieldAliases } from '../../../../lib/cardFieldPlacements';

type SchemaWithContent = Schema & {
  content?: string;
};

const FULL_BLEED_ELEMENT_NAMES = new Set(['art', 'bg', 'back_ai_image']);
const DEFAULT_TEMPLATE_WIDTH_MM = 70;
const DEFAULT_TEMPLATE_HEIGHT_MM = 120;

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
  return applyReadableSchemaColors(withMockContent, mockData);
}

export function getStoredSchemas(template: Template, mockData: Record<string, string>): [Schema[], Schema[]] {
  const cleanedSchemas = stripMockDataFromSchemas(template.schemas, mockData);
  return [cleanedSchemas[0] || [], cleanedSchemas[1] || []];
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
