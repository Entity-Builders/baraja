import { useState, useEffect, useCallback } from 'react';
import type { Template } from '@pdfme/common';
import { SupabaseDeckRepository } from '../../../../lib/deckRepository';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { getTemplateForDeck, createDefaultCardTemplate, cardUsesFlujob } from '../../../../lib/pdfmeConfig';
import { getFrameDataUri } from '../../../../lib/cardFrame';
import { coverCropToJpeg } from '../../../../lib/PrintEngine';
import { getCardQrUrl } from '@eb-packages/deck-engine';

const deckRepo = new SupabaseDeckRepository();

function getCleanWhenToUse(text: string, doHide: boolean): string {
  if (!text) return '';
  if (!doHide) return text;
  return text.replace(/([.¡!]\s*)?[Pp]ara\s*\d+[+-]?\s*jugador(es)?\.?/g, '').trim();
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
  const [analyzing, setAnalyzing] = useState(false);
  const [activeFace, setActiveFace] = useState<'front' | 'back'>('back');

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

    const w = (typeof template.basePdf === 'object' && 'width' in template.basePdf) ? template.basePdf.width : 70;
    const h = (typeof template.basePdf === 'object' && 'height' in template.basePdf) ? template.basePdf.height : 120;

    const mData: Record<string, string> = {
      number: `#${String(card.front.number).padStart(2, '0')}`,
      title: card.front.title,
    };

    if (card.front.art_url) {
      mData.art = await coverCropToJpeg(card.front.art_url, w, h);
    }

    if (cardUsesFlujob(card)) {
      mData.back_ai_image = card.back?.back_image_url || '';
      mData.qr_overlay = overrideHiddenFields?.qr ? '' : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
    } else {
      const frameUri = await getFrameDataUri(deck.slug);
      mData.bg = await coverCropToJpeg(frameUri, w, h);

      const resolveHide = overrideHiddenFields || hiddenFields || {};
      mData.when_to_use = resolveHide.when_to_use ? '' : getCleanWhenToUse(card.back?.when_to_use || '', !!resolveHide.player_count);
      mData.phrase      = resolveHide.phrase      ? '' : (card.back?.phrase      ? `"${card.back.phrase}"`          : '');
      mData.instruction = resolveHide.instruction ? '' : (card.back?.instruction || '');
      mData.answer      = resolveHide.answer      ? '' : (card.back?.answer      ? `Rta: ${card.back.answer}`       : '');
      mData.fun_fact    = resolveHide.fun_fact    ? '' : (card.back?.fun_fact    ? `💡 ${card.back.fun_fact}`       : '');
      mData.qr          = resolveHide.qr          ? '' : (card.back?.qr_url      || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
      mData.brand       = resolveHide.brand       ? '' : `Baraja · ${deck.name}`;
    }

    setMockData(mData);
  }, [hiddenFields]);

  const loadDeckLayout = useCallback(async (deckId: string) => {
    const rawDeck = decks.find(d => d.id === deckId);
    if (!rawDeck) return;

    const { resolveDeck } = await import('@eb-packages/deck-engine');
    const deck = resolveDeck(rawDeck);
    const template = getTemplateForDeck(deck);

    // Support legacy hide_player_count and merge to new structure
    const isPlayersHidden = !!rawDeck.design_template_overrides?.hide_player_count;
    const initialHiddenFields = rawDeck.design_template_overrides?.hidden_fields || {};
    if (isPlayersHidden) initialHiddenFields.player_count = true;

    setActiveRawDeck(rawDeck);
    setActiveResolvedDeck(deck);
    setActiveTemplate(template);
    setActiveCardIndex(0);
    setHiddenFields(initialHiddenFields);

    await loadMockDataForCard(deck, template, 0, initialHiddenFields);
  }, [decks, loadMockDataForCard]);

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

  const handleNextCard = useCallback(() => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const nextIdx = activeCardIndex < maxIdx ? activeCardIndex + 1 : 0;
    setActiveCardIndex(nextIdx);
    loadMockDataForCard(activeResolvedDeck, activeTemplate, nextIdx);
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, loadMockDataForCard]);

  const handlePrevCard = useCallback(() => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const prevIdx = activeCardIndex > 0 ? activeCardIndex - 1 : maxIdx;
    setActiveCardIndex(prevIdx);
    loadMockDataForCard(activeResolvedDeck, activeTemplate, prevIdx);
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, loadMockDataForCard]);

  const handleHiddenFieldsChange = useCallback((newFields: Record<string, boolean>) => {
    setHiddenFields(newFields);
    if (activeResolvedDeck && activeTemplate) {
      loadMockDataForCard(activeResolvedDeck, activeTemplate, activeCardIndex, newFields);
    }
  }, [activeResolvedDeck, activeTemplate, activeCardIndex, loadMockDataForCard]);

  const handleSaveDeckTemplate = useCallback(async (savedTpl: Template) => {
    if (!activeRawDeck) return;

    await deckRepo.updateDeckSettings(activeRawDeck.id, {
      design_template_overrides: {
        ...(activeRawDeck.design_template_overrides || {}),
        layout_config: savedTpl as any,
        hidden_fields: hiddenFields,
      }
    });

    setActiveRawDeck(prev => prev ? ({
      ...prev,
      design_template_overrides: {
        ...(prev.design_template_overrides || {}),
        layout_config: savedTpl as any,
        hidden_fields: hiddenFields,
      }
    }) : null);

    alert('✅ Layout y opciones de contenido guardados correctamente para ' + activeRawDeck.name);
  }, [activeRawDeck, hiddenFields]);

  const handleAutoLayout = useCallback(async () => {
    if (!activeRawDeck || !activeResolvedDeck || !activeTemplate || !mockData) return;

    const frameUri = mockData.bg;
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

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const layoutTemplate = createDefaultCardTemplate(w, h, data.typography);
      setActiveTemplate(layoutTemplate);
      await handleSaveDeckTemplate(layoutTemplate);
    } catch (err: any) {
      console.error(err);
      alert('Error al auto-configurar diseño: ' + err.message);
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
    activeCardIndex,
    hiddenFields,
    analyzing,
    activeFace,
    // Setters
    setSelectedDeckId,
    setActiveTemplate,
    setActiveFace,
    // Handlers
    handleNextCard,
    handlePrevCard,
    handleHiddenFieldsChange,
    handleSaveDeckTemplate,
    handleAutoLayout,
  };
}
