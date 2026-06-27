import { useState, useRef, useEffect } from 'react';
import { setFrameTheme, setFrameTypography, setActiveDeckId, loadGoogleFonts } from '../../lib/cardFrame';
import { Link } from 'react-router-dom';
import { buildMasterTemplatePrompt, buildArtDirectorMetaPrompt, buildStructuralConstraints, LAYOUT_PRESETS, type BarajaTemplateMetadata, type CardLayout, type CardType, DECKS, type DeckId } from '@eb-packages/deck-engine';
import { DECK_EDITIONS } from '../../lib/editions';
import { SupabaseDeckRepository } from '../../lib/deckRepository';
import { createDefaultCardTemplate } from '../../lib/pdfmeConfig';
import { FrameLayoutPanel } from './components/frame-generator/FrameLayoutPanel';
import { FrameLibraryGallery } from './components/frame-generator/FrameLibraryGallery';
import { FramePreviewPanel } from './components/frame-generator/FramePreviewPanel';
import { inputStyle, labelStyle, sectionStyle, selectStyle } from './frameGeneratorStyles';
import type { GeneratedFrame, GenerateResponse, FramesLibraryResponse, LibraryFrame } from './frameGeneratorTypes';
import { isTypoZone } from './frameGeneratorTypes';


const DIMENSION_PRESETS = [
  { label: 'Baraja Standard (70×120mm)', widthMm: 70, heightMm: 120 },
  { label: 'Bridge Cards (57×89mm)', widthMm: 57, heightMm: 89 },
  { label: 'Poker Cards (63×88mm)', widthMm: 63, heightMm: 88 },
  { label: 'Tarot (70×121mm)', widthMm: 70, heightMm: 121 },
];

