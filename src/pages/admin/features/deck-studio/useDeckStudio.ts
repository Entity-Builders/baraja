import { useState, useEffect, useCallback } from 'react';
import type { Template } from '@pdfme/common';
import { SupabaseDeckRepository } from '../../../../lib/deckRepository';
import type { DeckSchema, RawDeckContent } from '@eb-packages/deck-engine';
import { getTemplateForDeck, createDefaultCardTemplate } from '../../../../lib/pdfmeConfig';
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
  getTemplateDimensions,
  scaleTemplateToCardSize,
} from './deckStudioTemplateUtils';

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

export function useDeckStudio() {
  const [decks, setDecks] = useState<RawDeckContent[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [activeRawDeck, setActiveRawDeck] = useState<RawDeckContent | null>(null);
  const [activeResolvedDeck, setActiveResolvedDeck] = useState<DeckSchema | null>(null);
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
    const { width: loadedW, height: loadedH } = getTemplateDimensions(template);
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
        layout_config: normalizedTemplate as unknown as Record<string, unknown>,
        hidden_fields: hiddenFields,
        field_placements: fieldPlacements,
      }
    });

    setActiveRawDeck(prev => prev ? ({
      ...prev,
      design_template_overrides: {
        ...(prev.design_template_overrides || {}),
        layout_config: normalizedTemplate as unknown as Record<string, unknown>,
        hidden_fields: hiddenFields,
        field_placements: fieldPlacements,
      }
    }) : null);

    alert('✅ Layout y opciones de contenido guardados correctamente para ' + activeRawDeck.name);
  }, [activeRawDeck, hiddenFields, fieldPlacements]);

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

  const handleAutoLayout = useCallback(async () => {
    if (!activeRawDeck || !activeResolvedDeck || !activeTemplate || !mockData) return;

    const frameUri = _bgRawDataUri || mockData.bg;
    if (!frameUri) {
      alert('No hay arte de fondo (bg) para analizar. Generá un fondo primero.');
      return;
    }

    setAnalyzing(true);
    try {
      const { width: w, height: h } = getTemplateDimensions(activeTemplate);

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
