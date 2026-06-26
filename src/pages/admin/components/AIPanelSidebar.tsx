import React, { useState, useEffect } from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import {
  buildMasterTemplatePrompt,
  buildArtDirectorMetaPrompt,
  buildStructuralConstraints,
  type BarajaTemplateMetadata,
  type CardType,
} from '@eb-packages/deck-engine';
import { DECK_EDITIONS, getEditionBySlug } from '../../../lib/editions';

// ─── Constants ───────────────────────────────────────────────────────────────

const INSPIRATION_CHIPS = [
  { label: 'Cyberpunk Neón',      icon: '⚡' },
  { label: 'Acuarela Botánica',   icon: '🌿' },
  { label: 'Retrofuturismo 80s',  icon: '📼' },
  { label: 'Minimalismo Zen',     icon: '🧘' },
  { label: 'Gótico Oscuro',       icon: '🦇' },
  { label: 'Bauhaus Geométrico',  icon: '📐' },
  { label: 'Pop Art',             icon: '💥' },
  { label: 'Rococó Elegante',     icon: '👑' },
];

const CARD_TYPES: { id: CardType; label: string; hint: string }[] = [
  { id: 'therapeutic', label: '🧘 Terapéutica', hint: 'Ejercicios / regulación' },
  { id: 'trivia',      label: '🎯 Trivia',       hint: 'Preguntas y respuestas' },
  { id: 'party',       label: '🎉 Fiesta',       hint: 'Social / irreverente' },
  { id: 'game',        label: '🎲 Juego',        hint: 'Mecánicas / reglas' },
  { id: 'custom',      label: '✍️ Custom',       hint: 'Personalizado' },
];

interface LibraryFrame {
  id?: string;
  url: string;
  prompt?: string;
  presetId?: string;
  face?: 'front' | 'back';
  widthMm?: number;
  heightMm?: number;
  timestamp?: number;
}

interface FramesLibraryResponse {
  success: boolean;
  frames?: LibraryFrame[];
  error?: string;
}

interface GenerateFrameResponse {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

interface AssetGenerationResponse {
  success: boolean;
  svg?: string;
  png?: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve the best cardType from a deck slug via DECK_EDITIONS */
function inferCardType(slug: string): CardType {
  const edition = getEditionBySlug(slug);
  if (!edition) return 'custom';
  const map: Record<string, CardType> = {
    barometro: 'therapeutic',
    trivia:    'trivia',
    juegos:    'game',
    rompelo:   'party',
    custom:    'custom',
  };
  return map[edition.id] ?? 'party';
}

/** 
 * Automatically keys out the white background from the generated container PNG using a flood fill algorithm 
 * starting from the outer edges. This allows transparent overlay in pdfme.
 */
async function removeWhiteBackground(base64Data: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Data;
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Data);
      
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const getIndex = (x: number, y: number) => (y * width + x) * 4;
      const isWhite = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const i = getIndex(x, y);
        // Pure or near pure white
        return data[i] > 230 && data[i+1] > 230 && data[i+2] > 230 && data[i+3] > 0;
      };
      
      const stack: [number, number][] = [[0, 0]];
      // If 0,0 is not white, try to find a white edge pixel
      if (!isWhite(0,0)) {
         let found = false;
         for(let i=0; i<width; i++) {
           if(isWhite(i,0)) { stack.push([i,0]); found=true; break; }
           if(isWhite(i,height-1)) { stack.push([i,height-1]); found=true; break; }
         }
         if(!found) {
           for(let j=0; j<height; j++) {
             if(isWhite(0,j)) { stack.push([0,j]); found=true; break; }
             if(isWhite(width-1,j)) { stack.push([width-1,j]); found=true; break; }
           }
         }
      }
      
      const visited = new Uint8Array(width * height);
      
