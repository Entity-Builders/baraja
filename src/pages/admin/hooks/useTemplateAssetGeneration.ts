import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import type { Template } from '@pdfme/common';
import { invalidateFrameCache } from '../../../lib/cardFrame';
import {
  applyFieldPlacementsToTemplate,
  type FieldPlacementMap,
} from '../../../lib/cardFieldPlacements';
import {
  createDefaultCardTemplate,
  type PdfTypographyHints,
} from '../../../lib/pdfmeConfig';

type CardFace = 'front' | 'back';
type GeneratedAssetType = 'svg' | 'image';
type TemplateSchema = Template['schemas'][number][number];
type TemplateSchemaWithContent = TemplateSchema & { content?: string };
type AppliedBackgroundResult = {
  template: Template;
  appliedNodeName: string;
};

interface UseTemplateAssetGenerationParams {
  activeDeck: RawDeckContent | null | undefined;
  activeTemplate: Template | null | undefined;
  fieldPlacements: FieldPlacementMap;
  getLiveTemplate: () => Template | undefined;
  onBackgroundSourceChange?: (dataUrl: string) => void;
  setMockData: Dispatch<SetStateAction<Record<string, string> | null>>;
  onTemplateChange: (template: Template) => void;
}

export function useTemplateAssetGeneration({
  activeDeck,
  activeTemplate,
  fieldPlacements,
  getLiveTemplate,
  onBackgroundSourceChange,
  setMockData,
  onTemplateChange,
}: UseTemplateAssetGenerationParams) {
  const handleBackgroundGenerated = useCallback(async (
    dataUrl: string,
    widthMm: number,
    heightMm: number,
    face: CardFace,
    typography?: PdfTypographyHints | null,
  ) => {
    if (!activeDeck) return;

    const liveTemplate = getLiveTemplate() || activeTemplate;
    if (!liveTemplate) return;

    const targetNode = getBackgroundNodeName(face);
    const backgroundResult = applyGeneratedBackground(
      liveTemplate,
      dataUrl,
      widthMm,
      heightMm,
      face,
      targetNode,
    );
    let nextTemplate = backgroundResult.template;
    let appliedNodeName = backgroundResult.appliedNodeName;

    if (face === 'back' && typography) {
      nextTemplate = applyGeneratedTypographyToBackLayout(
        nextTemplate,
        typography,
        fieldPlacements,
        widthMm,
        heightMm,
      );
      const reappliedBackground = applyGeneratedBackground(nextTemplate, dataUrl, widthMm, heightMm, face, targetNode);
      nextTemplate = reappliedBackground.template;
      appliedNodeName = reappliedBackground.appliedNodeName;
    }

    setMockData(prev => prev ? applyBackgroundToMockData(prev, face, targetNode, appliedNodeName, dataUrl) : prev);
    onBackgroundSourceChange?.(dataUrl);
    onTemplateChange(nextTemplate);

    try {
      invalidateFrameCache(activeDeck.slug ?? activeDeck.id);
      const response = await fetch('/__cms__/set-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, face, deckId: activeDeck.id }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || `HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      console.error('Error setting frame globally:', error);
      alert(`No se pudo guardar el fondo activo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [activeDeck, activeTemplate, fieldPlacements, getLiveTemplate, onBackgroundSourceChange, onTemplateChange, setMockData]);

  const handleAssetGenerated = useCallback(async (
    content: string,
    type: GeneratedAssetType,
    face: CardFace,
    elementName?: string,
  ) => {
    const liveTemplate = getLiveTemplate() || activeTemplate;
    if (!liveTemplate) return;

    const nextTemplate = applyGeneratedAsset(
      liveTemplate,
      content,
      type,
      face,
      elementName || `asset_${Date.now()}`,
    );
    if (!nextTemplate) return;

    onTemplateChange(nextTemplate);
  }, [activeTemplate, getLiveTemplate, onTemplateChange]);

  return {
    handleBackgroundGenerated,
    handleAssetGenerated,
  };
}

function applyGeneratedTypographyToBackLayout(
  template: Template,
  typography: PdfTypographyHints,
  fieldPlacements: FieldPlacementMap,
  widthMm: number,
  heightMm: number,
): Template {
  const typographyTemplate = createDefaultCardTemplate(widthMm, heightMm, typography);
  const frontPage = template.schemas[0] ? [...template.schemas[0]] : typographyTemplate.schemas[0] ?? [];
  const backPage = (typographyTemplate.schemas[1] ?? [])
    .filter(schema => shouldKeepGeneratedTypographySchema(schema, fieldPlacements));

  const mergedTemplate: Template = {
    ...typographyTemplate,
    basePdf: { width: widthMm, height: heightMm, padding: [0, 0, 0, 0] as [number, number, number, number] },
    schemas: [frontPage, backPage],
    sampledata: template.sampledata ?? typographyTemplate.sampledata,
  };

  return applyFieldPlacementsToTemplate(mergedTemplate, fieldPlacements, widthMm, heightMm);
}

function shouldKeepGeneratedTypographySchema(
  schema: TemplateSchema,
  fieldPlacements: FieldPlacementMap,
): boolean {
  const name = typeof schema.name === 'string' ? schema.name : '';
  if (!name.endsWith('_container_bg')) return true;

  const fieldName = name.slice(0, -'_container_bg'.length);
  return fieldPlacements[fieldName as keyof FieldPlacementMap] === 'back';
}

function getFacePageIndex(face: CardFace): number {
  return face === 'front' ? 0 : 1;
}

function getBackgroundNodeName(face: CardFace): string {
  return face === 'front' ? 'art' : 'bg';
}

function applyGeneratedBackground(
  template: Template,
  dataUrl: string,
  widthMm: number,
  heightMm: number,
  face: CardFace,
  targetNode: string,
): AppliedBackgroundResult {
  const pageIndex = getFacePageIndex(face);
  const schemas = template.schemas.map(page => [...page]);
  while (schemas.length <= pageIndex) schemas.push([]);

  const nextTemplate = {
    ...template,
    schemas,
    basePdf: { width: widthMm, height: heightMm, padding: [0, 0, 0, 0] as [number, number, number, number] },
  };
  const pageSchemas = nextTemplate.schemas[pageIndex];
  if (!pageSchemas) return { template: nextTemplate, appliedNodeName: targetNode };

  const backgroundIndex = findBackgroundSchemaIndex(pageSchemas, face, targetNode, widthMm, heightMm);
  const appliedNodeName = backgroundIndex >= 0
    ? pageSchemas[backgroundIndex].name
    : targetNode;

  const nextSchemas = [...pageSchemas];
  if (backgroundIndex >= 0) {
    nextSchemas[backgroundIndex] = {
      ...nextSchemas[backgroundIndex],
      position: { x: 0, y: 0 },
      width: widthMm,
      height: heightMm,
      content: dataUrl,
    } as TemplateSchemaWithContent;
  } else {
    nextSchemas.unshift(createBackgroundSchema(targetNode, dataUrl, widthMm, heightMm));
  }
  nextTemplate.schemas[pageIndex] = nextSchemas;

  return { template: nextTemplate, appliedNodeName };
}

function findBackgroundSchemaIndex(
  pageSchemas: TemplateSchema[],
  face: CardFace,
  targetNode: string,
  widthMm: number,
  heightMm: number,
): number {
  const candidateNames = getBackgroundNodeCandidates(face, targetNode);
  for (const name of candidateNames) {
    const index = pageSchemas.findIndex(schema => schema.name === name && schema.type === 'image');
    if (index >= 0) return index;
  }

  return pageSchemas.findIndex(schema => isFullBleedImageSchema(schema, widthMm, heightMm));
}

function getBackgroundNodeCandidates(face: CardFace, targetNode: string): string[] {
  const faceCandidates = face === 'front'
    ? ['art', 'front_art', 'front_bg']
    : ['bg', 'back_ai_image', 'full_back_image', 'back_image_url', 'back_bg'];
  return [...new Set([targetNode, ...faceCandidates])];
}

function isFullBleedImageSchema(schema: TemplateSchema, widthMm: number, heightMm: number): boolean {
  const position = schema.position as { x?: number; y?: number };
  const isNearOrigin = Math.abs(Number(position.x ?? 0)) <= 0.5 && Math.abs(Number(position.y ?? 0)) <= 0.5;
  return schema.type === 'image'
    && isNearOrigin
    && schema.width >= widthMm * 0.85
    && schema.height >= heightMm * 0.85;
}

function createBackgroundSchema(
  name: string,
  content: string,
  widthMm: number,
  heightMm: number,
): TemplateSchemaWithContent {
  return {
    name,
    type: 'image',
    position: { x: 0, y: 0 },
    width: widthMm,
    height: heightMm,
    rotate: 0,
    content,
  } as TemplateSchemaWithContent;
}

function applyBackgroundToMockData(
  mockData: Record<string, string>,
  face: CardFace,
  targetNode: string,
  appliedNodeName: string,
  dataUrl: string,
): Record<string, string> {
  const next = {
    ...mockData,
    [targetNode]: dataUrl,
    [appliedNodeName]: dataUrl,
  };

  if (face === 'back') {
    if (appliedNodeName === 'bg') delete next.back_ai_image;
    if (appliedNodeName === 'back_ai_image') delete next.bg;
  }

  return next;
}

function applyGeneratedAsset(
  template: Template,
  content: string,
  type: GeneratedAssetType,
  face: CardFace,
  elementName: string,
): Template | null {
  const nextTemplate = { ...template };
  const pageIndex = getFacePageIndex(face);
  const pageSchemas = nextTemplate.schemas[pageIndex];
  if (!pageSchemas) return null;

  const nextSchemas = [...pageSchemas];
  const existingIndex = nextSchemas.findIndex(node => node.name === elementName);

  if (existingIndex >= 0) {
    nextSchemas[existingIndex] = {
      ...nextSchemas[existingIndex],
      content,
    } as TemplateSchemaWithContent;
  } else {
    const backgroundIndex = nextSchemas.findIndex(node => node.name === 'bg' || node.name === 'art');
    const insertPosition = backgroundIndex >= 0 ? backgroundIndex + 1 : 0;
    nextSchemas.splice(insertPosition, 0, createGeneratedAssetSchema(elementName, content, type));
  }

  nextTemplate.schemas[pageIndex] = nextSchemas;
  return nextTemplate;
}

function createGeneratedAssetSchema(
  name: string,
  content: string,
  type: GeneratedAssetType,
): TemplateSchemaWithContent {
  return {
    name,
    type,
    position: { x: 10, y: 30 },
    width: type === 'image' ? 60 : 50,
    height: type === 'image' ? 40 : 30,
    content,
  } as TemplateSchemaWithContent;
}
