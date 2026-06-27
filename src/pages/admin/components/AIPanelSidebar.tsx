import { useState, useEffect } from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import {
  buildMasterTemplatePrompt,
  buildArtDirectorMetaPrompt,
  buildStructuralConstraints,
  type BarajaTemplateMetadata,
  type CardType,
} from '@eb-packages/deck-engine';
import { DECK_EDITIONS, getEditionBySlug } from '../../../lib/editions';
import { AIPanelFrameGallery } from './ai-panel/AIPanelFrameGallery';
import { AIPanelHeader } from './ai-panel/AIPanelHeader';
import { AIPanelPromptControls } from './ai-panel/AIPanelPromptControls';
import { AIPanelSmartBoxes } from './ai-panel/AIPanelSmartBoxes';
import { inferCardType } from './ai-panel/aiPanelConfig';
import { removeWhiteBackground } from './ai-panel/aiPanelImageUtils';
import type { AssetGenerationResponse, FramesLibraryResponse, GenerateFrameResponse, LibraryFrame } from './ai-panel/aiPanelTypes';

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

  const hiddenFieldCount = hiddenFields ? Object.values(hiddenFields).filter(Boolean).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>

      <AIPanelHeader
        activeFieldCount={edition.fields.filter(f => !hiddenFields?.[f.key]).length}
        deckName={deck.name}
        editionLabel={edition.label}
        face={face}
        heightMm={dims.heightMm}
        hiddenFieldCount={hiddenFieldCount}
        widthMm={dims.widthMm}
      />

      <AIPanelPromptControls
        builderMetadata={builderMetadata}
        cardType={cardType}
        customConstraints={customConstraints}
        customPrompt={customPrompt}
        framePalette={framePalette}
        onAppendThemeInspiration={(label) => setBuilderMetadata(prev => ({
          ...prev,
          themeDescription: prev.themeDescription ? `${prev.themeDescription}, ${label}` : label,
        }))}
        onCardTypeChange={(nextCardType) => {
          setCardType(nextCardType);
          setBuilderMetadata(prev => ({ ...prev, cardType: nextCardType }));
        }}
        onCustomConstraintsChange={setCustomConstraints}
        onCustomPromptChange={setCustomPrompt}
        onEnhanceTheme={() => setBuilderMetadata(prev => ({
          ...prev,
          themeDescription: prev.themeDescription
            ? `${prev.themeDescription}, hyper-detailed, elegant, trending on artstation, cinematic lighting`
            : 'hyper-detailed, elegant, trending on artstation, cinematic lighting',
        }))}
        onFramePaletteChange={setFramePalette}
        onPrimaryColorChange={(primaryColorHex) => setBuilderMetadata(prev => ({ ...prev, primaryColorHex }))}
        onResetPrimaryColor={() => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: '#d4af64' }))}
        onThemeDescriptionChange={(themeDescription) => setBuilderMetadata(prev => ({ ...prev, themeDescription }))}
      />

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

      <AIPanelSmartBoxes
        activeTextFields={activeTextFields}
        ornamentLoading={ornamentLoading}
        pngLoading={pngLoading}
        onGenerateFieldBox={handleGenerateFieldBox}
      />

      <AIPanelFrameGallery
        face={face}
        frames={libraryFrames}
        heightMm={dims.heightMm}
        loading={loadingLibrary}
        widthMm={dims.widthMm}
        onSelectFrame={onBackgroundGenerated}
      />

    </div>
  );
}
