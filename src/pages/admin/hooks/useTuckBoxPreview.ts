import { useCallback, useMemo, useState } from 'react';
import type { RawDeckContent } from '@entity-builders/deck-engine';
import { getEditionBySlug } from '../../../lib/editions';
import {
  calculateTuckBoxDimensions,
  generateTuckBoxPdf,
  generateTuckBoxSVG,
  getEditionColors,
  type TuckBoxContent,
  type TuckBoxParams,
} from '../../../lib/TuckBoxEngine';
import { getErrorMessage } from '../../../lib/errors';

interface UseTuckBoxPreviewParams {
  activeDeck: RawDeckContent | null | undefined;
  cardWidth: number;
  cardHeight: number;
  numCards: number;
  enabled: boolean;
}

export function useTuckBoxPreview({
  activeDeck,
  cardWidth,
  cardHeight,
  numCards,
  enabled,
}: UseTuckBoxPreviewParams) {
  const [tuckTolerance, setTuckTolerance] = useState(1);
  const [tuckThickness, setTuckThickness] = useState(0.4);
  const [tuckBleed, setTuckBleed] = useState(3);
  const [isGeneratingTuckPdf, setIsGeneratingTuckPdf] = useState(false);

  const editionConfig = activeDeck?.slug ? getEditionBySlug(activeDeck.slug) : null;
  const editionId = editionConfig?.id || 'custom';
  const editionLabel = editionConfig?.label || activeDeck?.name || 'Custom';
  const editionColors = getEditionColors(editionId);

  const tuckParams: TuckBoxParams = useMemo(() => ({
    cardWidth,
    cardHeight,
    numCards,
    cardThickness: tuckThickness,
    tolerance: tuckTolerance,
    bleed: tuckBleed,
  }), [cardHeight, cardWidth, numCards, tuckBleed, tuckThickness, tuckTolerance]);

  const tuckContent: TuckBoxContent = useMemo(() => ({
    deckName: activeDeck?.name || 'Baraja',
    editionLabel,
    description: editionConfig?.description || '',
    numCards,
  }), [activeDeck?.name, editionConfig?.description, editionLabel, numCards]);

  const tuckDims = useMemo(() => calculateTuckBoxDimensions(tuckParams), [tuckParams]);

  const tuckSvg = useMemo(() => {
    if (!activeDeck || !enabled) return '';
    return generateTuckBoxSVG(tuckParams, editionColors, tuckContent);
  }, [activeDeck, enabled, editionColors, tuckContent, tuckParams]);

  const handleDownloadTuckSvg = useCallback(() => {
    if (!tuckSvg || !activeDeck) return;

    const blob = new Blob([tuckSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `TuckBox_${activeDeck.name.replace(/\s+/g, '_')}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeDeck, tuckSvg]);

  const handleDownloadTuckPdf = useCallback(async () => {
    if (!activeDeck) return;

    setIsGeneratingTuckPdf(true);
    try {
      const blob = await generateTuckBoxPdf(tuckParams, editionColors, tuckContent);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `TuckBox_${activeDeck.name.replace(/\s+/g, '_')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('Tuck box PDF failed:', err);
      alert('Error: ' + getErrorMessage(err, String(err)));
    } finally {
      setIsGeneratingTuckPdf(false);
    }
  }, [activeDeck, editionColors, tuckContent, tuckParams]);

  return {
    tuckDims,
    tuckSvg,
    editionLabel,
    editionColors,
    tuckTolerance,
    tuckThickness,
    tuckBleed,
    isGeneratingTuckPdf,
    setTuckTolerance,
    setTuckThickness,
    setTuckBleed,
    handleDownloadTuckSvg,
    handleDownloadTuckPdf,
  };
}
