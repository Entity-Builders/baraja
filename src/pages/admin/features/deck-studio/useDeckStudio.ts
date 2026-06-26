import { useState, useEffect, useCallback } from 'react';
import type { Template } from '@pdfme/common';
import { SupabaseDeckRepository } from '../../../../lib/deckRepository';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { getTemplateForDeck, createDefaultCardTemplate, cardUsesFlujob } from '../../../../lib/pdfmeConfig';
import { getFrameDataUri } from '../../../../lib/cardFrame';
import { coverCropToJpeg } from '../../../../lib/PrintEngine';
import {
  CARD_FIELD_DEFINITIONS,
  applyFieldPlacementsToTemplate,
  getHiddenFieldsFromPlacements,
  normalizeTemplateFieldAliases,
  normalizeFieldPlacements,
  type FieldPlacementMap,
} from '../../../../lib/cardFieldPlacements';
import { getCardQrUrl, shouldRenderPrintableQr } from '@eb-packages/deck-engine';

const deckRepo = new SupabaseDeckRepository();

/**
 * Raw data: URI for the background image, kept separate from the blob URL
 * used for browser rendering. The server-side Vision API cannot read blob: URLs,
 * so we pass this raw URI when calling analyze-typography.
 */
let _bgRawDataUri = '';

interface AnalyzeTypographyResponse {
  success: boolean;
  typography?: Parameters<typeof createDefaultCardTemplate>[2];
  error?: string;
}

function getCleanWhenToUse(text: string, doHide: boolean): string {
  if (!text) return '';
  if (!doHide) return text;
  return text.replace(/([.¡!]\s*)?[Pp]ara\s*\d+[+-]?\s*jugador(es)?\.?/g, '').trim();
}

function dataUrlToBlobUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    const bstr = atob(arr[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return URL.createObjectURL(new Blob([u8arr], { type: mime }));
  } catch (err) {
    console.warn('Failed converting base64 to blob', err);
    return dataUrl;
  }
}


