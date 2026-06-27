import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import type { Template } from '@pdfme/common';

type CardFace = 'front' | 'back';
type GeneratedAssetType = 'svg' | 'image';
type TemplateSchema = Template['schemas'][number][number];
type TemplateSchemaWithContent = TemplateSchema & { content?: string };

interface UseTemplateAssetGenerationParams {
  activeDeck: RawDeckContent | null | undefined;
  activeTemplate: Template | null | undefined;
  getLiveTemplate: () => Template | undefined;
  setMockData: Dispatch<SetStateAction<Record<string, string> | null>>;
  onTemplateChange: (template: Template) => void;
}

export function useTemplateAssetGeneration({
  activeDeck,
  activeTemplate,
  getLiveTemplate,
  setMockData,
  onTemplateChange,
}: UseTemplateAssetGenerationParams) {
  const handleBackgroundGenerated = useCallback(async (
    dataUrl: string,
    widthMm: number,
    heightMm: number,
    face: CardFace,
  ) => {
    if (!activeDeck) return;

    const liveTemplate = getLiveTemplate() || activeTemplate;
    if (!liveTemplate) return;

    const targetNode = getBackgroundNodeName(face);
    const nextTemplate = applyGeneratedBackground(
      liveTemplate,
      dataUrl,
      widthMm,
      heightMm,
      face,
      targetNode,
    );

    setMockData(prev => prev ? { ...prev, [targetNode]: dataUrl } : prev);
    onTemplateChange(nextTemplate);

    try {
      const response = await fetch('/__cms__/set-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, face, deckId: activeDeck.id }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      console.error('Error setting frame globally:', error);
    }
  }, [activeDeck, activeTemplate, getLiveTemplate, onTemplateChange, setMockData]);

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
): Template {
  const nextTemplate = {
    ...template,
    basePdf: { width: widthMm, height: heightMm, padding: [0, 0, 0, 0] as [number, number, number, number] },
  };
  const pageIndex = getFacePageIndex(face);
  const pageSchemas = nextTemplate.schemas[pageIndex];
  if (!pageSchemas) return nextTemplate;

  const backgroundIndex = pageSchemas.findIndex(schema => schema.name === targetNode);
  if (backgroundIndex < 0) return nextTemplate;

  const nextSchemas = [...pageSchemas];
  nextSchemas[backgroundIndex] = {
    ...nextSchemas[backgroundIndex],
    content: dataUrl,
  } as TemplateSchemaWithContent;
  nextTemplate.schemas[pageIndex] = nextSchemas;

  return nextTemplate;
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