      while(stack.length > 0) {
        const [x, y] = stack.pop()!;
        const idx = y * width + x;
        if (visited[idx]) continue;
        visited[idx] = 1;
        
        if (isWhite(x, y)) {
           const i = getIndex(x, y);
           data[i+3] = 0; // Transparent
           if (x > 0) stack.push([x-1, y]);
           if (x < width - 1) stack.push([x+1, y]);
           if (y > 0) stack.push([x, y-1]);
           if (y < height - 1) stack.push([x, y+1]);
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64Data);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AIPanelSidebar({
  deck,
  cardContent,
  activeFace,
  widthMm = 70,
  heightMm = 120,
  hiddenFields,
  onBackgroundGenerated,
  onAssetGenerated,
  disabled,
}: {
  deck: RawDeckContent;
  cardContent: Record<string, string>;
  activeFace: 'front' | 'back';
  widthMm?: number;
  heightMm?: number;
  hiddenFields?: Record<string, boolean>;
  onBackgroundGenerated: (dataUrl: string, widthMm: number, heightMm: number, face: 'front' | 'back') => void;
  onAssetGenerated: (content: string, type: 'svg' | 'image', face: 'front' | 'back', elementName?: string) => void;
  disabled?: boolean;
}) {
  const face = activeFace;
  const [loading, setLoading] = useState(false);

  // ── Resolve edition for this deck ──────────────────────────────────────────
  const edition = getEditionBySlug(deck.slug ?? deck.id) ?? DECK_EDITIONS.find(e => e.id === 'custom')!;

  // Resolve which fields are currently visible and represent text blocks that might need boxes
  const activeTextFields = edition.fields.filter(
    f => !hiddenFields?.[f.key] && ['when_to_use', 'phrase', 'instruction', 'fun_fact', 'answer'].includes(f.key)
  );

  const initialTheme = deck.metadata
    ? `${deck.name}. ${deck.metadata.topic || ''}. Ambientación: ${deck.metadata.tone || ''}. ${deck.description || ''}`
    : deck.description || '';

  // ── Builder state ──────────────────────────────────────────────────────────
  const [cardType, setCardType] = useState<CardType>(inferCardType(deck.slug ?? deck.id));
  const [builderMetadata, setBuilderMetadata] = useState<Partial<BarajaTemplateMetadata>>({
    themeDescription: initialTheme,
    cardType: inferCardType(deck.slug ?? deck.id),
    primaryColorHex: deck.design_template_overrides?.primary_color || '#d4af64',
  });
  const [customPrompt, setCustomPrompt]           = useState('');
  const [customConstraints, setCustomConstraints] = useState('');
  const [framePalette, setFramePalette]           = useState<'dark' | 'light'>('dark');

  // ── Asset containers ──────────────────────────────────────────────────────────
  const [ornamentLoading, setOrnamentLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);

  // ── Library / gallery ─────────────────────────────────────────────────────
  const [libraryFrames, setLibraryFrames]     = useState<LibraryFrame[]>([]);
  const [loadingLibrary, setLoadingLibrary]   = useState(false);

  useEffect(() => {
    async function fetchLibrary() {
      try {
        setLoadingLibrary(true);
        const res  = await fetch('/__cms__/list-frames-library');
        const data = await res.json() as FramesLibraryResponse;
        if (data.success && data.frames) setLibraryFrames(data.frames);
      } catch (e) {
        console.error('Error fetching library:', e);
      } finally {
        setLoadingLibrary(false);
      }
    }
    fetchLibrary();
  }, []);

  const dims = { widthMm, heightMm };

  // ── Generate Background ────────────────────────────────────────────────────
  async function handleGenerateBackground() {
    setLoading(true);
    try {
      // Only include fields that are NOT hidden so the AI knows what zones to leave room for
      const activeFields = edition.fields
        .filter(f => !hiddenFields?.[f.key])
        .map(f => f.key)
        .filter(k =>
          !['back_image_url', 'back_image_versions', 'qr_url'].includes(k) &&
          typeof cardContent[k] === 'string' &&
          !!cardContent[k]
        );

      const metadata = {
        ...builderMetadata,
        face,
        cardType,
        dynamicFields: activeFields,
      } as BarajaTemplateMetadata;

      const artDirectorPrompt   = buildArtDirectorMetaPrompt(metadata);
      const structuralConstraints = buildStructuralConstraints(metadata);
      const promptToSend        = buildMasterTemplatePrompt(metadata);

      const hasContent = cardContent.when_to_use || cardContent.phrase || cardContent.instruction;

      const res = await fetch('/__cms__/generate-frame', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:               promptToSend,
          artDirectorPrompt,
          structuralConstraints,
          face,
          widthMm:  dims.widthMm,
          heightMm: dims.heightMm,
          cardContent: hasContent
            ? {
                ...cardContent,
                frameDescription: promptToSend.slice(0, 120),
                framePalette:     framePalette === 'light' ? 'light/warm parchment' : 'dark navy or black',
              }
            : undefined,
          edition: {
            id:          edition.id,
            label:       edition.label,
            description: edition.description,
            fields:      edition.fields,          // ← full field schema with descriptions
          },
          hiddenFields: hiddenFields ?? {},           // ← AI ignores disabled zones
          customVisualPrompt:  customPrompt.trim()     ? customPrompt     : undefined,
          customConstraints:   customConstraints.trim() ? customConstraints : undefined,
        }),
      });

      const data = await res.json() as GenerateFrameResponse;
      if (!data.success || !data.dataUrl) throw new Error(data.error || 'Generación falló.');

      onBackgroundGenerated(data.dataUrl, dims.widthMm, dims.heightMm, face);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Generate Specific Field Box ───────────────────────────────────────────
  async function handleGenerateFieldBox(fieldKey: string, fieldLabel: string, type: 'svg' | 'image') {
    const isSvg = type === 'svg';
    const loadingSetter = isSvg ? setOrnamentLoading : setPngLoading;
    loadingSetter(true);
    
    // We use a specialized styling prompt but allow customPrompt to override if the user wants something weird.
    const shapePrompt = customPrompt.trim() 
      ? customPrompt 
      : `Un contenedor o placa ornamental diseñada específicamente para enmarcar este tipo de contenido textual: "${fieldLabel.toUpperCase()}". Su forma debe complementar y abrazar este contenido.`;

    try {
      const endpoint = isSvg ? '/__cms__/generate-ornament-svg' : '/__cms__/generate-ornament-png';
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shapePrompt,
          primaryColorHex: builderMetadata.primaryColorHex || '#d4af64',
        }),
      });
      const data = await res.json() as AssetGenerationResponse;
      if (!data.success) throw new Error(data.error || 'Generación falló.');
      
      let content = isSvg ? data.svg : null;
      if (!isSvg) {
        if (!data.png) throw new Error('La respuesta no incluyó PNG.');
        const base64ImageUrl = `data:image/png;base64,${data.png}`;
        content = await removeWhiteBackground(base64ImageUrl);
      }
      
      // Inject directly using the fieldKey as the element name so it replaces existing instances
      if (!content) throw new Error('La respuesta no incluyó contenido.');
      onAssetGenerated(content, type, face, `box_${fieldKey}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      loadingSetter(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
    padding: '0.6rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.72rem',
    opacity: 0.55,
    display: 'block',
    marginBottom: '0.35rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>

      <div>
        <p style={{ margin: '0 0 0.35rem', color: '#d4af64', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Diseño global del mazo
        </p>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          Fondo para {face === 'front' ? 'frente' : 'dorso'}
        </h2>
        <p style={{ margin: '0.4rem 0 0', opacity: 0.58, fontSize: '0.75rem', lineHeight: 1.45 }}>
          Los cambios de fondo se aplican a todas las cartas del mazo en la cara activa. Usá la navegación para revisar contenido real antes de guardar/exportar.
        </p>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '0.65rem 0.75rem', fontSize: '0.75rem', opacity: 0.82 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span><strong>{deck.name || edition.label}</strong></span>
          <span>{dims.widthMm}×{dims.heightMm}mm</span>
        </div>
        <div style={{ marginTop: '0.35rem', opacity: 0.72 }}>
          {edition.fields.filter(f => !hiddenFields?.[f.key]).length} campos activos
          {hiddenFields && Object.values(hiddenFields).some(Boolean) && (
            <span style={{ marginLeft: '0.4rem', color: '#f59e0b', fontSize: '0.65rem' }}>
              ({Object.values(hiddenFields).filter(Boolean).length} ocultos)
            </span>
          )}
        </div>
      </div>

      {/* ── Temática visual ───────────────────────────────────────────────── */}
      <div>
        <label style={sectionLabel}>Idea visual del fondo</label>
        <textarea
          value={builderMetadata.themeDescription}
          onChange={e => setBuilderMetadata(prev => ({ ...prev, themeDescription: e.target.value }))}
          style={{ ...inputStyle, resize: 'vertical', minHeight: '86px' }}
          placeholder="Ej: comedia romántica, colores vivos, marco festivo, zona central limpia para texto..."
        />
      </div>

      <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.025)' }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600 }}>
          Inspiración rápida
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.7rem' }}>
          {INSPIRATION_CHIPS.map(chip => (
            <button
              key={chip.label}
              onClick={() => setBuilderMetadata(prev => ({
                ...prev,
                themeDescription: prev.themeDescription ? `${prev.themeDescription}, ${chip.label}` : chip.label,
              }))}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.75)', fontSize: '0.62rem', padding: '0.2rem 0.5rem',
                borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem',
              }}
            >
              <span>{chip.icon}</span> {chip.label}
            </button>
          ))}

          <button
            onClick={() => setBuilderMetadata(prev => ({
              ...prev,
              themeDescription: prev.themeDescription
                ? `${prev.themeDescription}, hyper-detailed, elegant, trending on artstation, cinematic lighting`
                : 'hyper-detailed, elegant, trending on artstation, cinematic lighting',
            }))}
            style={{
              background: 'var(--color-gold)', border: 'none', color: '#111',
              fontSize: '0.62rem', padding: '0.2rem 0.5rem', borderRadius: '12px',
              cursor: 'pointer', fontWeight: 'bold',
            }}
            title="Enriquecer prompt visualmente"
          >
            Mejorar
          </button>
        </div>
      </details>

      {/* ── Tipo de carta ─────────────────────────────────────────────────── */}
      <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.025)' }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600 }}>
          Tipo y reglas avanzadas
        </summary>
        <div style={{ marginTop: '0.8rem' }}>
        <label style={sectionLabel}>Tipo de carta</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
          {CARD_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setCardType(t.id);
                setBuilderMetadata(prev => ({ ...prev, cardType: t.id }));
              }}
              title={t.hint}
              style={{
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                border: `1px solid ${cardType === t.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                background: cardType === t.id ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                color: cardType === t.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', fontSize: '0.72rem', textAlign: 'left',
                ...(t.id === 'custom' ? { gridColumn: '1 / -1' } : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        </div>
      </details>

      {/* ── Color principal ───────────────────────────────────────────────── */}
      <div>
        <label style={sectionLabel}>Color Principal</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="color"
            value={builderMetadata.primaryColorHex || '#d4af64'}
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
            onClick={() => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: '#d4af64' }))}
            style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
            title="Reset color"
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── Paleta oscura / clara ──────────────────────────────────────────── */}
      <div>
        <label style={sectionLabel}>Paleta de fondo</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['dark', 'light'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFramePalette(p)}
              style={{
                flex: 1, padding: '0.4rem', borderRadius: '6px',
                border: `1px solid ${framePalette === p ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                background: framePalette === p ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                color: framePalette === p ? 'var(--color-gold)' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer', fontSize: '0.75rem',
              }}
            >
              {p === 'dark' ? '🌑 Oscura' : '☀️ Clara'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Override visual (prompt libre) ────────────────────────────────── */}
      <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.025)' }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600 }}>
          Overrides de prompt
        </summary>
        <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.8rem' }}>
      <div>
        <label style={sectionLabel}>Override Visual (opcional)</label>
        <textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical', minHeight: '40px' }}
          placeholder="Forzar imagen en una esquina, o custom prompt para Cajas..."
        />
      </div>

      {/* ── Override estructural ──────────────────────────────────────────── */}
      <div>
        <label style={sectionLabel}>Override Estructural (opcional)</label>
        <textarea
          value={customConstraints}
          onChange={e => setCustomConstraints(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical', minHeight: '40px' }}
          placeholder="Sin bordes, zona inferior libre para texto largo..."
        />
      </div>
        </div>
      </details>

      {/* ── Generate button ───────────────────────────────────────────────── */}
      <button
        onClick={handleGenerateBackground}
        disabled={loading}
        style={{
          background: loading ? '#444' : 'var(--color-gold)',
          color: '#111', fontWeight: 'bold', padding: '0.8rem', borderRadius: '6px',
          border: 'none', cursor: loading ? 'wait' : 'pointer', marginTop: '0.25rem',
          width: '100%', fontSize: '0.9rem',
        }}
      >
        {loading ? 'Generando fondo...' : `Aplicar fondo al ${face === 'front' ? 'frente' : 'dorso'} de todo el mazo`}
      </button>

      {/* ── CONTENEDORES INTELIGENTES ─────────────────────────────────────── */}
      <details style={{ border: '1px solid rgba(160,142,230,0.16)', borderRadius: '6px', padding: '0.65rem 0.75rem', background: 'rgba(160,142,230,0.04)' }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600 }}>
          Cajas inteligentes
        </summary>
      <div style={{ marginTop: '0.8rem' }}>
        <label style={{ ...sectionLabel, color: '#a08ee6' }}>🧬 Cajas Inteligentes (IA)</label>
        <p style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.6rem', lineHeight: 1.3 }}>
          Genera un contenedor ornamental a medida para cada elemento de texto. Si vuelves a generarlo, reemplazará al anterior.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {activeTextFields.length === 0 && (
            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>No hay textos activos en esta cara.</div>
          )}
          {activeTextFields.map(field => (
            <div key={field.key} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.7rem', marginBottom: '0.4rem', color: 'rgba(255,255,255,0.8)' }}>
                {field.label.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => handleGenerateFieldBox(field.key, field.label, 'svg')}
                  disabled={ornamentLoading || pngLoading}
                  style={{
                    flex: 1, background: ornamentLoading ? '#444' : 'linear-gradient(135deg, #4b3d7a, #322554)',
                    color: 'white', fontWeight: 'bold', padding: '0.4rem', borderRadius: '4px',
                    border: '1px solid #a08ee6', cursor: (ornamentLoading || pngLoading) ? 'wait' : 'pointer',
                    fontSize: '0.7rem',
                  }}
                  title="Generar Vector escalable (estilo Flat 3D)"
                >
                  🖌️ SVG
                </button>
                <button
                  onClick={() => handleGenerateFieldBox(field.key, field.label, 'image')}
                  disabled={ornamentLoading || pngLoading}
                  style={{
                    flex: 1, background: pngLoading ? '#444' : 'linear-gradient(135deg, #115c48, #0b3d2f)',
                    color: 'white', fontWeight: 'bold', padding: '0.4rem', borderRadius: '4px',
                    border: '1px solid #20a07a', cursor: (ornamentLoading || pngLoading) ? 'wait' : 'pointer',
                    fontSize: '0.7rem',
                  }}
                  title="Generar Imagen con textura fotorealista"
                >
                  🎨 PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </details>

      {/* ── GALLERY ──────────────────────────────────────────────────────── */}
      <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.65rem 0.75rem', background: 'rgba(255,255,255,0.025)' }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem', fontWeight: 600 }}>
          Galería de fondos
        </summary>
      <div style={{ marginTop: '0.8rem' }}>
        <label style={sectionLabel}>Historial / Galería</label>
        {loadingLibrary ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando galería...</div>
        ) : libraryFrames.length === 0 ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>No hay fondos en la galería global.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {libraryFrames.map((f, i) => (
              <div
                key={i}
                style={{ position: 'relative', cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => onBackgroundGenerated(f.url, f.widthMm || dims.widthMm, f.heightMm || dims.heightMm, f.face || face)}
                title={f.prompt || 'Imagen de galería'}
              >
                <img src={f.url} alt="Frame" style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', fontSize: '0.6rem', padding: '2px 4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {f.timestamp ? new Date(f.timestamp).toLocaleDateString() : 'Sin fecha'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </details>

    </div>
  );
}
