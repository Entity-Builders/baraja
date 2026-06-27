import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  DECK_CATALOG_CATEGORIES,
  DECK_CATALOG_COLLECTIONS,
  type DeckCatalogCategoryId,
  type DeckCatalogCollectionId,
} from '@eb-packages/deck-engine';
import {
  buildGenerationPayload,
  type DeckType,
  type TriviaDifficulty,
} from './generationPayload';
import type { GenerationPreset } from './generationPresets';
import {
  getErrorMessage,
  getStringField,
  readJsonRecord,
  toEnrichResponse,
  toGenerationResult,
  toGenerationStreamEvent,
  toPromptPreviewResponse,
  type EnrichedItem,
  type GenerationResult,
  type GenerationStreamEvent,
} from './generationResponseParsers';
import { GenerateEditionForm } from './components/GenerateEditionForm';
import { GenerateEditionConsole } from './components/GenerateEditionConsole';
import { getSeedItems, type GenerationLog } from './generationUi';

// ── Component ────────────────────────────────────────────────

export default function AdminGenerateEdition() {
  // Core fields
  const [topic, setTopic] = useState('');
  const [cardCount, setCardCount] = useState(30);
  const [additionalContext, setAdditionalContext] = useState('');

  // Phase 1: Structured options
  const [deckType, setDeckType] = useState<DeckType>('custom');
  const [difficulty, setDifficulty] = useState<TriviaDifficulty>('mixed');
  const [artStyle, setArtStyle] = useState('');

  // Catalog and landing intent
  const [catalogCollection, setCatalogCollection] = useState<DeckCatalogCollectionId>('social-games');
  const [catalogCategory, setCatalogCategory] = useState<DeckCatalogCategoryId>('between-friends');
  const [deckMoment, setDeckMoment] = useState('');
  const [buyerSentence, setBuyerSentence] = useState('');
  const [landingPromise, setLandingPromise] = useState('');
  const [previewPolicy, setPreviewPolicy] = useState('');

  // Phase 2: Enrichment
  const [seedText, setSeedText] = useState('');
  const [enrichedData, setEnrichedData] = useState<EnrichedItem[] | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Phase 3: Prompt preview
  const [, setPromptPreview] = useState<string | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const category = DECK_CATALOG_CATEGORIES[catalogCategory];

    if (category?.collection === catalogCollection) {
      return;
    }

    const nextCategory = Object.values(DECK_CATALOG_CATEGORIES).find(
      (candidate) => candidate.collection === catalogCollection && candidate.id !== 'other'
    );

    if (nextCategory) {
      setCatalogCategory(nextCategory.id);
    }
  }, [catalogCategory, catalogCollection]);

  function addLog(type: GenerationLog['type'], message: string) {
    setLogs(prev => [...prev, { type, message, timestamp: Date.now() }]);
  }

  // ── Enrichment ─────────────────────────────────────────────

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

  // ── Prompt Preview ─────────────────────────────────────────

  async function handlePreviewPrompt() {
    addLog('progress', `📝 Assembling prompt preview...`);

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

  // ── Generation ─────────────────────────────────────────────

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

  function handleSseBlock(block: string) {
    const dataLine = block
      .split('\n')
      .find((line) => line.startsWith('data: '));

    if (!dataLine) {
      return;
    }

    const dataStr = dataLine.slice(6).trim();
    if (!dataStr) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(dataStr);
      const event = toGenerationStreamEvent(parsed);

      if (event) {
        handleGenerationStreamEvent(event);
      }
    } catch (err: unknown) {
      console.error('[AdminGenerateEdition] Failed to parse SSE block:', err);
      addLog('error', '❌ El servidor devolvió un evento de generación inválido.');
    }
  }

  async function readGenerationStream(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No se pudo leer el stream de generación.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        handleSseBlock(block);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      handleSseBlock(buffer);
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || generating) return;

    setGenerating(true);
    setResult(null);
    setPromptPreview(null);

    addLog('info', `🃏 Baraja Deck Engine`);
    addLog('info', `Type: ${deckType} | Cards: ${cardCount}${deckType === 'trivia' ? ` | Difficulty: ${difficulty}` : ''}${artStyle ? ` | Art: ${artStyle}` : ''}`);
    addLog('progress', `Generating with Gemini 2.5 Pro...`);

    try {
      const payload = buildPayload();
      const res = await fetch('/__cms__/generate-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        // Fallback for immediate errors like 500 or 400
        recordGenerationResult(toGenerationResult(await readJsonRecord(res)), false);
      } else {
        await readGenerationStream(res);
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

  const catalogCollections = Object.values(DECK_CATALOG_COLLECTIONS).filter(
    (collection) => collection.id !== 'other'
  );
  const catalogCategories = Object.values(DECK_CATALOG_CATEGORIES).filter(
    (category) => category.collection === catalogCollection && category.id !== 'other'
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'white' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem' }}>
            ← All Editions
          </Link>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 400 }}>
            Generate New Edition
          </h1>
          <p style={{ opacity: 0.5, marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Configure your deck parameters, enrich with external data, preview the prompt, then generate.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <GenerateEditionForm
            topic={topic}
            cardCount={cardCount}
            additionalContext={additionalContext}
            deckType={deckType}
            difficulty={difficulty}
            artStyle={artStyle}
            catalogCollection={catalogCollection}
            catalogCategory={catalogCategory}
            catalogCollections={catalogCollections}
            catalogCategories={catalogCategories}
            deckMoment={deckMoment}
            buyerSentence={buyerSentence}
            landingPromise={landingPromise}
            previewPolicy={previewPolicy}
            seedText={seedText}
            enrichedData={enrichedData}
            enriching={enriching}
            generating={generating}
            onApplyPreset={applyPreset}
            onTopicChange={setTopic}
            onCardCountChange={setCardCount}
            onAdditionalContextChange={setAdditionalContext}
            onDeckTypeChange={setDeckType}
            onDifficultyChange={setDifficulty}
            onArtStyleChange={setArtStyle}
            onCatalogCollectionChange={setCatalogCollection}
            onCatalogCategoryChange={setCatalogCategory}
            onDeckMomentChange={setDeckMoment}
            onBuyerSentenceChange={setBuyerSentence}
            onLandingPromiseChange={setLandingPromise}
            onPreviewPolicyChange={setPreviewPolicy}
            onSeedTextChange={handleSeedTextChange}
            onEnrich={handleEnrich}
            onPreviewPrompt={handlePreviewPrompt}
            onGenerate={handleGenerate}
          />

          <GenerateEditionConsole
            logs={logs}
            result={result}
            generating={generating}
            syncing={syncing}
            logsEndRef={logsEndRef}
            onSyncDecks={handleSyncDecks}
            onReset={resetGenerationForm}
          />
        </div>
      </div>

      {/* Spinner keyframe + pulse animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.15; }
        }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(12, 11, 9, 0.3);
          border-top-color: #0c0b09;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
      `}</style>
    </div>
  );
}
