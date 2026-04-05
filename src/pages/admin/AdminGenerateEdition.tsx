import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

// ── Types ────────────────────────────────────────────────────

type DeckType = 'trivia' | 'introspection' | 'party' | 'custom';
type TriviaDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

interface GenerationLog {
  type: 'info' | 'success' | 'error' | 'progress' | 'prompt';
  message: string;
  timestamp: number;
}

interface GenerationResult {
  success: boolean;
  slug?: string;
  name?: string;
  card_count?: number;
  error?: string;
}

interface EnrichedItem {
  title: string;
  year?: string;
  director?: string;
  genre?: string;
  actors?: string;
  plot?: string;
  poster?: string;
  imdbRating?: string;
  awards?: string;
  country?: string;
  wikiExtract?: string;
  _notFound?: boolean;
  _error?: string;
}

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

  // Phase 2: Enrichment
  const [seedText, setSeedText] = useState('');
  const [enrichedData, setEnrichedData] = useState<EnrichedItem[] | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Phase 3: Prompt preview
  const [promptPreview, setPromptPreview] = useState<string | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function addLog(type: GenerationLog['type'], message: string) {
    setLogs(prev => [...prev, { type, message, timestamp: Date.now() }]);
  }

  // ── Enrichment ─────────────────────────────────────────────

  async function handleEnrich() {
    const items = seedText.split('\n').map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return;

    setEnriching(true);
    addLog('progress', `🔍 Enriching ${items.length} items via OMDB...`);

    try {
      const res = await fetch('/api/admin/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedItems: items,
          enrichmentType: 'movie',
        }),
      });

      const data: any = await res.json();
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
      } else {
        addLog('error', `❌ Enrichment failed: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `❌ Network error: ${err.message}`);
    } finally {
      setEnriching(false);
    }
  }

  // ── Prompt Preview ─────────────────────────────────────────

  async function handlePreviewPrompt() {
    addLog('progress', `📝 Assembling prompt preview...`);

    try {
      const payload = buildPayload();
      const res = await fetch('/api/admin/preview-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: any = await res.json();
      if (data.success) {
        setPromptPreview(data.userPrompt);
        addLog('info', `📊 Estimated tokens: ~${data.estimatedTokens}`);
        addLog('prompt', data.userPrompt);
      } else {
        addLog('error', `❌ Preview failed: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `❌ Network error: ${err.message}`);
    }
  }

  // ── Generation ─────────────────────────────────────────────

  function buildPayload() {
    const validEnriched = enrichedData?.filter(d => !d._notFound && !d._error) || undefined;
    return {
      topic: topic.trim(),
      cardCount,
      additionalContext: additionalContext.trim() || undefined,
      deckType,
      difficulty: deckType === 'trivia' ? difficulty : undefined,
      artStyle: artStyle || undefined,
      enrichedData: validEnriched && validEnriched.length > 0 ? validEnriched : undefined,
    };
  }

  async function handleGenerate(e: React.FormEvent) {
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
      const res = await fetch('/api/admin/generate-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        // Fallback for immediate errors like 500 or 400
        const data = await res.json() as GenerationResult;
        if (data.success) {
          addLog('success', `✅ Edition created: "${data.name}"`);
          addLog('success', `Cards generated: ${data.card_count}`);
          addLog('info', `Slug: ${data.slug}`);
          addLog('info', `⚠️ Run "yarn workspace @eb-packages/deck-engine sync" to register in DECKS, then restart the dev server.`);
          setResult(data);
        } else {
          addLog('error', `❌ Generation failed: ${data.error}`);
          setResult(data);
        }
      } else {
        // SSE Stream parsing
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No reader available from response');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              if (!dataStr.trim()) continue;
              
              try {
                const event = JSON.parse(dataStr);
                if (event.type === 'progress') {
                  addLog('progress', event.message);
                } else if (event.type === 'error') {
                  addLog('error', `❌ ${event.message}`);
                  setResult({ success: false, error: event.message });
                } else if (event.type === 'done') {
                  addLog('success', `✅ Edition created: "${event.data.name}"`);
                  addLog('success', `Cards generated: ${event.data.card_count}`);
                  addLog('info', `Slug: ${event.data.slug}`);
                  addLog('info', `⚠️ Run "yarn workspace @eb-packages/deck-engine sync" to register in DECKS, then restart the dev server.`);
                  setResult(event.data);
                }
              } catch (e) {
                console.error('Failed to parse SSE line:', dataStr);
              }
            }
          }
        }
      }
    } catch (err: any) {
      addLog('error', `❌ Network error: ${err.message}`);
      setResult({ success: false, error: err.message });
    } finally {
      setGenerating(false);
    }
  }

  // ── Presets ─────────────────────────────────────────────────

  const presets = [
    { label: '🧠 Introspección', topic: 'Mazo de introspección y autoconocimiento', context: 'Tono calmo, directo, sin clichés de autoayuda. Para adultos que necesitan parar y pensar.', type: 'introspection' as DeckType },
    { label: '🍷 Primera cita', topic: 'Mazo para romper el hielo en la primera cita', context: 'Divertido pero no cursi. Preguntas que revelan personalidad sin ser invasivas.', type: 'party' as DeckType },
    { label: '⚽ Trivia fútbol', topic: 'Trivia sobre la historia del fútbol argentino', context: 'Mezcla de dificultades. Desde clásicos hasta datos poco conocidos.', type: 'trivia' as DeckType },
    { label: '🎬 Trivia cine', topic: 'Trivia sobre cine argentino y latinoamericano', context: 'Películas icónicas, directores, premios, behind-the-scenes.', type: 'trivia' as DeckType },
    { label: '🎲 Party game', topic: 'Juego de cartas para jugar entre amigos en una juntada', context: 'Retos, verdad o consecuencia, preguntas absurdas. Para 3+ jugadores.', type: 'party' as DeckType },
    { label: '💼 Team building', topic: 'Mazo de team building para equipos de trabajo', context: 'Preguntas que generan conexión entre colegas sin ser incómodas.', type: 'party' as DeckType },
  ];

  // ── Styles ─────────────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-gold)',
    opacity: 0.8,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.875rem 1rem',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 0.3s',
  };

  const chipStyle = (active: boolean, color = 'var(--color-gold)'): React.CSSProperties => ({
    padding: '0.4rem 0.75rem',
    background: active ? color : 'var(--color-surface-2)',
    color: active ? '#0c0b09' : 'var(--color-text-muted)',
    border: `1px solid ${active ? color : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: generating ? 'not-allowed' : 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.8rem',
    transition: 'all 0.2s ease',
    opacity: generating ? 0.4 : 1,
  });

  const isTrivia = deckType === 'trivia';
  const seedItems = seedText.split('\n').map(s => s.trim()).filter(Boolean);
  const hasEnrichedData = enrichedData && enrichedData.filter(d => !d._notFound).length > 0;

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

          {/* ── Left: Form ────────────────────────────────── */}
          <div>
            {/* Quick Presets */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={labelStyle}>Quick Presets</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTopic(preset.topic);
                      setAdditionalContext(preset.context);
                      setDeckType(preset.type);
                    }}
                    disabled={generating}
                    style={{
                      ...chipStyle(false),
                      borderRadius: '100px',
                      fontSize: '0.75rem',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* ── Deck Type ─────────────────────────────── */}
              <div>
                <label style={labelStyle}>Deck Type</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {([
                    { key: 'trivia', label: '🧩 Trivia', desc: 'Preguntas con respuestas verificadas' },
                    { key: 'introspection', label: '🧠 Introspección', desc: 'Ejercicios de regulación' },
                    { key: 'party', label: '🎲 Party', desc: 'Juegos sociales, retos' },
                    { key: 'custom', label: '✍️ Custom', desc: 'Freetext completo' },
                  ] as const).map((dt) => (
                    <button
                      key={dt.key}
                      type="button"
                      onClick={() => setDeckType(dt.key)}
                      disabled={generating}
                      style={chipStyle(deckType === dt.key)}
                      title={dt.desc}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Topic ─────────────────────────────────── */}
              <div>
                <label style={labelStyle}>Topic / Theme *</label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder='e.g. "Trivia sobre cine argentino y latinoamericano"'
                  disabled={generating}
                  required
                  style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                />
              </div>

              {/* ── Card Count ────────────────────────────── */}
              <div>
                <label style={labelStyle}>Card Count</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {[10, 20, 30, 40].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCardCount(n)}
                      disabled={generating}
                      style={chipStyle(cardCount === n)}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={cardCount}
                    onChange={(e) => setCardCount(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                    disabled={generating}
                    style={{ ...inputStyle, width: '70px', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* ── Difficulty (trivia only) ──────────────── */}
              {isTrivia && (
                <div>
                  <label style={labelStyle}>Difficulty</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {([
                      { key: 'easy', label: '😊 Easy', color: '#4ade80' },
                      { key: 'medium', label: '🤔 Medium', color: '#facc15' },
                      { key: 'hard', label: '🔥 Hard', color: '#f87171' },
                      { key: 'mixed', label: '🎯 Mixed', color: 'var(--color-gold)' },
                    ] as const).map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDifficulty(d.key)}
                        disabled={generating}
                        style={chipStyle(difficulty === d.key, d.color)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '0.35rem' }}>
                    {difficulty === 'mixed' ? '40% easy, 35% medium, 25% hard — recommended' :
                     difficulty === 'easy' ? 'Common knowledge, pop culture' :
                     difficulty === 'medium' ? 'Enthusiast-level, needs some interest' :
                     'Deep cuts, only experts know'}
                  </p>
                </div>
              )}

              {/* ── Art Style ─────────────────────────────── */}
              <div>
                <label style={labelStyle}>Art Style</label>
                <select
                  value={artStyle}
                  onChange={(e) => setArtStyle(e.target.value)}
                  disabled={generating}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Auto (let AI decide per deck type)</option>
                  <option value="abstract-fine-art">🎨 Abstract Fine Art</option>
                  <option value="stylized-illustration">🖼️ Stylized Illustration (poster/print)</option>
                  <option value="evocative-photography">📸 Evocative Photography</option>
                  <option value="vintage-photography">📷 Vintage Photography</option>
                  <option value="documentary">🎥 Documentary</option>
                  <option value="cinematic">🎬 Cinematic (movie poster style)</option>
                </select>
              </div>

              {/* ── Seed Items (trivia enrichment) ────────── */}
              {isTrivia && (
                <div>
                  <label style={labelStyle}>
                    📦 Seed Items (one per line) — Enriched via TMDB
                  </label>
                  <textarea
                    value={seedText}
                    onChange={(e) => { setSeedText(e.target.value); setEnrichedData(null); }}
                    placeholder={'El Secreto de sus Ojos\nRelatos Salvajes\nNueve Reinas\nLa Historia Oficial\nEl Hijo de la Novia'}
                    disabled={generating || enriching}
                    style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                  />

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleEnrich}
                      disabled={generating || enriching || seedItems.length === 0}
                      style={{
                        ...chipStyle(false, '#4ade80'),
                        color: '#4ade80',
                        borderColor: 'rgba(74, 222, 128, 0.3)',
                        opacity: (enriching || seedItems.length === 0) ? 0.4 : 1,
                      }}
                    >
                      {enriching ? '⏳ Enriching...' : `🔍 Enrich ${seedItems.length} items`}
                    </button>
                    {hasEnrichedData && (
                      <span style={{ fontSize: '0.75rem', color: '#4ade80', opacity: 0.8 }}>
                        ✅ {enrichedData!.filter(d => !d._notFound).length} items enriched
                      </span>
                    )}
                  </div>

                  {/* Enriched data preview */}
                  {hasEnrichedData && (
                    <div style={{
                      marginTop: '0.75rem',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: '#0a0908',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.5rem 0.75rem',
                    }}>
                      {enrichedData!.filter(d => !d._notFound).map((item, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', lineHeight: 1.6, padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ color: 'var(--color-gold)' }}>{item.title}</span>
                          <span style={{ opacity: 0.5 }}> ({item.year})</span>
                          {item.director && <span style={{ opacity: 0.6 }}> — {item.director}</span>}
                          {item.imdbRating && <span style={{ color: '#facc15' }}> ⭐ {item.imdbRating}</span>}
                          {item.wikiExtract && <span style={{ marginLeft: '0.5rem', background: '#93c5fd', color: '#000', padding: '0 0.4rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 'bold' }}>+ WIKI LORE</span>}
                          {item.poster && <img src={item.poster} alt="" style={{ width: 24, height: 36, borderRadius: 2, marginLeft: '0.5rem', verticalAlign: 'middle', objectFit: 'cover' }} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Additional Context ────────────────────── */}
              <div>
                <label style={labelStyle}>Additional Instructions (Optional)</label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Tone, style notes, specific instructions... e.g. 'Use informal Argentine Spanish.'"
                  disabled={generating}
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              {/* ── Action buttons ────────────────────────── */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {/* Preview Prompt */}
                <button
                  type="button"
                  onClick={handlePreviewPrompt}
                  disabled={generating || !topic.trim()}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'transparent',
                    border: '1px solid var(--color-border-strong)',
                    color: 'var(--color-text-muted)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: (!topic.trim() || generating) ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    opacity: (!topic.trim() || generating) ? 0.4 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  📝 Preview Prompt
                </button>

                {/* Generate */}
                <button
                  type="submit"
                  disabled={generating || !topic.trim()}
                  className="btn-primary"
                  style={{
                    flex: 2,
                    padding: '0.75rem',
                    fontSize: '0.85rem',
                    opacity: (generating || !topic.trim()) ? 0.5 : 1,
                    cursor: (generating || !topic.trim()) ? 'not-allowed' : 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {generating ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span className="spinner" />
                      Generating...
                    </span>
                  ) : (
                    '🃏 Generate Edition'
                  )}
                </button>
              </div>

              {/* Time estimate */}
              {!generating && topic.trim() && (
                <p style={{ fontSize: '0.7rem', opacity: 0.35, textAlign: 'center', marginTop: '-0.5rem' }}>
                  Est. ~{Math.ceil(cardCount / 10) * 15}-{Math.ceil(cardCount / 10) * 25}s
                  {hasEnrichedData ? ` · ${enrichedData!.filter(d => !d._notFound).length} seed items enriched` : ''}
                </p>
              )}
            </form>
          </div>

          {/* ── Right: Logs & Result ─────────────────────── */}
          <div>
            <label style={labelStyle}>Generation Log</label>
            <div style={{
              background: '#0a0908',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              minHeight: '400px',
              maxHeight: '600px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              lineHeight: 1.8,
            }}>
              {logs.length === 0 && (
                <div style={{ opacity: 0.3, fontStyle: 'italic' }}>
                  Waiting for action...
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} style={{
                  color: log.type === 'error' ? '#f87171'
                    : log.type === 'success' ? '#4ade80'
                    : log.type === 'progress' ? 'var(--color-gold)'
                    : log.type === 'prompt' ? '#93c5fd'
                    : 'var(--color-text-muted)',
                  opacity: log.type === 'info' ? 0.7 : 1,
                  whiteSpace: log.type === 'prompt' ? 'pre-wrap' : undefined,
                  padding: log.type === 'prompt' ? '0.75rem' : undefined,
                  background: log.type === 'prompt' ? 'rgba(147, 197, 253, 0.06)' : undefined,
                  borderRadius: log.type === 'prompt' ? '4px' : undefined,
                  margin: log.type === 'prompt' ? '0.5rem 0' : undefined,
                  border: log.type === 'prompt' ? '1px solid rgba(147, 197, 253, 0.15)' : undefined,
                  maxHeight: log.type === 'prompt' ? '300px' : undefined,
                  overflowY: log.type === 'prompt' ? 'auto' : undefined,
                }}>
                  {log.message}
                </div>
              ))}
              {generating && (
                <div style={{ color: 'var(--color-gold)', opacity: 0.6, animation: 'pulse 1.5s infinite' }}>
                  ▊
                </div>
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Result card */}
            {result?.success && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                background: 'var(--color-surface)',
                border: '1px solid rgba(74, 222, 128, 0.2)',
                borderRadius: 'var(--radius-md)',
              }}>
                <h3 style={{ margin: '0 0 0.75rem 0', color: '#4ade80', fontSize: '1rem' }}>
                  ✅ Edition Ready
                </h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  <strong>{result.name}</strong> — {result.card_count} cards
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '1rem', fontFamily: 'monospace' }}>
                  content/{result.slug}.json
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      alert(`Run this command to register the deck:\n\nyarn workspace @eb-packages/deck-engine sync\n\nThen restart the dev server to see "${result.name}" in the dashboard.`);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-gold)',
                      color: 'var(--color-gold)',
                      padding: '0.5rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    📋 Sync Instructions
                  </button>
                  <button
                    onClick={() => {
                      setTopic('');
                      setAdditionalContext('');
                      setSeedText('');
                      setEnrichedData(null);
                      setLogs([]);
                      setResult(null);
                      setPromptPreview(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-muted)',
                      padding: '0.5rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    🔄 Generate Another
                  </button>
                </div>
              </div>
            )}

            {result && !result.success && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                background: 'var(--color-surface)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                borderRadius: 'var(--radius-md)',
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#f87171', fontSize: '1rem' }}>
                  ❌ Generation Failed
                </h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>
                  {result.error}
                </p>
              </div>
            )}
          </div>
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
