import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Template } from '@pdfme/common';
import { SupabaseDeckRepository } from '../../../../lib/deckRepository';
import { persistAdminEditionUpdates } from '../../../../lib/adminDeckPersistence';
import type { DeckSchema, RawDeckContent } from '@entity-builders/deck-engine';
import {
  getTemplateForDeck,
  createDefaultCardTemplate,
  normalizeFlujoBTemplate,
  type PdfTypographyHints,
  type PdfTypographyZone,
} from '../../../../lib/pdfmeConfig';
import {
  buildLegacyFullBackReferences,
  getDeckReverseModel,
  shouldUseEditableReverseLayout,
  shouldUseLegacyFullBackTemplate,
  type DeckReverseModelInfo,
} from '../../../../lib/reverseModel';
import { mergeLongestTextByField } from '../../../../lib/typographyFit';
import {
  CARD_FIELD_DEFINITIONS,
  applyFieldPlacementsToTemplate,
  getHiddenFieldsFromPlacements,
  normalizeTemplateFieldAliases,
  normalizeFieldPlacements,
  type FieldPlacementMap,
} from '../../../../lib/cardFieldPlacements';
import { buildDeckStudioMockData } from './deckStudioMockData';
import {
  buildStudioPreviewTemplate,
  getTemplateDimensions,
  scaleTemplateToCardSize,
} from './deckStudioTemplateUtils';

const deckRepo = new SupabaseDeckRepository();
const AUTO_LAYOUT_BACK_FIELD_KEYS = ['when_to_use', 'phrase', 'instruction', 'answer', 'fun_fact'] as const;
type AutoLayoutBackFieldKey = typeof AUTO_LAYOUT_BACK_FIELD_KEYS[number];

const DARK_TEXT = '#17120b';
const DARK_MUTED_TEXT = '#40362a';
const LIGHT_TEXT = '#fff8ea';
const LIGHT_MUTED_TEXT = '#f4e7cf';
const DARK_TEXT_LUMINANCE = 0.006;
const LIGHT_TEXT_LUMINANCE = 0.94;

/**
 * Raw data: URI for the background image, kept separate from the blob URL
 * used for browser rendering. The server-side Vision API cannot read blob: URLs,
 * so we pass this raw URI when calling analyze-typography.
 */
let _bgRawDataUri = '';

function broadcastTemplateUpdated(deckId: string): void {
  try {
    const channel = new BroadcastChannel('baraja_template_updates');
    channel.postMessage({ type: 'TEMPLATE_UPDATED', deckId });
    channel.close();
  } catch (err) {
    console.warn('[DeckStudio] Failed to broadcast template update:', err);
  }
}

function pickBackAutoLayoutFields(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input) return {};

  return AUTO_LAYOUT_BACK_FIELD_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

interface AnalyzeTypographyResponse {
  success: boolean;
  typography?: Parameters<typeof createDefaultCardTemplate>[2];
  error?: string;
}

