import type { Template } from '@pdfme/common';
import {
  getCardQrUrl,
  shouldRenderPrintableQr,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import { getFrameDataUri } from '../../../../lib/cardFrame';
import { coverCropToJpeg } from '../../../../lib/PrintEngine';
import {
  getDeckReverseModel,
  shouldUseLegacyFullBackTemplate,
} from '../../../../lib/reverseModel';
import { getTemplateDimensions } from './deckStudioTemplateUtils';

interface BuildDeckStudioMockDataParams {
  deck: DeckSchema;
  template: Template;
  cardIndex: number;
  hiddenFields: Record<string, boolean>;
  overrideHiddenFields?: Record<string, boolean>;
}

interface DeckStudioMockDataResult {
  backgroundDataUri?: string;
  mockData: Record<string, string>;
}

export async function buildDeckStudioMockData({
  deck,
  template,
  cardIndex,
  hiddenFields,
  overrideHiddenFields,
}: BuildDeckStudioMockDataParams): Promise<DeckStudioMockDataResult | null> {
  const card = deck.cards[cardIndex];
  if (!card) return null;

  const shouldIncludeQr = shouldRenderPrintableQr(deck);
  const { width, height } = getTemplateDimensions(template);
  const reverseModel = getDeckReverseModel(deck, template);
  const useLegacyFullBack = shouldUseLegacyFullBackTemplate(reverseModel);
  const mockData: Record<string, string> = {
    number: `#${String(card.front.number).padStart(2, '0')}`,
    title: card.front.title,
  };

  if (card.front.art_url) {
    const artData = await coverCropToJpeg(card.front.art_url, width, height);
    mockData.art = dataUrlToBlobUrl(artData);
  }

  if (useLegacyFullBack && card.back?.back_image_url) {
    mockData.back_ai_image = dataUrlToBlobUrl(card.back?.back_image_url || '');
    mockData.qr_overlay = !shouldIncludeQr || overrideHiddenFields?.qr
      ? ''
      : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));

    return { mockData };
  }

  const frameUri = await getFrameDataUri(deck.slug);
  const backgroundDataUri = await coverCropToJpeg(frameUri, width, height);
  mockData.bg = dataUrlToBlobUrl(backgroundDataUri);

  const resolveHide = overrideHiddenFields || hiddenFields || {};
  const whenToUse = resolveHide.when_to_use || resolveHide.whenToUse
    ? ''
    : getCleanWhenToUse(card.back?.when_to_use || '', !!resolveHide.player_count);

  mockData.when_to_use = whenToUse;
  mockData.whenToUse = whenToUse;
  mockData.phrase = resolveHide.phrase ? '' : (card.back?.phrase ? `"${card.back.phrase}"` : '');
  mockData.instruction = resolveHide.instruction ? '' : (card.back?.instruction || '');
  mockData.answer = resolveHide.answer ? '' : (card.back?.answer ? `Rta: ${card.back.answer}` : '');
  mockData.fun_fact = resolveHide.fun_fact ? '' : (card.back?.fun_fact ? `💡 ${card.back.fun_fact}` : '');
  mockData.qr = !shouldIncludeQr || resolveHide.qr
    ? ''
    : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
  mockData.brand = resolveHide.brand ? '' : `Baraja · ${deck.name}`;

  return {
    backgroundDataUri,
    mockData,
  };
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
    while (n > 0) {
      n -= 1;
      u8arr[n] = bstr.charCodeAt(n);
    }
    return URL.createObjectURL(new Blob([u8arr], { type: mime }));
  } catch (err) {
    console.warn('Failed converting base64 to blob', err);
    return dataUrl;
  }
}
