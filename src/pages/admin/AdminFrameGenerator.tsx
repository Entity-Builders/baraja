import { useState, useRef, useEffect } from 'react';
import { setFrameTheme, setFrameTypography, setActiveDeckId, loadGoogleFonts } from '../../lib/cardFrame';
import { Link } from 'react-router-dom';
import { buildMasterTemplatePrompt, buildArtDirectorMetaPrompt, buildStructuralConstraints, LAYOUT_PRESETS, type BarajaTemplateMetadata, type CardLayout, type CardType, DECKS, type DeckId } from '@eb-packages/deck-engine';
import { DECK_EDITIONS } from '../../lib/editions';
import { SupabaseDeckRepository } from '../../lib/deckRepository';
import { createDefaultCardTemplate } from '../../lib/pdfmeConfig';


const DIMENSION_PRESETS = [
  { label: 'Baraja Standard (70×120mm)', widthMm: 70, heightMm: 120 },
  { label: 'Bridge Cards (57×89mm)', widthMm: 57, heightMm: 89 },
  { label: 'Poker Cards (63×88mm)', widthMm: 63, heightMm: 88 },
  { label: 'Tarot (70×121mm)', widthMm: 70, heightMm: 121 },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TypoZone {
  fontSize: number;
  fontFamily: string;
  fontWeight?: 'thin' | '300' | 'regular' | 'bold' | '700' | '900';
  lineHeight?: number;
  letterSpacing?: number;
  notes?: string;
  color?: string;
  topPct?: number;
  heightPct?: number;
  leftPct?: number;
  widthPct?: number;
  containerSvg?: string;
}

interface FocalPoint {
  description: string; // e.g. "Large crescent moon"
  xPct: number;        // center X as % of image width
  yPct: number;        // center Y as % of image height
  sizePct: number;     // approximate radius/size as %
}

interface TypographySuggestion {
  brand?: { color?: string; fontFamily?: string };
  qrFgColor?: string;
  qrSizeMm?: number;
  overallNotes?: string;
  focalPoints?: FocalPoint[]; // Vision-detected major visual elements
  ttfUrls?: Record<string, string>;
  [key: string]: TypoZone | FocalPoint[] | Record<string, string> | Record<string, unknown> | string | number | undefined;
}

interface GeneratedFrame {
  dataUrl: string;
  presetId: string;
  prompt: string; // The exact prompt used to generate this frame
  face: 'front' | 'back';
  widthMm: number;
  heightMm: number;
  timestamp: number;
  typography?: TypographySuggestion | null;
}

interface GenerateResponse {
  success: boolean;
  dataUrl?: string;
  typography?: TypographySuggestion | null;
  error?: string;
}

interface FramesLibraryResponse {
  success: boolean;
  frames?: LibraryFrame[];
  error?: string;
}

interface LibraryFrame {
  id?: string;
  url: string;
  presetId: string;
  prompt: string;
  face: 'front' | 'back';
  widthMm: number;
  heightMm: number;
  timestamp: number;
  typography?: TypographySuggestion | null;
}

function isTypoZone(value: unknown): value is TypoZone {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Component ───────────────────────────────────────────────────────────────

function getAdaptiveFontSizePx(text: string | undefined | null, pt: number, maxPt: number, heightMm: number, previewHeight: number): number {
  const safeText = text || '';
  const len = safeText.length;
  
  // Mitigate AI hallucinating huge sizes for small boxes (which pdfme auto-shrinks but HTML spills over)
  const safePt = Math.min(pt, maxPt);
  
  let scale = 1;
  if (maxPt <= 10) { // Small zones (hint, answer)
    if      (len <= 60)  scale = 1.00;
    else if (len <= 100) scale = 0.85;
    else if (len <= 150) scale = 0.75;
    else if (len <= 200) scale = 0.65;
    else                 scale = 0.55;
  } else { // Large zones (phrase, instruction)
    if      (len <= 40)  scale = 1.00;
    else if (len <= 60)  scale = 0.88;
    else if (len <= 80)  scale = 0.76;
    else if (len <= 100) scale = 0.65;
    else if (len <= 130) scale = 0.56;
    else                 scale = 0.48;
  }
  return (safePt * scale * 0.3527 / heightMm) * previewHeight;
}

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

        {/* ─── Right Panel: Preview ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Main Preview */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', opacity: 0.7, fontFamily: 'var(--font-serif)' }}>
                Preview
              </h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', opacity: 0.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showSafeZone}
                  onChange={e => setShowSafeZone(e.target.checked)}
                  style={{ accentColor: 'var(--color-gold)' }}
                />
                Safe zone overlay
              </label>
            </div>

            {/* ─── NEW GENERATE BUTTON POSITION ─── */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {error && (
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(255,100,100,0.1)',
                  border: '1px solid rgba(255,100,100,0.3)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: '#ff6b6b',
                  textAlign: 'center'
                }}>
                  ⚠️ {error}
                </div>
              )}
              <button
                onClick={() => handleGenerate()}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  background: loading ? 'rgba(201,168,92,0.3)' : 'var(--color-gold)',
                  color: loading ? 'rgba(255,255,255,0.5)' : '#0a0a10',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  letterSpacing: '0.05em',
                  boxShadow: loading ? 'none' : '0 4px 15px rgba(201,168,92,0.3)',
                }}
              >
                {loading ? '⏳ Generando Cartas con IA...' : '✨ GENERAR ARTE Y FRAME'}
              </button>
            </div>

            {/* Card Preview Area */}
            <div style={{
              position: 'relative',
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              background: '#111',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {loading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.85)',
                  zIndex: 10,
                  gap: '0.75rem',
                }}>
                  <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⏳</div>
                  <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>Generando frame...</p>
                </div>
              )}

              {activePreview ? (
                <img
                  src={activePreview.dataUrl}
                  alt="Generated frame"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.3,
                  gap: '0.5rem',
                }}>
                  <div style={{ fontSize: '3rem' }}>🖼️</div>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>El frame generado aparecerá aquí</p>
                </div>
              )}

              {/* Safe zone overlay */}
              {showSafeZone && (
                <>
                  {/* Bleed border (3mm = ~3.4% at 70mm card) */}
                  <div style={{
                    position: 'absolute',
                    inset: '3%',
                    border: '1px dashed rgba(255,80,80,0.5)',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }} />
                  {/* Content safe area (inner 65%) */}
                  <div style={{
                    position: 'absolute',
                    inset: '10%',
                    border: '1px dashed rgba(80,200,255,0.5)',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }} />
                  {/* Labels */}
                  <div style={{ position: 'absolute', zIndex: 10, top: '3%', left: '3.5%', fontSize: '0.5rem', color: 'rgba(255,80,80,0.7)' }}>
                    BLEED
                  </div>
                  <div style={{ position: 'absolute', zIndex: 10, top: '10%', left: '10.5%', fontSize: '0.5rem', color: 'rgba(80,200,255,0.7)' }}>
                    SAFE AREA
                  </div>
                </>
              )}

              {/* Dynamic Typography Overlay */}
              {activePreview?.typography && showCardContext && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
                  {/* Inject Dynamic Fonts */}
                  {activePreview.typography.ttfUrls && Object.entries(activePreview.typography.ttfUrls).map(([family, url]) => (
                    <style key={family}>{`
                      @font-face {
                        font-family: '${family}';
                        src: url('${url}') format('truetype');
                        font-weight: normal;
                        font-style: normal;
                      }
                    `}</style>
                  ))}

                  {Object.keys(cardContent).map(key => {
                    if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) return null;
                    const text = cardContent[key];
                    if (!text || typeof text !== 'string') return null;
                    const zone = activePreview.typography?.[key];
                    if (!isTypoZone(zone) || !zone.leftPct) return null;

                    return (
                      <div key={key} style={{
                        position: 'absolute', 
                        left: `${zone.leftPct}%`,
                        width: `${zone.widthPct}%`,
                        top: `${zone.topPct}%`,
                        height: `${zone.heightPct}%`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: `"${zone.fontFamily}", sans-serif`,
                        fontSize: `${getAdaptiveFontSizePx(text, zone.fontSize || 12, Math.max(zone.fontSize || 12, 12), activePreview.heightMm, previewHeight)}px`,
                        color: zone.color,
                        letterSpacing: zone.letterSpacing ? `${zone.letterSpacing}px` : 'normal',
                        lineHeight: zone.lineHeight || 1.15,
                        textAlign: 'center',
                        fontWeight: zone.fontWeight || 'normal',
                      }}>
                        {zone.containerSvg && (
                           <div 
                             dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">${zone.containerSvg}</svg>` }}
                             style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', height: '100%' }} 
                           />
                        )}
                        <span style={{ display: 'block', width: '100%', zIndex: 1, position: 'relative' }}>{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions for active preview */}
            {activePreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                
                {/* Refinement Area */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <input
                    type="text"
                    value={refinementText}
                    onChange={e => setRefinementText(e.target.value)}
                    placeholder="🪄 Refinar: Ej. 'Hazlo más oscuro', 'Agrega luces neón'"
                    style={{ 
                      background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', 
                      color: 'white', borderRadius: '4px', flex: 1, padding: '0.6rem', fontSize: '0.8rem' 
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && refinementText.trim() && !loading) {
                        handleGenerate(refinementText);
                      }
                    }}
                  />
                  <button
                    onClick={() => handleGenerate(refinementText)}
                    disabled={loading || !refinementText.trim()}
                    style={{
                      padding: '0 1.25rem',
                      background: loading ? 'rgba(167,139,250,0.3)' : '#a78bfa',
                      color: loading ? 'rgba(0,0,0,0.5)' : '#1e1e2e',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: loading || !refinementText.trim() ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      transition: 'all 0.2s',
                    }}
                  >
                    Generar
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                <button
                  onClick={() => handleSetActive(activePreview)}
                  style={{
                    flex: 2,
                    padding: '0.7rem',
                    background: saveSuccess ? 'rgba(80,200,80,0.2)' : 'rgba(201,168,92,0.2)',
                    border: `1px solid ${saveSuccess ? 'rgba(80,200,80,0.5)' : 'var(--color-gold)'}`,
                    color: saveSuccess ? '#80e080' : 'var(--color-gold)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  {saveSuccess ? '✅ Frame en uso!' : selectedDeckId ? `Set Active ${face === 'back' ? 'Back' : 'Front'} → ${selectedDeckId}` : `Set Active ${face === 'back' ? 'Back' : 'Front'} (Global)`}
                </button>
                <button
                  onClick={() => handleSaveToLibrary(activePreview)}
                  disabled={savingToLibrary}
                  style={{
                    flex: 1.5,
                    padding: '0.7rem',
                    background: savingToLibrary ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.1)',
                    border: '1px solid rgba(167,139,250,0.4)',
                    color: '#a78bfa',
                    borderRadius: '8px',
                    cursor: savingToLibrary ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  {savingToLibrary ? '⏳...' : '💾 A Galería'}
                </button>
                <button
                  onClick={() => handleDownload(activePreview)}
                  style={{
                    flex: 1,
                    padding: '0.7rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s',
                  }}
                >
                  ⬇️ Download PNG
                </button>
              </div>
              </div>
            )}

            {/* Specs */}
            {activePreview && (
              <div style={{
                display: 'flex',
                gap: '1.5rem',
                fontSize: '0.72rem',
                opacity: 0.4,
                marginTop: '1rem',
              }}>
                <span>{activePreview.widthMm}×{activePreview.heightMm}mm</span>
                <span>Face: {activePreview.face}</span>
                <span>Master Builder</span>
                <span>{new Date(activePreview.timestamp).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {/* Typography Suggestions */}
          {activePreview?.typography && (
            <div style={{
              background: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1rem' }}>🔡</span>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#a78bfa' }}>
                  Sugerencias de Tipografía IA
                </h3>
                <button
                  onClick={() => handleAnalyzeTypography()}
                  disabled={analyzingTypography}
                  style={{
                    background: analyzingTypography ? 'rgba(167,139,250,0.1)' : 'rgba(167,139,250,0.2)',
                    border: '1px solid rgba(167,139,250,0.4)',
                    color: analyzingTypography ? 'rgba(167,139,250,0.5)' : '#d8b4fe',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: analyzingTypography ? 'wait' : 'pointer',
                    marginLeft: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  title="Volver a analizar la imagen activa para sugerir nuevas tipografías y colores"
                >
                  {analyzingTypography ? '🤖 Analizando...' : '🤖 Re-analizar'}
                </button>
                <button
                  onClick={() => handleAnalyzeTypography(true)}
                  disabled={analyzingTypography}
                  style={{
                    background: analyzingTypography ? 'rgba(99,183,120,0.05)' : 'rgba(99,183,120,0.15)',
                    border: '1px solid rgba(99,183,120,0.4)',
                    color: analyzingTypography ? 'rgba(99,183,120,0.4)' : '#86efac',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: analyzingTypography ? 'wait' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Generar una distribución de layout radicalmente diferente para esta misma imagen"
                >
                  {analyzingTypography ? '...' : '🎲 Remix Layout'}
                </button>
                <span style={{ fontSize: '0.68rem', opacity: 0.4, marginLeft: 'auto' }}>
                  Gemini · pt units
                </span>
              </div>

              {/* Typography table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {Object.keys(cardContent).map(key => {
                  if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) return null;
                  const zone = activePreview.typography?.[key];
                  if (!isTypoZone(zone) || !zone.leftPct) return null;
                  return (
                    <TypoRow
                      key={key}
                      label={key.toUpperCase()}
                      field={zone}
                      uiColor={key === primaryTypographyKey ? '#f8d56b' : '#94a3b8'}
                      highlight={key === primaryTypographyKey}
                      onUpdateSvg={(svg) => handleUpdateTypographyContainerSvg(key, svg)}
                    />
                  );
                })}
              </div>

              {activePreview.typography.qrSizeMm && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', opacity: 0.5 }}>
                  QR sugerido: <strong>{activePreview.typography.qrSizeMm}mm</strong>
                </div>
              )}

              {/* Focal Points map */}
              {activePreview.typography.focalPoints && activePreview.typography.focalPoints.length > 0 && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(251,191,36,0.06)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  borderRadius: '8px',
                }}>
                  <div style={{ fontSize: '0.65rem', opacity: 0.5, marginBottom: '0.4rem', letterSpacing: '0.05em' }}>📍 ELEMENTOS VISUALES DETECTADOS</div>
                  <div style={{ position: 'relative', width: '100%', paddingBottom: '142%', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    {activePreview.typography.focalPoints.map((fp, i) => (
                      <div
                        key={i}
                        title={`${fp.description} (${fp.xPct.toFixed(0)}%, ${fp.yPct.toFixed(0)}%)`}
                        style={{
                          position: 'absolute',
                          left: `${fp.xPct}%`,
                          top: `${fp.yPct}%`,
                          width: `${Math.min(fp.sizePct * 1.5, 35)}%`,
                          paddingBottom: `${Math.min(fp.sizePct * 1.5, 35)}%`,
                          transform: 'translate(-50%, -50%)',
                          borderRadius: '50%',
                          border: '1.5px dashed rgba(251,191,36,0.7)',
                          background: 'rgba(251,191,36,0.1)',
                          cursor: 'default',
                        }}
                      />
                    ))}
                    {activePreview.typography.focalPoints.map((fp, i) => (
                      <div key={`lbl-${i}`} style={{
                        position: 'absolute',
                        left: `${fp.xPct}%`,
                        top: `${fp.yPct}%`,
                        transform: 'translate(-50%, -50%)',
                        fontSize: '0.5rem',
                        color: '#fbbf24',
                        fontWeight: 700,
                        background: 'rgba(0,0,0,0.6)',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}>{fp.description.slice(0, 18)}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {activePreview.typography.focalPoints.map((fp, i) => (
                      <div key={i} style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                        <span style={{ color: '#fbbf24' }}>●</span> {fp.description} — ({fp.xPct.toFixed(0)}% derecha, {fp.yPct.toFixed(0)}% abajo)
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePreview.typography.overallNotes && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(167,139,250,0.08)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  opacity: 0.7,
                  lineHeight: 1.5,
                }}>
                  💬 {activePreview.typography.overallNotes}
                </div>
              )}
            </div>
          )}

          {/* Generation History */}
          {history.length > 1 && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '1.25rem',
            }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', opacity: 0.6 }}>
                Historial de esta sesión
              </h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {history.map((frame, i) => (
                  <div
                    key={frame.timestamp}
                    onClick={() => setActivePreview(frame)}
                    style={{
                      width: '72px',
                      height: '100px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: `2px solid ${activePreview?.timestamp === frame.timestamp ? 'var(--color-gold)' : 'transparent'}`,
                      transition: 'border-color 0.15s',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Frame ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {i === 0 && (
                      <div style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'var(--color-gold)',
                        color: '#0a0a10',
                        fontSize: '0.5rem',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        fontWeight: 700,
                      }}>
                        NEW
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info card */}
          <div style={{
            padding: '1rem 1.25rem',
            background: 'rgba(201,168,92,0.05)',
            border: '1px solid rgba(201,168,92,0.15)',
            borderRadius: '10px',
            fontSize: '0.78rem',
            lineHeight: 1.6,
            opacity: 0.7,
          }}>
            <strong style={{ color: 'var(--color-gold)' }}>💡 Workflow sugerido:</strong>
            <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
              <li>Elegí un preset y generá varios hasta encontrar el estilo correcto</li>
              <li>Usá el historial para comparar variaciones</li>
              <li>Hacé click en <em>"Set as Active Frame"</em> para guardarlo</li>
              <li>El frame reemplaza <code>/public/frames/{'{face}'}-frame.png</code></li>
            </ol>
          </div>
        </div>

        {/* ─── Right Panel: Layout & Structure ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section style={sectionStyle}>
            <label style={labelStyle}>Layout de Zonas de Contenido</label>
            
            {/* Layout Preset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
              {Object.entries(LAYOUT_PRESETS).map(([id, preset]) => (
                <button
                  key={id}
                  onClick={() => {
                    setLayoutPresetId(id);
                    setBuilderMetadata(prev => ({ ...prev, layout: preset.layout }));
                  }}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '8px',
                    border: `1px solid ${layoutPresetId === id ? 'var(--color-gold)' : 'rgba(255,255,255,0.08)'}`,
                    background: layoutPresetId === id ? 'rgba(201,168,92,0.12)' : 'rgba(255,255,255,0.02)',
                    color: layoutPresetId === id ? 'var(--color-gold)' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    lineHeight: 1.3,
                  }}
                  onMouseOver={e => {
                    if (layoutPresetId !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseOut={e => {
                    if (layoutPresetId !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                >
                  <div style={{ fontWeight: layoutPresetId === id ? 600 : 400 }}>{preset.label}</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '0.15rem' }}>{preset.description}</div>
                </button>
              ))}
            </div>

            {/* Manual Layout Toggles - ALWAYS VISIBLE OVERRIDES */}
            <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ fontSize: '0.72rem', opacity: 0.6, display: 'block', marginBottom: '0.8rem', fontWeight: 600 }}>Zonas Manuales (Overrides)</label>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.7rem' }}>
                {[
                  { key: 'hasHeaderZone', label: 'Top Header Zone' },
                  { key: 'hasBodyZone', label: 'Middle Body Zone' },
                  { key: 'hasCentralImageZone', label: 'Center Cutout' },
                  { key: 'hasFooterZone', label: 'Bottom Footer Zone' },
                ].map(zone => (
                  <label key={zone.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer', color: 'rgba(255,255,255,0.9)' }}>
                    <input
                      type="checkbox"
                      checked={builderMetadata.layout?.[zone.key as keyof CardLayout] as boolean ?? false}
                      onChange={e => {
                        setLayoutPresetId('custom'); // FORCE custom when tweaked
                        setBuilderMetadata(prev => ({
                          ...prev,
                          layout: {
                            ...prev.layout!,
                            [zone.key]: e.target.checked
                          }
                        }));
                      }}
                      style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>{zone.label}</span>
                  </label>
                ))}
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer', marginTop: '0.5rem', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)' }}>
                  <input
                    type="checkbox"
                    checked={builderMetadata.layout?.borderless ?? false}
                    onChange={e => {
                      setLayoutPresetId('custom'); // FORCE custom when tweaked
                      setBuilderMetadata(prev => ({
                        ...prev,
                        layout: {
                          ...prev.layout!,
                          borderless: e.target.checked
                        }
                      }));
                    }}
                    style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span>Borderless (Fondo full-bleed sin marcos)</span>
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
      
      {/* ─── Gallery Section ─── */}
      <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--color-gold)' }}>
            📚 Librería de Frames Guardados
          </h2>
          <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{libraryFrames.length} frames en tu repertorio</span>
        </div>
        
        {loadingLibrary ? (
          <div style={{ opacity: 0.5, fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>⏳ Recuperando galería...</div>
        ) : libraryFrames.length === 0 ? (
          <div style={{ opacity: 0.3, fontSize: '0.8rem', padding: '3rem 0', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
            No guardaste ningún frame todavía. Usá el botón "💾 A Galería" para sumar tu diseño acá.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '1.25rem' }}>
            {libraryFrames.map(libFrame => (
              <div 
                key={libFrame.id}
                onClick={() => handleSelectFromLibrary(libFrame)}
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px',
                  border: `1px solid ${activePreview?.timestamp === libFrame.timestamp ? 'var(--color-gold)' : 'rgba(255,255,255,0.05)'}`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = 'rgba(201,168,92,0.4)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = activePreview?.timestamp === libFrame.timestamp ? 'var(--color-gold)' : 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ borderRadius: '6px', overflow: 'hidden', background: '#0a0a0f', aspectRatio: '70 / 120' }}>
                  <img 
                    src={libFrame.url} 
                    alt="Saved Frame" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ fontSize: '0.62rem', opacity: 0.45, marginTop: '0.4rem', textAlign: 'center', fontFamily: 'monospace' }}>
                  {new Date(libFrame.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden download anchor */}
      <a ref={downloadRef} style={{ display: 'none' }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Style Helpers ───────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '10px',
  padding: '1rem 1.1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.5)',
  textTransform: 'uppercase',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  color: 'white',
  fontSize: '0.85rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  color: 'white',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

// ─── Typography Row Helper ───────────────────────────────────────────────────

interface TypoRowProps {
  label: string;
  field: TypoZone;
  uiColor?: string;
  highlight?: boolean;
  onUpdateSvg?: (svg: string) => void;
}

function TypoRow({ label, field, uiColor = 'white', highlight = false, onUpdateSvg }: TypoRowProps) {
  const weightLabel = field.fontWeight
    ? { thin: 'Thin', '300': 'Light', regular: 'Regular', bold: 'Bold', '700': 'Bold', '900': 'Black' }[field.fontWeight] ?? field.fontWeight
    : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      padding: '0.5rem 0.65rem',
      background: highlight ? 'rgba(248,213,107,0.06)' : 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      border: `1px solid ${highlight ? 'rgba(248,213,107,0.2)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'min-content 1fr auto',
        gap: '0.5rem',
        alignItems: 'start',
      }}>
        {/* Color Indicator */}
        {field.color ? (
          <div style={{ marginTop: '3px', width: '12px', height: '12px', borderRadius: '4px', background: field.color, border: '1px solid rgba(255,255,255,0.2)' }} title={`Color IA: ${field.color}`} />
        ) : <div style={{ width: '12px' }} />}
        
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7, letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
            {label}
          </div>
          
          {field.notes && (
            <div style={{ fontSize: '0.68rem', opacity: 0.45, fontStyle: 'italic', lineHeight: 1.3 }}>
              {field.notes}
            </div>
          )}
        </div>

        {/* Specs column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: uiColor, fontFamily: 'monospace' }}>
              {field.fontSize}pt
            </div>
            {weightLabel && (
              <div style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: '4px',
                background: weightLabel === 'Black' || weightLabel === 'Bold'
                  ? 'rgba(251,191,36,0.2)'
                  : weightLabel === 'Thin' || weightLabel === 'Light'
                  ? 'rgba(148,163,184,0.15)'
                  : 'rgba(255,255,255,0.08)',
                color: weightLabel === 'Black' || weightLabel === 'Bold' ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                letterSpacing: '0.04em',
              }}>
                {weightLabel.toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.55, textAlign: 'right' }}>
            {field.fontFamily?.includes('Cormorant') ? 'Cormorant Garamond' : (field.fontFamily || 'Default Font')}
          </div>
          <div style={{ display: 'flex', gap: '8px', fontSize: '0.6rem', opacity: 0.4 }}>
            {field.lineHeight && <span>lh:{field.lineHeight}</span>}
            {field.letterSpacing && <span>ls:{field.letterSpacing}</span>}
          </div>
        </div>
      </div>

      {/* SVG Container Editor */}
      {onUpdateSvg && (
        <div style={{ marginTop: '0.2rem', padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.55rem', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Container SVG (Fondo de texto)</div>
          <textarea
            value={field.containerSvg || ''}
            onChange={(e) => onUpdateSvg(e.target.value)}
            placeholder='Ej: <rect width="100%" height="100%" rx="10" fill="rgba(0,0,0,0.5)" />'
            style={{
              width: '100%',
              minHeight: '40px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none',
              padding: 0
            }}
          />
        </div>
      )}
    </div>
  );
}