interface TypographyZoneBounds {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

interface BackgroundSample {
  luminance: number;
  variance: number;
}

class AnalyzeTypographyUnavailableError extends Error {
  constructor() {
    super('El analizador IA de tipografia no esta disponible en esta build.');
    this.name = 'AnalyzeTypographyUnavailableError';
  }
}

async function readAnalyzeTypographyResponse(response: Response): Promise<AnalyzeTypographyResponse> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new AnalyzeTypographyUnavailableError();
  }

  const data = await response.json() as AnalyzeTypographyResponse;
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Analyze typography failed with status ${response.status}.`);
  }

  return data;
}

async function buildBrowserFallbackTypography(params: {
  cardContent: Record<string, unknown>;
  hiddenFields: Record<string, boolean>;
  imageSrc: string;
}): Promise<PdfTypographyHints> {
  const visibleKeys = AUTO_LAYOUT_BACK_FIELD_KEYS.filter(key => (
    !isAutoLayoutFieldHidden(key, params.hiddenFields) &&
    hasAutoLayoutText(params.cardContent[key])
  ));
  const slots = buildFallbackTypographySlots(visibleKeys, params.cardContent);
  const hints: PdfTypographyHints = {};

  for (const key of visibleKeys) {
    const slot = slots[key];
    if (!slot) continue;
    hints[key] = {
      ...slot,
      ...getFallbackTypographyStyle(key, params.cardContent[key], slot.primary),
    };
  }

  hints.brand = { color: DARK_MUTED_TEXT, fontFamily: 'Outfit' };
  hints.qrFgColor = DARK_TEXT;

  return enforceTypographyContrast(hints, params.imageSrc);
}

async function enforceTypographyContrast(
  typography: PdfTypographyHints | null | undefined,
  imageSrc: string,
): Promise<PdfTypographyHints> {
  const next: PdfTypographyHints = { ...(typography ?? {}) };
  const sampler = await createBackgroundSampler(imageSrc);

  for (const [key, value] of Object.entries(next)) {
    if (!isBoundedTypographyZone(value)) continue;
    const sample = sampler(value);
    const textColor = chooseReadableTextColor(sample.luminance, false);
    const needsOverlay = sample.variance > 0.12 || getContrastRatio(sample.luminance, textColor) < 5.8;

    next[key] = {
      ...value,
      color: textColor,
      backgroundComplexity: sample.variance > 0.16 ? 'high' : sample.variance > 0.08 ? 'medium' : 'low',
      readabilityScore: Math.min(1, getContrastRatio(sample.luminance, textColor) / 7),
      needsOverlay,
      containerSvg: needsOverlay ? buildContrastSupportSvg(textColor) : value.containerSvg,
    };
  }

  const brandSample = sampler({ leftPct: 20, topPct: 90, widthPct: 60, heightPct: 5 });
  const qrSample = sampler({ leftPct: 43, topPct: 79, widthPct: 14, heightPct: 10 });
  next.brand = {
    ...(isRecord(next.brand) ? next.brand : {}),
    color: chooseReadableTextColor(brandSample.luminance, true),
    fontFamily: typeof next.brand?.fontFamily === 'string' ? next.brand.fontFamily : 'Outfit',
  };
  next.qrFgColor = chooseReadableTextColor(qrSample.luminance, false);

  return next;
}

function buildFallbackTypographySlots(
  visibleKeys: AutoLayoutBackFieldKey[],
  cardContent: Record<string, unknown>,
): Partial<Record<AutoLayoutBackFieldKey, TypographyZoneBounds & { primary: boolean }>> {
  const slots: Partial<Record<AutoLayoutBackFieldKey, TypographyZoneBounds & { primary: boolean }>> = {};
  const payloadKeys = visibleKeys.filter(key => key !== 'when_to_use');
  const primaryKey = choosePrimaryAutoLayoutKey(payloadKeys, cardContent);

  if (visibleKeys.includes('when_to_use')) {
    slots.when_to_use = { leftPct: 17, topPct: 10.5, widthPct: 66, heightPct: 7, primary: false };
  }

  if (payloadKeys.length === 0) {
    return slots;
  }

  if (payloadKeys.length === 1) {
    slots[payloadKeys[0]] = { leftPct: 15, topPct: 36, widthPct: 70, heightPct: 28, primary: true };
    return slots;
  }

  const orderedKeys = [
    primaryKey,
    ...payloadKeys.filter(key => key !== primaryKey),
  ];
  const zoneStack: TypographyZoneBounds[] = payloadKeys.length === 2
    ? [
        { leftPct: 14, topPct: 28, widthPct: 72, heightPct: 30 },
        { leftPct: 16, topPct: 65, widthPct: 68, heightPct: 12 },
      ]
    : [
        { leftPct: 14, topPct: 24, widthPct: 72, heightPct: 26 },
        { leftPct: 15, topPct: 55, widthPct: 70, heightPct: 16 },
        { leftPct: 17, topPct: 76, widthPct: 66, heightPct: 9 },
        { leftPct: 18, topPct: 86, widthPct: 64, heightPct: 6 },
      ];

  orderedKeys.forEach((key, index) => {
    slots[key] = {
      ...zoneStack[Math.min(index, zoneStack.length - 1)],
      primary: key === primaryKey,
    };
  });

  return slots;
}

function choosePrimaryAutoLayoutKey(
  payloadKeys: AutoLayoutBackFieldKey[],
  cardContent: Record<string, unknown>,
): AutoLayoutBackFieldKey {
  if (payloadKeys.includes('phrase') && hasAutoLayoutText(cardContent.phrase)) return 'phrase';
  if (payloadKeys.includes('instruction') && hasAutoLayoutText(cardContent.instruction)) return 'instruction';
  return payloadKeys[0] ?? 'phrase';
}

function getFallbackTypographyStyle(
  key: AutoLayoutBackFieldKey,
  value: unknown,
  primary: boolean,
): PdfTypographyZone {
  const textLength = typeof value === 'string' ? value.trim().length : 0;
  const longText = textLength > 130;

  if (key === 'when_to_use') {
    return {
      fontFamily: 'Outfit',
      fontWeight: '800',
      fontSize: 4.9,
      lineHeight: 1.18,
      letterSpacing: 1.85,
    };
  }

  if (primary) {
    return {
      fontFamily: key === 'instruction' ? 'Lora' : 'Cormorant Garamond',
      fontWeight: '700',
      fontSize: key === 'instruction' ? (longText ? 7.7 : 9.2) : (longText ? 11.5 : 15.5),
      lineHeight: key === 'instruction' ? 1.28 : 1.14,
      letterSpacing: key === 'phrase' ? 0.1 : 0,
    };
  }

  return {
    fontFamily: key === 'answer' || key === 'fun_fact' ? 'Outfit' : 'Lora',
    fontWeight: key === 'answer' ? '700' : '600',
    fontSize: key === 'answer' || key === 'fun_fact' ? 5.8 : 6.6,
    lineHeight: 1.25,
    letterSpacing: 0,
  };
}

function hasAutoLayoutText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAutoLayoutFieldHidden(key: AutoLayoutBackFieldKey, hiddenFields: Record<string, boolean>): boolean {
  return Boolean(hiddenFields[key] || (key === 'when_to_use' && hiddenFields.whenToUse));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedTypographyZone(value: unknown): value is PdfTypographyZone & TypographyZoneBounds {
  return isRecord(value) &&
    typeof value.leftPct === 'number' &&
    typeof value.topPct === 'number' &&
    typeof value.widthPct === 'number' &&
    typeof value.heightPct === 'number';
}

function hasBoundedTypographyHints(typography: PdfTypographyHints): boolean {
  return Object.values(typography).some(isBoundedTypographyZone);
}

async function createBackgroundSampler(
  imageSrc: string,
): Promise<(zone: TypographyZoneBounds) => BackgroundSample> {
  try {
    const image = await loadImageForSampling(imageSrc);
    const maxCanvasSide = 180;
    const scale = Math.min(1, maxCanvasSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return getDefaultBackgroundSample;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return zone => sampleCanvasZone(context, canvas.width, canvas.height, zone);
  } catch (err) {
    console.warn('[DeckStudio] Could not sample active background for contrast.', err);
    return getDefaultBackgroundSample;
  }
}

function loadImageForSampling(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load background image.'));
    image.src = src;
  });
}

function sampleCanvasZone(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  zone: TypographyZoneBounds,
): BackgroundSample {
  try {
    const x = clampNumber(Math.floor((zone.leftPct / 100) * canvasWidth), 0, canvasWidth - 1);
    const y = clampNumber(Math.floor((zone.topPct / 100) * canvasHeight), 0, canvasHeight - 1);
    const width = clampNumber(Math.ceil((zone.widthPct / 100) * canvasWidth), 1, canvasWidth - x);
    const height = clampNumber(Math.ceil((zone.heightPct / 100) * canvasHeight), 1, canvasHeight - y);
    const data = context.getImageData(x, y, width, height).data;
    const step = Math.max(4, Math.floor((width * height) / 420));
    let count = 0;
    let total = 0;
    let totalSquared = 0;

    for (let pixel = 0; pixel < data.length; pixel += step * 4) {
      const alpha = data[pixel + 3] / 255;
      const luminance = getRelativeLuminance(
        blendWithWhite(data[pixel], alpha),
        blendWithWhite(data[pixel + 1], alpha),
        blendWithWhite(data[pixel + 2], alpha),
      );
      total += luminance;
      totalSquared += luminance * luminance;
      count += 1;
    }

    if (count === 0) return getDefaultBackgroundSample();
    const mean = total / count;
    const variance = Math.max(0, (totalSquared / count) - (mean * mean));
    return { luminance: mean, variance };
  } catch {
    return getDefaultBackgroundSample();
  }
}

function getDefaultBackgroundSample(): BackgroundSample {
  return { luminance: 0.92, variance: 0.02 };
}

function blendWithWhite(channel: number, alpha: number): number {
  return Math.round((channel * alpha) + (255 * (1 - alpha)));
}

function getRelativeLuminance(red: number, green: number, blue: number): number {
  const [r, g, b] = [red, green, blue].map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function chooseReadableTextColor(backgroundLuminance: number, muted: boolean): string {
  const darkContrast = getContrastRatio(backgroundLuminance, DARK_TEXT_LUMINANCE);
  const lightContrast = getContrastRatio(backgroundLuminance, LIGHT_TEXT_LUMINANCE);
  if (darkContrast >= lightContrast) {
    return muted ? DARK_MUTED_TEXT : DARK_TEXT;
  }
  return muted ? LIGHT_MUTED_TEXT : LIGHT_TEXT;
}

function getContrastRatio(backgroundLuminance: number, textColorOrLuminance: string | number): number {
  const textLuminance = typeof textColorOrLuminance === 'number'
    ? textColorOrLuminance
    : textColorOrLuminance === DARK_TEXT || textColorOrLuminance === DARK_MUTED_TEXT
      ? DARK_TEXT_LUMINANCE
      : LIGHT_TEXT_LUMINANCE;
  const lighter = Math.max(backgroundLuminance, textLuminance);
  const darker = Math.min(backgroundLuminance, textLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function buildContrastSupportSvg(textColor: string): string {
  const useLightPlate = textColor === DARK_TEXT || textColor === DARK_MUTED_TEXT;
  return useLightPlate
    ? '<rect width="100%" height="100%" rx="8" fill="rgba(255,255,255,0.72)" stroke="rgba(23,18,11,0.12)" stroke-width="1"/>'
    : '<rect width="100%" height="100%" rx="8" fill="rgba(0,0,0,0.42)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>';
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useDeckStudio() {
  const [decks, setDecks] = useState<RawDeckContent[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [activeRawDeck, setActiveRawDeck] = useState<RawDeckContent | null>(null);
  const [activeResolvedDeck, setActiveResolvedDeck] = useState<DeckSchema | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [mockData, setMockData] = useState<Record<string, string> | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);
  const [reverseModelInfo, setReverseModelInfo] = useState<DeckReverseModelInfo | null>(null);

  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>({});
  const [fieldPlacements, setFieldPlacements] = useState<FieldPlacementMap>(
    () => normalizeFieldPlacements(null)
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [activeFace, setActiveFace] = useState<'front' | 'back'>('back');

  // Card dimensions (mm) — derived from the active template's basePdf
  const [cardWidth, setCardWidth] = useState<number>(70);
  const [cardHeight, setCardHeight] = useState<number>(120);

  useEffect(() => {
    deckRepo.getAllDecks().then(data => {
      setDecks(data);
      setLoading(false);
    });
  }, []);

  const loadMockDataForCard = useCallback(async (
    deck: DeckSchema,
    template: Template,
    cardIndex: number,
    overrideHiddenFields?: Record<string, boolean>,
  ) => {
    const result = await buildDeckStudioMockData({
      deck,
      template,
      cardIndex,
      hiddenFields,
      overrideHiddenFields,
    });
    if (!result) return;

    if (result.backgroundDataUri) {
      _bgRawDataUri = result.backgroundDataUri;
    }

    setMockData(result.mockData);
  }, [hiddenFields]);

  const loadDeckLayout = useCallback(async (deckId: string) => {
    const rawDeck = decks.find(d => d.id === deckId || d.slug === deckId);
    if (!rawDeck) return;

    const { resolveDeck } = await import('@entity-builders/deck-engine');
    const deck = resolveDeck(rawDeck);
    const template = getTemplateForDeck(deck);
    const reverseModel = getDeckReverseModel(deck, template);
    const useLegacyTemplate = shouldUseLegacyFullBackTemplate(reverseModel);

    // Support legacy hide_player_count and merge to new structure
    const isPlayersHidden = !!rawDeck.design_template_overrides?.hide_player_count;
    const initialFieldPlacements = normalizeFieldPlacements(rawDeck.design_template_overrides || {});
    const initialHiddenFields = useLegacyTemplate
      ? {}
      : getHiddenFieldsFromPlacements(
          initialFieldPlacements,
          rawDeck.design_template_overrides?.hidden_fields || {},
        );
    if (isPlayersHidden) initialHiddenFields.player_count = true;

    // Extract card dimensions from the loaded template
    const { width: loadedW, height: loadedH } = getTemplateDimensions(template);
    const placedTemplate = useLegacyTemplate
      ? normalizeFlujoBTemplate(template, loadedW, loadedH)
      : applyFieldPlacementsToTemplate(template, initialFieldPlacements, loadedW, loadedH);

    setActiveRawDeck(rawDeck);
    setActiveResolvedDeck(deck);
    setActiveTemplate(placedTemplate);
    setActiveCardIndex(0);
    setReverseModelInfo(reverseModel);
    setHiddenFields(initialHiddenFields);
    setFieldPlacements(initialFieldPlacements);
    setCardWidth(loadedW);
    setCardHeight(loadedH);

    await loadMockDataForCard(deck, placedTemplate, 0, initialHiddenFields);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks]);

  useEffect(() => {
    if (selectedDeckId) {
      loadDeckLayout(selectedDeckId);
    } else {
      setActiveRawDeck(null);
      setActiveResolvedDeck(null);
      setActiveTemplate(null);
      setMockData(null);
      setReverseModelInfo(null);
    }
  }, [selectedDeckId, loadDeckLayout]);

  const handleNextCard = useCallback((templateOverride?: Template) => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const templateForPreview = templateOverride ?? activeTemplate;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const nextIdx = activeCardIndex < maxIdx ? activeCardIndex + 1 : 0;
    setActiveCardIndex(nextIdx);
    loadMockDataForCard(activeResolvedDeck, templateForPreview, nextIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolvedDeck, activeTemplate, activeCardIndex]);

  const handlePrevCard = useCallback((templateOverride?: Template) => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const templateForPreview = templateOverride ?? activeTemplate;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const prevIdx = activeCardIndex > 0 ? activeCardIndex - 1 : maxIdx;
    setActiveCardIndex(prevIdx);
    loadMockDataForCard(activeResolvedDeck, templateForPreview, prevIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolvedDeck, activeTemplate, activeCardIndex]);

  const handleJumpToCard = useCallback((cardIndex: number, templateOverride?: Template) => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const templateForPreview = templateOverride ?? activeTemplate;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const safeIdx = Math.max(0, Math.min(cardIndex, maxIdx));
    setActiveCardIndex(safeIdx);
    loadMockDataForCard(activeResolvedDeck, templateForPreview, safeIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolvedDeck, activeTemplate]);

  const handleHiddenFieldsChange = useCallback((newFields: Record<string, boolean>) => {
    if (reverseModelInfo && !shouldUseEditableReverseLayout(reverseModelInfo)) {
      return;
    }

    const nextFieldPlacements = { ...fieldPlacements };
    CARD_FIELD_DEFINITIONS.forEach(definition => {
      const hidden = newFields[definition.key] || (definition.key === 'when_to_use' && newFields.whenToUse);
      if (hidden) {
        nextFieldPlacements[definition.key] = 'hidden';
      } else if (nextFieldPlacements[definition.key] === 'hidden') {
        nextFieldPlacements[definition.key] = definition.defaultPlacement;
      }
    });

    setFieldPlacements(nextFieldPlacements);
    setHiddenFields(newFields);
    if (activeResolvedDeck && activeTemplate) {
      loadMockDataForCard(activeResolvedDeck, activeTemplate, activeCardIndex, newFields);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, fieldPlacements, reverseModelInfo]);

  const handleFieldPlacementsChange = useCallback((newPlacements: FieldPlacementMap) => {
    if (reverseModelInfo && !shouldUseEditableReverseLayout(reverseModelInfo)) {
      return;
    }

    const newHiddenFields = getHiddenFieldsFromPlacements(newPlacements, hiddenFields);
    const nextTemplate = activeTemplate
      ? applyFieldPlacementsToTemplate(activeTemplate, newPlacements, cardWidth, cardHeight)
      : null;

    setFieldPlacements(newPlacements);
    setHiddenFields(newHiddenFields);

    if (nextTemplate) {
      setActiveTemplate(nextTemplate);
    }

    if (activeResolvedDeck && nextTemplate) {
      loadMockDataForCard(activeResolvedDeck, nextTemplate, activeCardIndex, newHiddenFields);
    }
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, cardHeight, cardWidth, hiddenFields, loadMockDataForCard, reverseModelInfo]);

  const handleApplyTemplateSnapshot = useCallback((
    template: Template,
    width: number,
    height: number,
    nextHiddenFields: Record<string, boolean>,
  ) => {
    const useLegacyTemplate = reverseModelInfo ? shouldUseLegacyFullBackTemplate(reverseModelInfo) : false;
    const normalizedTemplate = useLegacyTemplate
      ? normalizeFlujoBTemplate(template, width, height)
      : normalizeTemplateFieldAliases(template);
    setActiveTemplate(normalizedTemplate);
    setCardWidth(width);
    setCardHeight(height);
    setHiddenFields(useLegacyTemplate ? {} : nextHiddenFields);

    if (activeResolvedDeck) {
      void loadMockDataForCard(activeResolvedDeck, normalizedTemplate, activeCardIndex, nextHiddenFields);
    }
  }, [activeResolvedDeck, activeCardIndex, loadMockDataForCard, reverseModelInfo]);

  const saveDeckTemplateSnapshot = useCallback(async (
    savedTpl: Template,
    hiddenFieldsSnapshot: Record<string, boolean>,
    fieldPlacementsSnapshot: FieldPlacementMap,
  ) => {
    if (!activeRawDeck) return;
    const useLegacyTemplate = reverseModelInfo ? shouldUseLegacyFullBackTemplate(reverseModelInfo) : false;
    const { width, height } = getTemplateDimensions(savedTpl);
    const normalizedTemplate = useLegacyTemplate
      ? normalizeFlujoBTemplate(savedTpl, width, height)
      : normalizeTemplateFieldAliases(savedTpl);
    const normalizedHiddenFields = useLegacyTemplate ? {} : hiddenFieldsSnapshot;
    const normalizedFieldPlacements = useLegacyTemplate
      ? normalizeFieldPlacements(null)
      : fieldPlacementsSnapshot;

    await persistAdminEditionUpdates(activeRawDeck.slug || activeRawDeck.id, {
      design_template_overrides: {
        ...(activeRawDeck.design_template_overrides || {}),
        layout_config: normalizedTemplate as unknown as Record<string, unknown>,
        hidden_fields: normalizedHiddenFields,
        field_placements: normalizedFieldPlacements,
      }
    });

    setActiveRawDeck(prev => prev ? ({
      ...prev,
      design_template_overrides: {
        ...(prev.design_template_overrides || {}),
        layout_config: normalizedTemplate as unknown as Record<string, unknown>,
        hidden_fields: normalizedHiddenFields,
        field_placements: normalizedFieldPlacements,
      }
    }) : null);
    broadcastTemplateUpdated(activeRawDeck.slug || activeRawDeck.id);
  }, [activeRawDeck, reverseModelInfo]);

  const handleSaveDeckTemplate = useCallback(async (savedTpl: Template) => {
    if (!activeRawDeck) return;
    await saveDeckTemplateSnapshot(savedTpl, hiddenFields, fieldPlacements);

    alert('✅ Layout y opciones de contenido guardados correctamente para ' + activeRawDeck.name);
  }, [activeRawDeck, fieldPlacements, hiddenFields, saveDeckTemplateSnapshot]);

  const handleApplyFieldPlacementsAndSave = useCallback(async (newPlacements: FieldPlacementMap) => {
    if (!activeTemplate) return;
    if (reverseModelInfo && !shouldUseEditableReverseLayout(reverseModelInfo)) return;

    const newHiddenFields = getHiddenFieldsFromPlacements(newPlacements, hiddenFields);
    const nextTemplate = applyFieldPlacementsToTemplate(activeTemplate, newPlacements, cardWidth, cardHeight);

    setFieldPlacements(newPlacements);
    setHiddenFields(newHiddenFields);
    setActiveTemplate(nextTemplate);

    if (activeResolvedDeck) {
      void loadMockDataForCard(activeResolvedDeck, nextTemplate, activeCardIndex, newHiddenFields);
    }

    await saveDeckTemplateSnapshot(nextTemplate, newHiddenFields, newPlacements);
  }, [
    activeResolvedDeck,
    activeTemplate,
    activeCardIndex,
    cardHeight,
    cardWidth,
    hiddenFields,
    loadMockDataForCard,
    saveDeckTemplateSnapshot,
    reverseModelInfo,
  ]);

  /** Update card dimensions (mm) — scales all schema elements proportionally */
  const handleCardSizeChange = useCallback((w: number, h: number) => {
    setCardWidth(prevW => {
      setCardHeight(prevH => {
        setActiveTemplate(prev => {
          if (!prev) return prev;
          return scaleTemplateToCardSize(prev, w, h, prevW, prevH);
        });

        return h;
      });
      return w;
    });
  }, []);

  const handleBackgroundSourceChange = useCallback((dataUrl: string) => {
    _bgRawDataUri = dataUrl;
  }, []);

  const handleAutoLayout = useCallback(async () => {
    if (!activeRawDeck || !activeResolvedDeck || !activeTemplate || !mockData) return;

    if (reverseModelInfo && !shouldUseEditableReverseLayout(reverseModelInfo)) {
      alert('Este mazo usa dorsos completos heredados. Primero prepará la migración editable para usar auto-layout con campos de texto.');
      return;
    }

    const { width: w, height: h } = getTemplateDimensions(activeTemplate);

    if (activeFace === 'front') {
      const layoutTemplate = applyFieldPlacementsToTemplate(
        activeTemplate,
        fieldPlacements,
        w,
        h,
        { forceFrontAutoLayout: true },
      );
      setActiveTemplate(layoutTemplate);
      await handleSaveDeckTemplate(layoutTemplate);
      return;
    }

    const frameUri = _bgRawDataUri || mockData.bg;
    if (!frameUri) {
      alert('No hay arte de fondo (bg) para analizar. Generá un fondo primero.');
      return;
    }

    const cardContent = mergeLongestTextByField([
      pickBackAutoLayoutFields(mockData),
      ...activeResolvedDeck.cards.map(card => pickBackAutoLayoutFields(card.back as unknown as Record<string, unknown>)),
    ], [...AUTO_LAYOUT_BACK_FIELD_KEYS]);

    setAnalyzing(true);
    try {
      const { DECK_EDITIONS } = await import('../../../../lib/editions');
      const edition = DECK_EDITIONS.find(e => e.deckEngineIds?.includes(activeRawDeck.id) || e.id === activeRawDeck.id);

      const res = await fetch('/__cms__/analyze-typography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: frameUri, w, h,
          edition: edition ? { id: edition.id, label: edition.label, description: edition.description, fields: edition.fields } : undefined,
          cardContent,
          hiddenFields,
        }),
      });

      const data = await readAnalyzeTypographyResponse(res);
      const contrastSafeTypography = await enforceTypographyContrast(data.typography, frameUri);
      const typography = hasBoundedTypographyHints(contrastSafeTypography)
        ? contrastSafeTypography
        : await buildBrowserFallbackTypography({
            cardContent,
            hiddenFields,
            imageSrc: frameUri,
          });

      const layoutTemplate = applyFieldPlacementsToTemplate(
        createDefaultCardTemplate(w, h, typography),
        fieldPlacements,
        w,
        h,
      );
      setActiveTemplate(layoutTemplate);
      await handleSaveDeckTemplate(layoutTemplate);
    } catch (err: unknown) {
      if (err instanceof AnalyzeTypographyUnavailableError) {
        const fallbackTypography = await buildBrowserFallbackTypography({
          cardContent,
          hiddenFields,
          imageSrc: frameUri,
        });
        const layoutTemplate = applyFieldPlacementsToTemplate(
          createDefaultCardTemplate(w, h, fallbackTypography),
          fieldPlacements,
          w,
          h,
        );
        setActiveTemplate(layoutTemplate);
        await handleSaveDeckTemplate(layoutTemplate);
        console.warn('[DeckStudio] analyze-typography unavailable; saved deterministic auto-layout.');
        return;
      }

      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      alert('Error al auto-configurar diseño: ' + message);
    } finally {
      setAnalyzing(false);
    }
  }, [activeFace, activeRawDeck, activeResolvedDeck, activeTemplate, fieldPlacements, mockData, hiddenFields, handleSaveDeckTemplate, reverseModelInfo]);

  const handlePrepareEditableMigration = useCallback(async () => {
    if (!activeRawDeck || !activeResolvedDeck || !activeTemplate) return;

    const confirmed = window.confirm(
      `Preparar migración editable para ${activeRawDeck.name}?\n\n` +
      'Se conservarán las imágenes completas como referencia y el layout activo pasará a fondo limpio + campos editables.',
    );
    if (!confirmed) return;

    const { resolveDeck } = await import('@entity-builders/deck-engine');
    const { width, height } = getTemplateDimensions(activeTemplate);
    const editableTemplate = createDefaultCardTemplate(width, height);
    const editablePlacements = normalizeFieldPlacements(null);
    const editableHiddenFields = getHiddenFieldsFromPlacements(editablePlacements, {});
    const legacyReferences = buildLegacyFullBackReferences(activeResolvedDeck);

    const nextOverrides = {
      ...(activeRawDeck.design_template_overrides || {}),
      reverse_model: 'editable-layout' as const,
      reverse_migration_status: 'review' as const,
      legacy_full_back_references: legacyReferences,
      layout_config: editableTemplate as unknown as Record<string, unknown>,
      hidden_fields: editableHiddenFields,
      field_placements: editablePlacements,
    };

    await persistAdminEditionUpdates(activeRawDeck.slug || activeRawDeck.id, {
      design_template_overrides: nextOverrides,
    });

    const nextRawDeck: RawDeckContent = {
      ...activeRawDeck,
      design_template_overrides: nextOverrides,
    };
    const nextResolvedDeck = resolveDeck(nextRawDeck);
    const nextReverseModel = getDeckReverseModel(nextResolvedDeck, editableTemplate);

    setActiveRawDeck(nextRawDeck);
    setActiveResolvedDeck(nextResolvedDeck);
    setActiveTemplate(editableTemplate);
    setHiddenFields(editableHiddenFields);
    setFieldPlacements(editablePlacements);
    setReverseModelInfo(nextReverseModel);
    await loadMockDataForCard(nextResolvedDeck, editableTemplate, activeCardIndex, editableHiddenFields);
    alert('Migración preparada. Revisá el dorso editable antes de guardar versión o publicar.');
  }, [activeRawDeck, activeResolvedDeck, activeTemplate, activeCardIndex, loadMockDataForCard]);

  const activePreviewTemplate = useMemo(() => {
    if (!activeResolvedDeck || !activeTemplate) return activeTemplate;

    return buildStudioPreviewTemplate({
      activeCardIndex,
      deck: activeResolvedDeck,
      fieldPlacements,
      height: cardHeight,
      reverseModelInfo,
      template: activeTemplate,
      width: cardWidth,
    });
  }, [
    activeCardIndex,
    activeResolvedDeck,
    activeTemplate,
    cardHeight,
    cardWidth,
    fieldPlacements,
    reverseModelInfo,
  ]);

  return {
    // Data
    decks,
    loading,
    selectedDeckId,
    activeRawDeck,
    activeResolvedDeck,
    activeTemplate,
    activePreviewTemplate,
    reverseModelInfo,
    mockData,
    setMockData,
    activeCardIndex,
    hiddenFields,
    fieldPlacements,
    analyzing,
    activeFace,
    cardWidth,
    cardHeight,
    // Setters
    setSelectedDeckId,
    setActiveTemplate,
    setActiveFace,
    // Handlers
    handleNextCard,
    handlePrevCard,
    handleJumpToCard,
    handleHiddenFieldsChange,
    handleFieldPlacementsChange,
    handleApplyTemplateSnapshot,
    handleSaveDeckTemplate,
    handleApplyFieldPlacementsAndSave,
    handleBackgroundSourceChange,
    handleAutoLayout,
    handleCardSizeChange,
    handlePrepareEditableMigration,
  };
}
