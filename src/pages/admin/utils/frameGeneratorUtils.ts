import {
  DECKS,
  LAYOUT_PRESETS,
  type BarajaTemplateMetadata,
  type CardType,
  type DeckId,
} from '@entity-builders/deck-engine';
import { DECK_EDITIONS, type DeckEdition } from '../../../lib/editions';
import type { GeneratedFrame, LibraryFrame, TypographySuggestion } from '../frameGeneratorTypes';

export const FRAME_DIMENSION_PRESETS = [
  { label: 'Baraja Standard (70×120mm)', widthMm: 70, heightMm: 120 },
  { label: 'Bridge Cards (57×89mm)', widthMm: 57, heightMm: 89 },
  { label: 'Poker Cards (63×88mm)', widthMm: 63, heightMm: 88 },
  { label: 'Tarot (70×121mm)', widthMm: 70, heightMm: 121 },
];

export const FRAME_PREVIEW_HEIGHT = 420;
export const DEFAULT_FRAME_BUILDER_METADATA: BarajaTemplateMetadata = {
  themeDescription: 'Party Drinking game, dark neon club vibe',
  cardType: 'party',
  layout: LAYOUT_PRESETS['back-standard'].layout,
  primaryColorHex: '',
};

export function getFrameDimensions(
  presetIndex: number,
  customWidth: number,
  customHeight: number
) {
  return presetIndex < FRAME_DIMENSION_PRESETS.length
    ? FRAME_DIMENSION_PRESETS[presetIndex]
    : { label: 'Custom', widthMm: customWidth, heightMm: customHeight };
}

export function getFramePreviewSize(dims: { widthMm: number; heightMm: number }) {
  const aspectRatio = dims.widthMm / dims.heightMm;

  return {
    height: FRAME_PREVIEW_HEIGHT,
    width: Math.round(FRAME_PREVIEW_HEIGHT * aspectRatio),
  };
}

export function getActiveCardFields(cardContent: Record<string, string>): string[] {
  return Object.keys(cardContent || {}).filter((key) =>
    !['back_image_url', 'back_image_versions', 'qr_url'].includes(key) &&
    typeof cardContent[key] === 'string' &&
    Boolean(cardContent[key])
  );
}

export function getCardContentForFrameGeneration({
  cardContent,
  frameThemeChoice,
  promptToSend,
}: {
  cardContent: Record<string, string>;
  frameThemeChoice: 'dark' | 'light';
  promptToSend: string;
}) {
  const hasContent = cardContent.when_to_use || cardContent.phrase || cardContent.instruction;

  if (!hasContent) {
    return undefined;
  }

  return {
    ...cardContent,
    frameDescription: promptToSend.slice(0, 120),
    framePalette: frameThemeChoice === 'light' ? 'light/warm parchment' : 'dark navy or black',
  };
}

export function createGeneratedFrameFromResponse({
  dataUrl,
  face,
  heightMm,
  prompt,
  typography,
  widthMm,
}: {
  dataUrl: string;
  face: 'front' | 'back';
  heightMm: number;
  prompt: string;
  typography?: TypographySuggestion | null;
  widthMm: number;
}): GeneratedFrame {
  return {
    dataUrl,
    presetId: 'master-builder',
    prompt,
    face,
    widthMm,
    heightMm,
    timestamp: Date.now(),
    typography,
  };
}

export function mapLibraryFrameToGeneratedFrame(frame: LibraryFrame): GeneratedFrame {
  return {
    dataUrl: frame.url,
    presetId: frame.presetId,
    prompt: frame.prompt,
    face: frame.face,
    widthMm: frame.widthMm,
    heightMm: frame.heightMm,
    timestamp: frame.timestamp,
    typography: frame.typography,
  };
}

export function getFrameDownloadFilename(frame: GeneratedFrame): string {
  const ext = frame.dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';

  return `frame-${frame.face}-${frame.widthMm}x${frame.heightMm}-${frame.timestamp}.${ext}`;
}

export function findFrameEdition(editionId: string): DeckEdition {
  return DECK_EDITIONS.find((edition) => edition.id === editionId) ?? DECK_EDITIONS[0];
}

export function getFrameDeckAutofill(deckId: DeckId): {
  deckMetadata: Partial<BarajaTemplateMetadata>;
  edition: DeckEdition | null;
  inferredType: CardType;
} | null {
  const deck = DECKS[deckId];

  if (!deck) {
    return null;
  }

  const edition = DECK_EDITIONS.find((candidate) =>
    candidate.deckEngineIds?.includes(deckId) || candidate.id === deckId
  ) ?? null;

  return {
    deckMetadata: {
      themeDescription: `${deck.name}. ${deck.metadata.topic}. Ambientación: ${deck.metadata.tone}.`,
      primaryColorHex: deck.design?.primary_color,
    },
    edition,
    inferredType: edition ? inferCardTypeFromEditionId(edition.id) : 'custom',
  };
}

function inferCardTypeFromEditionId(editionId: string): CardType {
  const typeMap: Record<string, CardType> = {
    barometro: 'therapeutic',
    trivia: 'trivia',
    juegos: 'game',
    rompelo: 'party',
  };

  return typeMap[editionId] ?? 'custom';
}