export function useDeckStudio() {
  const [decks, setDecks] = useState<RawDeckContent[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [activeRawDeck, setActiveRawDeck] = useState<RawDeckContent | null>(null);
  const [activeResolvedDeck, setActiveResolvedDeck] = useState<any>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [mockData, setMockData] = useState<Record<string, string> | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);

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
    deck: any,
    template: Template,
    cardIndex: number,
    overrideHiddenFields?: Record<string, boolean>,
  ) => {
    const card = deck.cards[cardIndex];
    if (!card) return;
    const shouldIncludeQr = shouldRenderPrintableQr(deck);

    const w = (typeof template.basePdf === 'object' && 'width' in template.basePdf) ? template.basePdf.width : 70;
    const h = (typeof template.basePdf === 'object' && 'height' in template.basePdf) ? template.basePdf.height : 120;

    const mData: Record<string, string> = {
      number: `#${String(card.front.number).padStart(2, '0')}`,
      title: card.front.title,
    };

    if (card.front.art_url) {
      const artData = await coverCropToJpeg(card.front.art_url, w, h);
      mData.art = dataUrlToBlobUrl(artData);
    }

    if (cardUsesFlujob(card)) {
      mData.back_ai_image = dataUrlToBlobUrl(card.back?.back_image_url || '');
      mData.qr_overlay = !shouldIncludeQr || overrideHiddenFields?.qr
        ? ''
        : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
    } else {
      const frameUri = await getFrameDataUri(deck.slug);
      const bgData = await coverCropToJpeg(frameUri, w, h);
      _bgRawDataUri = bgData; // keep raw data: URI for server-side Vision calls
      mData.bg = dataUrlToBlobUrl(bgData);

      const resolveHide = overrideHiddenFields || hiddenFields || {};
      const whenToUse = resolveHide.when_to_use || resolveHide.whenToUse
        ? ''
        : getCleanWhenToUse(card.back?.when_to_use || '', !!resolveHide.player_count);
      mData.when_to_use = whenToUse;
      mData.whenToUse = whenToUse;
      mData.phrase      = resolveHide.phrase      ? '' : (card.back?.phrase      ? `"${card.back.phrase}"`          : '');
      mData.instruction = resolveHide.instruction ? '' : (card.back?.instruction || '');
      mData.answer      = resolveHide.answer      ? '' : (card.back?.answer      ? `Rta: ${card.back.answer}`       : '');
      mData.fun_fact    = resolveHide.fun_fact    ? '' : (card.back?.fun_fact    ? `💡 ${card.back.fun_fact}`       : '');
      mData.qr          = !shouldIncludeQr || resolveHide.qr ? '' : (card.back?.qr_url      || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
      mData.brand       = resolveHide.brand       ? '' : `Baraja · ${deck.name}`;
    }

    setMockData(mData);
  }, [hiddenFields]);

  const loadDeckLayout = useCallback(async (deckId: string) => {
    const rawDeck = decks.find(d => d.id === deckId || d.slug === deckId);
    if (!rawDeck) return;

    const { resolveDeck } = await import('@eb-packages/deck-engine');
    const deck = resolveDeck(rawDeck);
    const template = getTemplateForDeck(deck);

    // Support legacy hide_player_count and merge to new structure
    const isPlayersHidden = !!rawDeck.design_template_overrides?.hide_player_count;
    const initialFieldPlacements = normalizeFieldPlacements(rawDeck.design_template_overrides || {});
    const initialHiddenFields = getHiddenFieldsFromPlacements(
      initialFieldPlacements,
      rawDeck.design_template_overrides?.hidden_fields || {},
    );
    if (isPlayersHidden) initialHiddenFields.player_count = true;

    // Extract card dimensions from the loaded template
    const loadedW = (typeof template.basePdf === 'object' && 'width' in template.basePdf) ? template.basePdf.width : 70;
    const loadedH = (typeof template.basePdf === 'object' && 'height' in template.basePdf) ? template.basePdf.height : 120;
    const placedTemplate = applyFieldPlacementsToTemplate(template, initialFieldPlacements, loadedW, loadedH);

    setActiveRawDeck(rawDeck);
    setActiveResolvedDeck(deck);
    setActiveTemplate(placedTemplate);
    setActiveCardIndex(0);
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
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, fieldPlacements]);

  const handleFieldPlacementsChange = useCallback((newPlacements: FieldPlacementMap) => {
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
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, cardHeight, cardWidth, hiddenFields, loadMockDataForCard]);

  const handleApplyTemplateSnapshot = useCallback((
    template: Template,
    width: number,
    height: number,
    nextHiddenFields: Record<string, boolean>,
  ) => {
    const normalizedTemplate = normalizeTemplateFieldAliases(template);
    setActiveTemplate(normalizedTemplate);
    setCardWidth(width);
    setCardHeight(height);
    setHiddenFields(nextHiddenFields);

    if (activeResolvedDeck) {
      void loadMockDataForCard(activeResolvedDeck, normalizedTemplate, activeCardIndex, nextHiddenFields);
    }
  }, [activeResolvedDeck, activeCardIndex, loadMockDataForCard]);

  const handleSaveDeckTemplate = useCallback(async (savedTpl: Template) => {
    if (!activeRawDeck) return;
    const normalizedTemplate = normalizeTemplateFieldAliases(savedTpl);

    await deckRepo.updateDeckSettings(activeRawDeck.id, {
      design_template_overrides: {
        ...(activeRawDeck.design_template_overrides || {}),
        layout_config: normalizedTemplate as any,
        hidden_fields: hiddenFields,
        field_placements: fieldPlacements,
      }
    });

    setActiveRawDeck(prev => prev ? ({
      ...prev,
      design_template_overrides: {
        ...(prev.design_template_overrides || {}),
        layout_config: normalizedTemplate as any,
        hidden_fields: hiddenFields,
        field_placements: fieldPlacements,
      }
    }) : null);

    alert('✅ Layout y opciones de contenido guardados correctamente para ' + activeRawDeck.name);
  }, [activeRawDeck, hiddenFields, fieldPlacements]);

  /** Full-bleed element names — these always snap to cover the entire card */
  const FULL_BLEED_ELEMENTS = new Set(['art', 'bg', 'back_ai_image']);

  /** Update card dimensions (mm) — scales all schema elements proportionally */
  const handleCardSizeChange = useCallback((w: number, h: number) => {
    setCardWidth(prevW => {
      setCardHeight(prevH => {
        const ratioW = prevW > 0 ? w / prevW : 1;
        const ratioH = prevH > 0 ? h / prevH : 1;

        setActiveTemplate(prev => {
          if (!prev) return prev;

          const scaledSchemas = prev.schemas.map(page =>
            page.map(schema => {
              // Full-bleed elements always snap to cover the entire card
              if (FULL_BLEED_ELEMENTS.has(schema.name)) {
                return {
                  ...schema,
                  position: { x: 0, y: 0 },
                  width: w,
                  height: h,
                };
              }

              // All other elements: scale proportionally
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
            })
          );

          return {
            ...prev,
            basePdf: { width: w, height: h, padding: [0, 0, 0, 0] as [number, number, number, number] },
            schemas: scaledSchemas,
          };
        });

        return h;
      });
      return w;
    });
  }, []);

  const handleAutoLayout = useCallback(async () => {
    if (!activeRawDeck || !activeResolvedDeck || !activeTemplate || !mockData) return;

    const frameUri = _bgRawDataUri || mockData.bg;
    if (!frameUri) {
      alert('No hay arte de fondo (bg) para analizar. Generá un fondo primero.');
      return;
    }

    setAnalyzing(true);
    try {
      const w = (typeof activeTemplate.basePdf === 'object' && 'width' in activeTemplate.basePdf) ? activeTemplate.basePdf.width : 70;
      const h = (typeof activeTemplate.basePdf === 'object' && 'height' in activeTemplate.basePdf) ? activeTemplate.basePdf.height : 120;

      const { DECK_EDITIONS } = await import('../../../../lib/editions');
      const edition = DECK_EDITIONS.find(e => e.deckEngineIds?.includes(activeRawDeck.id) || e.id === activeRawDeck.id);

      const cardContent: Record<string, string> = {
        when_to_use: mockData.when_to_use,
        phrase: mockData.phrase,
        instruction: mockData.instruction,
        answer: mockData.answer,
        fun_fact: mockData.fun_fact,
      };

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

      const data = await res.json() as AnalyzeTypographyResponse;
      if (!data.success) throw new Error(data.error);

      const layoutTemplate = createDefaultCardTemplate(w, h, data.typography);
      setActiveTemplate(layoutTemplate);
      await handleSaveDeckTemplate(layoutTemplate);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      alert('Error al auto-configurar diseño: ' + message);
    } finally {
      setAnalyzing(false);
    }
  }, [activeRawDeck, activeResolvedDeck, activeTemplate, mockData, hiddenFields, handleSaveDeckTemplate]);

  return {
    // Data
    decks,
    loading,
    selectedDeckId,
    activeRawDeck,
    activeResolvedDeck,
    activeTemplate,
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
    handleAutoLayout,
    handleCardSizeChange,
  };
}
