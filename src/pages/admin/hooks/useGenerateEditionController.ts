import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  type DeckCatalogCategoryId,
  type DeckCatalogCollectionId,
} from '@entity-builders/deck-engine';
import {
  getFallbackCatalogCategory,
  getGenerationCatalogCategories,
  getGenerationCatalogCollections,
} from '../generationCatalogOptions';
import {
  buildGenerationPayload,
  type DeckType,
  type TriviaDifficulty,
} from '../generationPayload';
import type { GenerationPreset } from '../generationPresets';
import {
  getErrorMessage,
  getStringField,
  readJsonRecord,
  toEnrichResponse,
  toGenerationResult,
  toPromptPreviewResponse,
  type EnrichedItem,
  type GenerationResult,
  type GenerationStreamEvent,
} from '../generationResponseParsers';
import { readGenerationEventStream } from '../generationStreamReader';
import { getSeedItems, type GenerationLog } from '../generationUi';

export function useGenerateEditionController() {
  const [topic, setTopic] = useState('');
  const [cardCount, setCardCount] = useState(30);
  const [additionalContext, setAdditionalContext] = useState('');
  const [deckType, setDeckType] = useState<DeckType>('custom');
  const [difficulty, setDifficulty] = useState<TriviaDifficulty>('mixed');
  const [artStyle, setArtStyle] = useState('');
  const [catalogCollection, setCatalogCollection] = useState<DeckCatalogCollectionId>('social-games');
  const [catalogCategory, setCatalogCategory] = useState<DeckCatalogCategoryId>('between-friends');
  const [deckMoment, setDeckMoment] = useState('');
  const [buyerSentence, setBuyerSentence] = useState('');
  const [landingPromise, setLandingPromise] = useState('');
  const [previewPolicy, setPreviewPolicy] = useState('');
  const [seedText, setSeedText] = useState('');
  const [enrichedData, setEnrichedData] = useState<EnrichedItem[] | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [, setPromptPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const nextCategory = getFallbackCatalogCategory(catalogCollection, catalogCategory);

    if (nextCategory) {
      setCatalogCategory(nextCategory);
    }
  }, [catalogCategory, catalogCollection]);

  function addLog(type: GenerationLog['type'], message: string) {
    setLogs(prev => [...prev, { type, message, timestamp: Date.now() }]);
  }

  function buildPayload() {
    return buildGenerationPayload({
      topic,
      cardCount,
      additionalContext,
      deckType,
      difficulty,
      artStyle,
      enrichedData,
      catalogCollection,
      catalogCategory,
      deckMoment,
      buyerSentence,
      landingPromise,
      previewPolicy,
    });
  }

  async function handleEnrich() {
    const items = getSeedItems(seedText);
    if (items.length === 0) return;

    setEnriching(true);
    addLog('progress', `🔍 Enriching ${items.length} items via OMDB...`);

    try {
      const res = await fetch('/__cms__/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedItems: items,
          enrichmentType: 'movie',
        }),
      });

      const data = toEnrichResponse(await readJsonRecord(res));
      if (!data.success) {
        throw new Error(data.error);
      }

      if (!res.ok) {
        throw new Error('El servidor rechazó el enriquecimiento.');
      }

      if (data.success) {
        const found = data.data.filter((d: EnrichedItem) => !d._notFound && !d._error);
        const notFound = data.data.filter((d: EnrichedItem) => d._notFound);
        setEnrichedData(data.data);
        addLog('success', `✅ Enriched ${found.length}/${items.length} items`);
        if (notFound.length > 0) {
          addLog('error', `⚠️ Not found: ${notFound.map((d: EnrichedItem) => d.title).join(', ')}`);
        }

        for (const item of found) {
          addLog('info', `  🎬 ${item.title} (${item.year}) — Dir: ${item.director} — ⭐ ${item.imdbRating}`);
        }
      }
    } catch (err: unknown) {
      addLog('error', `❌ No se pudo enriquecer la lista: ${getErrorMessage(err, 'Revisá el servidor local y volvé a intentar.')}`);
    } finally {
      setEnriching(false);
    }
  }

  async function handlePreviewPrompt() {
    addLog('progress', '📝 Assembling prompt preview...');

    try {
      const payload = buildPayload();
      const res = await fetch('/__cms__/preview-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = toPromptPreviewResponse(await readJsonRecord(res));
      if (!data.success) {
        throw new Error(data.error);
      }

      if (!res.ok) {
        throw new Error('El servidor rechazó la previsualización.');
      }

      if (data.success) {
        setPromptPreview(data.userPrompt);
        addLog('info', `📊 Estimated tokens: ~${data.estimatedTokens ?? 'n/a'}`);
        addLog('prompt', data.userPrompt);
      }
    } catch (err: unknown) {
      addLog('error', `❌ No se pudo previsualizar el prompt: ${getErrorMessage(err, 'Revisá el servidor local y volvé a intentar.')}`);
    }
  }

  function applyPreset(preset: GenerationPreset) {
    setTopic(preset.topic);
    setAdditionalContext(preset.context);
    setDeckType(preset.type);
    setCatalogCollection(preset.collection);
    setCatalogCategory(preset.category);
    setDeckMoment(preset.moment);
    setBuyerSentence(preset.buyerSentence);
    setLandingPromise(preset.landingPromise);
    setPreviewPolicy(preset.previewPolicy);
    setCardCount(preset.cardCount ?? 30);
    setArtStyle(preset.artStyle ?? '');
  }

  function handleSeedTextChange(value: string) {
    setSeedText(value);
    setEnrichedData(null);
  }

  function resetGenerationForm() {
    setTopic('');
    setAdditionalContext('');
    setSeedText('');
    setEnrichedData(null);
    setLogs([]);
    setResult(null);
    setPromptPreview(null);
  }

  function recordGenerationResult(data: GenerationResult, registrySynced: boolean) {
    if (data.success) {
      addLog('success', `✅ Edition created: "${data.name ?? 'Nueva edición'}"`);
      addLog('success', `Cards generated: ${data.card_count ?? 0}`);
      addLog('info', `Slug: ${data.slug ?? 'sin-slug'}`);
      addLog(registrySynced ? 'success' : 'progress', registrySynced
        ? '🔄 Runtime deck registry synced.'
        : '🔄 Syncing runtime deck registry...');
    } else {
      addLog('error', `❌ Generation failed: ${data.error ?? 'La generación falló sin detalle.'}`);
    }

    setResult(data);
  }

  function handleGenerationStreamEvent(event: GenerationStreamEvent) {
    if (event.type === 'progress') {
      addLog('progress', event.message);
      return;
    }

    if (event.type === 'error') {
      addLog('error', `❌ ${event.message}`);
      setResult({ success: false, error: event.message });
      return;
    }

    recordGenerationResult(event.data, true);
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || generating) return;

    setGenerating(true);
    setResult(null);
    setPromptPreview(null);

    addLog('info', '🃏 Baraja Deck Engine');
    addLog('info', `Type: ${deckType} | Cards: ${cardCount}${deckType === 'trivia' ? ` | Difficulty: ${difficulty}` : ''}${artStyle ? ` | Art: ${artStyle}` : ''}`);
    addLog('progress', 'Generating with Gemini 2.5 Pro...');

    try {
      const payload = buildPayload();
      const res = await fetch('/__cms__/generate-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        recordGenerationResult(toGenerationResult(await readJsonRecord(res)), false);
      } else {
        await readGenerationEventStream(res, {
          onEvent: handleGenerationStreamEvent,
          onInvalidEvent: () => addLog('error', '❌ El servidor devolvió un evento de generación inválido.'),
        });
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Revisá el servidor local y volvé a intentar.');
      addLog('error', `❌ No se pudo generar la edición: ${message}`);
      setResult({ success: false, error: message });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSyncDecks() {
    if (syncing) return;

    setSyncing(true);
    addLog('progress', '🔄 Syncing deck registry...');

    try {
      const res = await fetch('/__cms__/sync-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await readJsonRecord(res);

      if (!res.ok || data.success !== true) {
        throw new Error(getStringField(data, 'error') ?? 'No se pudo sincronizar el registro.');
      }

      addLog('success', '✅ decks.ts regenerated. If a stale view remains, refresh the admin.');
    } catch (err: unknown) {
      addLog('error', `❌ Sync failed: ${getErrorMessage(err, 'Revisá el servidor local y volvé a intentar.')}`);
    } finally {
      setSyncing(false);
    }
  }

  const catalogCollections = getGenerationCatalogCollections();
  const catalogCategories = getGenerationCatalogCategories(catalogCollection);

  return {
    formProps: {
      topic,
      cardCount,
      additionalContext,
      deckType,
      difficulty,
      artStyle,
      catalogCollection,
      catalogCategory,
      catalogCollections,
      catalogCategories,
      deckMoment,
      buyerSentence,
      landingPromise,
      previewPolicy,
      seedText,
      enrichedData,
      enriching,
      generating,
      onApplyPreset: applyPreset,
      onTopicChange: setTopic,
      onCardCountChange: setCardCount,
      onAdditionalContextChange: setAdditionalContext,
      onDeckTypeChange: setDeckType,
      onDifficultyChange: setDifficulty,
      onArtStyleChange: setArtStyle,
      onCatalogCollectionChange: setCatalogCollection,
      onCatalogCategoryChange: setCatalogCategory,
      onDeckMomentChange: setDeckMoment,
      onBuyerSentenceChange: setBuyerSentence,
      onLandingPromiseChange: setLandingPromise,
      onPreviewPolicyChange: setPreviewPolicy,
      onSeedTextChange: handleSeedTextChange,
      onEnrich: handleEnrich,
      onPreviewPrompt: handlePreviewPrompt,
      onGenerate: handleGenerate,
    },
    consoleProps: {
      logs,
      result,
      generating,
      syncing,
      logsEndRef,
      onSyncDecks: handleSyncDecks,
      onReset: resetGenerationForm,
    },
  };
}