export default function AdminFrameGenerator() {
  // Config state
  const [face, setFace] = useState<'front' | 'back'>('back');
  const [cardType, setCardType] = useState<CardType>('party');
  const [layoutPresetId, setLayoutPresetId] = useState<string>('back-standard');
  const [builderMetadata, setBuilderMetadata] = useState<BarajaTemplateMetadata>({
    themeDescription: 'Party Drinking game, dark neon club vibe',
    cardType: 'party',
    layout: LAYOUT_PRESETS['back-standard'].layout,
    primaryColorHex: '',
  });
  const [customPrompt] = useState('');
  const [customConstraints] = useState('');
  const [dimPresetIdx, setDimPresetIdx] = useState(0);
  const [customWidth, setCustomWidth] = useState(70);
  const [customHeight, setCustomHeight] = useState(120);
  const [showSafeZone, setShowSafeZone] = useState(true);

  // Card content context for typography suggestions
  const [selectedEditionId, setSelectedEditionId] = useState('barometro');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [cardContent, setCardContent] = useState(
    DECK_EDITIONS.find(e => e.id === 'barometro')!.sampleCard
  );
  const primaryTypographyKey = cardType === 'therapeutic' ? 'phrase' : 'instruction';
  const [showCardContext] = useState(true);

    const selectedEdition = DECK_EDITIONS.find(e => e.id === selectedEditionId)!;

  // Generation state
  const [loading, setLoading] = useState(false);
  const [analyzingTypography, setAnalyzingTypography] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedFrame[]>([]);
  const [activePreview, setActivePreview] = useState<GeneratedFrame | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [frameThemeChoice] = useState<'dark' | 'light'>('dark');
  const [refinementText, setRefinementText] = useState('');

  // Load any suggested fonts dynamically so the preview renders accurately
  useEffect(() => {
    if (!activePreview?.typography) return;
    const typo = activePreview.typography;
    
    const families: string[] = [];
    Object.keys(typo).forEach(key => {
      if (['brand', 'qrFgColor', 'ttfUrls', 'focalPoints'].includes(key)) {
         if (key === 'brand' && typo.brand?.fontFamily) {
            families.push(typo.brand.fontFamily);
         }
         return;
      }
      const zone = typo[key];
      if (isTypoZone(zone) && zone.fontFamily) {
         families.push(zone.fontFamily);
      }
    });

    if (families.length) {
      loadGoogleFonts(families);
    }
  }, [activePreview?.typography]);

  // Library state
  const [libraryFrames, setLibraryFrames] = useState<LibraryFrame[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  useEffect(() => {
    fetchLibrary();
  }, []);

  async function fetchLibrary() {
    try {
      setLoadingLibrary(true);
      const res = await fetch('/__cms__/list-frames-library');
      const data = await res.json() as FramesLibraryResponse;
      if (data.success && data.frames) {
        setLibraryFrames(data.frames);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function handleSaveToLibrary(frame: GeneratedFrame) {
    try {
      setSavingToLibrary(true);
      const res = await fetch('/__cms__/save-frame-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: frame.dataUrl,
          prompt: frame.prompt,
          typography: frame.typography,
          face: frame.face,
          widthMm: frame.widthMm,
          heightMm: frame.heightMm,
          presetId: frame.presetId,
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        fetchLibrary(); // refresh the gallery
      } else {
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingToLibrary(false);
    }
  }

  function handleSelectFromLibrary(libFrame: LibraryFrame) {
    const frame: GeneratedFrame = {
      // libFrame.url is the path to the stored image
      dataUrl: libFrame.url,
      presetId: libFrame.presetId,
      prompt: libFrame.prompt,
      face: libFrame.face,
      widthMm: libFrame.widthMm,
      heightMm: libFrame.heightMm,
      timestamp: libFrame.timestamp,
      typography: libFrame.typography,
    };
    setActivePreview(frame);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const downloadRef = useRef<HTMLAnchorElement>(null);

  const dims = dimPresetIdx < DIMENSION_PRESETS.length
    ? DIMENSION_PRESETS[dimPresetIdx]
    : { label: 'Custom', widthMm: customWidth, heightMm: customHeight };

  // Card aspect ratio for preview
  const aspectRatio = dims.widthMm / dims.heightMm;
  const previewHeight = 420;
  const previewWidth = Math.round(previewHeight * aspectRatio);

  async function handleGenerate(refinementText?: string) {
    const activeFields = Object.keys(cardContent || {}).filter(k => 
      !['back_image_url', 'back_image_versions', 'qr_url'].includes(k) && typeof cardContent[k] === 'string' && !!cardContent[k]
    );
    const metadata: BarajaTemplateMetadata = { 
      ...builderMetadata, 
      face, 
      cardType,
      dynamicFields: activeFields
    };
    
    const artDirectorPrompt = buildArtDirectorMetaPrompt(metadata);
    const structuralConstraints = buildStructuralConstraints(metadata);
    // Legacy: still used for "Ver prompt" display
    const promptToSend = buildMasterTemplatePrompt(metadata);

    if (!promptToSend.trim()) {
      setError('El prompt no puede estar vacío.');
      return;
    }
    setLoading(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const hasContent = cardContent.when_to_use || cardContent.phrase || cardContent.instruction;
      const res = await fetch('/__cms__/generate-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          artDirectorPrompt,
          structuralConstraints,
          refinement: refinementText,
          face,
          widthMm: dims.widthMm,
          heightMm: dims.heightMm,
          cardContent: hasContent ? {
            ...cardContent,
            frameDescription: promptToSend.slice(0, 120),
            framePalette: frameThemeChoice === 'light' ? 'light/warm parchment' : 'dark navy or black',
          } : undefined,
          edition: {
            id: selectedEdition.id,
            label: selectedEdition.label,
            description: selectedEdition.description,
            fields: selectedEdition.fields,
          },
          cardType,
          layout: builderMetadata.layout,
          // Send manual overrides if provided
          customVisualPrompt: customPrompt.trim() ? customPrompt : undefined,
          customConstraints: customConstraints.trim() ? customConstraints : undefined,
          enforceBorderless: builderMetadata.enforceBorderless,
        }),
      });

      const data = await res.json() as GenerateResponse;

      if (!data.success || !data.dataUrl) {
        throw new Error(data.error || 'La generación falló sin mensaje de error.');
      }

      const frame: GeneratedFrame = {
        dataUrl: data.dataUrl,
        presetId: 'master-builder',
        prompt: promptToSend,
        face,
        widthMm: dims.widthMm,
        heightMm: dims.heightMm,
        timestamp: Date.now(),
        typography: data.typography,
      };

      setHistory(prev => [frame, ...prev.slice(0, 7)]); // Keep last 8
      setActivePreview(frame);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeTypography(remix = false) {
    if (!activePreview || !activePreview.dataUrl) return;
    setAnalyzingTypography(true);
    setError(null);

    try {
      const res = await fetch('/__cms__/analyze-typography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: activePreview.dataUrl,
          w: activePreview.widthMm,
          h: activePreview.heightMm,
          edition: selectedEdition,
          cardContent,
          cardType,
          // When remix=true, we pass a random seed so the AI explores a different layout constellation
          remixInstruction: remix
            ? `IMPORTANT: Explore a RADICALLY DIFFERENT layout from the default one. Shift text blocks to unexpected positions using the image's visual elements as your guide (e.g. if a lunar object is on the upper right, push the primary text block to the lower left). Also vary font weights dramatically: use 'thin' or '300' for some zones and 'bold' or '900' for others. Be bold. Seed: ${Math.random()}`
            : undefined,
        }),
      });

      const data = await res.json() as GenerateResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falló el análisis de tipografía.');
      }

      // Update the active preview with the new typography
      setActivePreview({
        ...activePreview,
        typography: data.typography,
      });

      // Also update it in the history array if you want it to persist there
      setHistory(prev => prev.map(f => f.dataUrl === activePreview.dataUrl ? { ...f, typography: data.typography } : f));
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingTypography(false);
    }
  }

  async function handleSetActive(frame: GeneratedFrame) {
    setSaveSuccess(false);
    setError(null);

    try {
      const res = await fetch('/__cms__/set-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: frame.dataUrl,
          face: frame.face,
          deckId: selectedDeckId || undefined,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || 'No se pudo guardar el frame.');
      setFrameTheme(frameThemeChoice);
      setFrameTypography(frame.typography ?? null);
      setActiveDeckId(selectedDeckId);
      
      if (selectedDeckId) {
        try {
          const deckRepo = new SupabaseDeckRepository();
          const deckInfo = await deckRepo.getDeckById(selectedDeckId);
          if (deckInfo) {
            const newLayoutTemplate = createDefaultCardTemplate(frame.widthMm, frame.heightMm, frame.typography ?? undefined);
            
            await deckRepo.updateDeckSettings(selectedDeckId, {
              design_template_overrides: {
                ...(deckInfo.design_template_overrides || {}),
                layout_config: newLayoutTemplate as unknown,
              }
            });
            console.log(`[AdminFrameGenerator] Updated layout_config for deck ${selectedDeckId} in Supabase`);
          }
        } catch (err) {
          console.error('[AdminFrameGenerator] Failed to update layout_config on deck in Supabase:', err);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDownload(frame: GeneratedFrame) {
    if (!downloadRef.current) return;
    const ext = frame.dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const filename = `frame-${frame.face}-${frame.widthMm}x${frame.heightMm}-${frame.timestamp}.${ext}`;
    downloadRef.current.href = frame.dataUrl;
    downloadRef.current.download = filename;
    downloadRef.current.click();
  }

  function handleUpdateTypographyContainerSvg(key: string, svg: string) {
    const activeTimestamp = activePreview?.timestamp;

    setActivePreview(prev => {
      if (!prev?.typography) return prev;
      const zone = prev.typography[key];
      if (!isTypoZone(zone)) return prev;

      return {
        ...prev,
        typography: {
          ...prev.typography,
          [key]: {
            ...zone,
            containerSvg: svg,
          },
        },
      };
    });

    if (!activeTimestamp) return;
    setHistory(prev => prev.map(frame => {
      if (frame.timestamp !== activeTimestamp || !frame.typography) return frame;
      const zone = frame.typography[key];
      if (!isTypoZone(zone)) return frame;

      return {
        ...frame,
        typography: {
          ...frame.typography,
          [key]: {
            ...zone,
            containerSvg: svg,
          },
        },
      };
    }));
  }

  function handleSelectLayoutPreset(id: string, layout: CardLayout) {
    setLayoutPresetId(id);
    setBuilderMetadata(prev => ({ ...prev, layout }));
  }

  function handleToggleLayoutZone(key: keyof CardLayout, checked: boolean) {
    setLayoutPresetId('custom');
    setBuilderMetadata(prev => ({
      ...prev,
      layout: {
        ...prev.layout!,
        [key]: checked,
      },
    }));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a10', color: 'white', padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Admin
        </Link>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-serif)', color: 'var(--color-gold)' }}>
          🖼️ AI Frame Generator
        </h1>
        <span style={{ fontSize: '0.75rem', opacity: 0.5, marginLeft: 'auto' }}>
          Powered by Gemini · Print-Ready Output
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 2fr 340px', gap: '2rem', alignItems: 'start' }}>

        {/* ─── Left Panel: Config ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Face selector */}
          <section style={sectionStyle}>
            <label style={labelStyle}>Cara de la carta</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['back', 'front'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFace(f)}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    borderRadius: '6px',
                    border: `1px solid ${face === f ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                    background: face === f ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                    color: face === f ? 'var(--color-gold)' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'back' ? '🔄 Reverso' : '🃏 Frente'}
                </button>
              ))}
            </div>
          </section>


          {/* Dimensions */}
          <section style={sectionStyle}>
            <label style={labelStyle}>Dimensiones</label>
            <select
              value={dimPresetIdx}
              onChange={e => setDimPresetIdx(Number(e.target.value))}
              style={selectStyle}
            >
              {DIMENSION_PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
              <option value={DIMENSION_PRESETS.length}>Custom...</option>
            </select>
            {dimPresetIdx === DIMENSION_PRESETS.length && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Width (mm)</label>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={e => setCustomWidth(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Height (mm)</label>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={e => setCustomHeight(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </section>


          {/* Card Configuration */}
          <section style={sectionStyle}>
            <label style={labelStyle}>Configuración de Carta</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Auto-fill from Deck Engine */}
              <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'block', marginBottom: '0.4rem' }}>Autocompletar desde Baraja</label>
                <select
                  style={{ ...selectStyle, cursor: 'pointer' }}
                  onChange={e => {
                    const deckId = e.target.value as DeckId;
                    if (!deckId) return;
                    setSelectedDeckId(deckId);
                    const deck = DECKS[deckId];
                    if (deck) {
                      setBuilderMetadata(prev => ({
                        ...prev,
                        themeDescription: `${deck.name}. ${deck.metadata.topic}. Ambientación: ${deck.metadata.tone}.`,
                        primaryColorHex: deck.design?.primary_color || prev.primaryColorHex,
                      }));
                      const localEdition = DECK_EDITIONS.find(e =>
                        e.deckEngineIds?.includes(deckId) || e.id === deckId
                      );
                      if (localEdition) {
                        setSelectedEditionId(localEdition.id);
                        setCardContent(localEdition.sampleCard);
                        // Auto-set card type from edition
                        const typeMap: Record<string, CardType> = {
                          barometro: 'therapeutic',
                          trivia: 'trivia',
                          juegos: 'game',
                          rompelo: 'party',
                        };
                        const inferredType = typeMap[localEdition.id] ?? 'custom';
                        setCardType(inferredType);
                        setBuilderMetadata(prev => ({ ...prev, cardType: inferredType }));
                      }
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Seleccionar Baraja --</option>
                  {Object.keys(DECKS).map(key => (
                    <option key={key} value={key}>{DECKS[key as DeckId].name}</option>
                  ))}
                </select>
              </div>

              {/* Theme description */}
              <div>
                <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span>Temática visual (Gemini Art Director)</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setBuilderMetadata(prev => ({ 
                        ...prev, 
                        themeDescription: prev.themeDescription 
                          ? `${prev.themeDescription}, hyper-detailed, elegant, trending on artstation, cinematic lighting, vivid colors` 
                          : 'hyper-detailed, elegant, trending on artstation, cinematic lighting, vivid colors'
                      }))}
                      style={{ background: 'var(--color-gold)', border: 'none', color: '#111', fontSize: '0.65rem', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}
                      title="Enriquecer prompt visualmente"
                    >
                      🪄 Enhance
                    </button>
                    <button
                       onClick={() => setBuilderMetadata(prev => ({ ...prev, themeDescription: '' }))}
                       style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '0.65rem', cursor: 'pointer', padding: 0, opacity: 0.8 }}
                     >
                       Limpiar
                     </button>
                  </div>
                </label>
                <textarea
                  value={builderMetadata.themeDescription}
                  onChange={e => setBuilderMetadata(prev => ({ ...prev, themeDescription: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '65px' }}
                  placeholder="Ej: Trivia de cine, energía de sala de cine vintage..."
                />
                
                {/* INSPIRATION CHIPS */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                   {[
                     { label: 'Cyberpunk Neón', icon: '⚡' },
                     { label: 'Acuarela Botánica', icon: '🌿' },
                     { label: 'Retrofuturismo 80s', icon: '📼' },
                     { label: 'Minimalismo Zen', icon: '🧘' },
                     { label: 'Gótico Oscuro', icon: '🦇' },
                     { label: 'Bauhaus Geométrico', icon: '📐' },
                     { label: 'Pop Art', icon: '💥' },
                     { label: 'Rococó Elegante', icon: '👑' }
                   ].map(chip => (
                     <button
                       key={chip.label}
                       onClick={() => setBuilderMetadata(prev => ({ 
                         ...prev, 
                         themeDescription: prev.themeDescription 
                           ? `${prev.themeDescription}, ${chip.label}` 
                           : chip.label 
                       }))}
                       style={{ 
                         background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', 
                         borderRadius: '16px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', cursor: 'pointer',
                         display: 'flex', alignItems: 'center', gap: '0.2rem', transition: 'all 0.15s'
                       }}
                       onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                       onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                     >
                       <span>{chip.icon}</span> {chip.label}
                     </button>
                   ))}
                </div>
              </div>

              {/* Card Type */}
              <div>
                <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'block', marginBottom: '0.4rem' }}>Tipo de Carta</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                  {([
                    { id: 'therapeutic', label: '🧘 Terapéutica', hint: 'Ejercicios / regulación' },
                    { id: 'trivia',      label: '🎯 Trivia',       hint: 'Preguntas y respuestas' },
                    { id: 'party',       label: '🎉 Fiesta',       hint: 'Social / irreverente' },
                    { id: 'game',        label: '🎲 Juego',        hint: 'Mecánicas / reglas' },
                    { id: 'custom',      label: '✍️ Custom',       hint: 'Personalizado' },
                  ] as const).map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setCardType(t.id as CardType);
                        setBuilderMetadata(prev => ({ ...prev, cardType: t.id as CardType }));
                      }}
                      title={t.hint}
                      style={{
                        padding: '0.45rem 0.5rem',
                        borderRadius: '6px',
                        border: `1px solid ${cardType === t.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                        background: cardType === t.id ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                        color: cardType === t.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.55)',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        ...(t.id === 'custom' ? { gridColumn: '1 / -1' } : {}),
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>


              {/* Primary Color */}
              <div>
                <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Color Principal (Opcional)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={builderMetadata.primaryColorHex || '#FFD700'}
                    onChange={e => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: e.target.value }))}
                    style={{ width: '32px', height: '32px', padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                  />
                  <input
                    type="text"
                    value={builderMetadata.primaryColorHex || ''}
                    onChange={e => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Ej: #FFD700"
                  />
                  <button
                    onClick={() => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: undefined }))}
                    style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                    title="Limpiar color"
                  >
                    X
                  </button>
                </div>
              </div>

            </div>
          </section>

          {/* Prompt Preview Viewer */}
          <section style={sectionStyle}>
            <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔍 Preview de Instrucciones al Motor</span>
            </label>
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '0.6rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.5)',
              overflowY: 'auto',
              maxHeight: '130px',
              lineHeight: 1.4,
              fontFamily: 'monospace'
            }}>
              <strong>Art Director:</strong><br />
              {buildArtDirectorMetaPrompt(builderMetadata)}
              <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
              <strong>Structural Rules:</strong><br />
              {buildStructuralConstraints(builderMetadata)}
            </div>
          </section>

        </div>

        <FramePreviewPanel
          activePreview={activePreview}
          analyzingTypography={analyzingTypography}
          cardContent={cardContent}
          error={error}
          face={face}
          history={history}
          loading={loading}
          previewHeight={previewHeight}
          previewWidth={previewWidth}
          primaryTypographyKey={primaryTypographyKey}
          refinementText={refinementText}
          saveSuccess={saveSuccess}
          savingToLibrary={savingToLibrary}
          selectedDeckId={selectedDeckId}
          showCardContext={showCardContext}
          showSafeZone={showSafeZone}
          onAnalyzeTypography={handleAnalyzeTypography}
          onDownload={handleDownload}
          onGenerate={handleGenerate}
          onRefinementTextChange={setRefinementText}
          onSaveToLibrary={handleSaveToLibrary}
          onSelectHistoryFrame={setActivePreview}
          onSetActive={handleSetActive}
          onToggleSafeZone={setShowSafeZone}
          onUpdateTypographyContainerSvg={handleUpdateTypographyContainerSvg}
        />

        <FrameLayoutPanel
          builderMetadata={builderMetadata}
          layoutPresetId={layoutPresetId}
          onSelectPreset={handleSelectLayoutPreset}
          onToggleZone={handleToggleLayoutZone}
        />
      </div>
      
      <FrameLibraryGallery
        activePreview={activePreview}
        frames={libraryFrames}
        loading={loadingLibrary}
        onSelectFrame={handleSelectFromLibrary}
      />

      {/* Hidden download anchor */}
      <a ref={downloadRef} style={{ display: 'none' }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
