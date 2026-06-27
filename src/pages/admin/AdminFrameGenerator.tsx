import { useState, useRef } from 'react';
import { setFrameTheme, setFrameTypography, setActiveDeckId } from '../../lib/cardFrame';
import { Link } from 'react-router-dom';
import { buildMasterTemplatePrompt, buildArtDirectorMetaPrompt, buildStructuralConstraints, type BarajaTemplateMetadata, type CardLayout, type CardType, type DeckId } from '@eb-packages/deck-engine';
import { DECK_EDITIONS } from '../../lib/editions';
import { SupabaseDeckRepository } from '../../lib/deckRepository';
import { createDefaultCardTemplate } from '../../lib/pdfmeConfig';
import { useFrameLibrary } from './hooks/useFrameLibrary';
import { useFrameTypographyFonts } from './hooks/useFrameTypographyFonts';
import { FrameGeneratorControls } from './components/frame-generator/FrameGeneratorControls';
import { FrameLayoutPanel } from './components/frame-generator/FrameLayoutPanel';
import { FrameLibraryGallery } from './components/frame-generator/FrameLibraryGallery';
import { FramePreviewPanel } from './components/frame-generator/FramePreviewPanel';
import type { GeneratedFrame, GenerateResponse, LibraryFrame } from './frameGeneratorTypes';
import { isTypoZone } from './frameGeneratorTypes';
import {
  DEFAULT_FRAME_BUILDER_METADATA,
  FRAME_DIMENSION_PRESETS,
  createGeneratedFrameFromResponse,
  findFrameEdition,
  getActiveCardFields,
  getCardContentForFrameGeneration,
  getFrameDeckAutofill,
  getFrameDimensions,
  getFrameDownloadFilename,
  getFramePreviewSize,
  mapLibraryFrameToGeneratedFrame,
} from './utils/frameGeneratorUtils';

export default function AdminFrameGenerator() {
  // Config state
  const [face, setFace] = useState<'front' | 'back'>('back');
  const [cardType, setCardType] = useState<CardType>('party');
  const [layoutPresetId, setLayoutPresetId] = useState<string>('back-standard');
  const [builderMetadata, setBuilderMetadata] = useState<BarajaTemplateMetadata>(DEFAULT_FRAME_BUILDER_METADATA);
  const customPrompt = '';
  const customConstraints = '';
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
  const showCardContext = true;

  const selectedEdition = findFrameEdition(selectedEditionId);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [analyzingTypography, setAnalyzingTypography] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedFrame[]>([]);
  const [activePreview, setActivePreview] = useState<GeneratedFrame | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const frameThemeChoice: 'dark' | 'light' = 'dark';
  const [refinementText, setRefinementText] = useState('');
  const frameLibrary = useFrameLibrary({ onError: setError });

  // Load any suggested fonts dynamically so the preview renders accurately
  useFrameTypographyFonts(activePreview?.typography);

  function handleSelectFromLibrary(libFrame: LibraryFrame) {
    setActivePreview(mapLibraryFrameToGeneratedFrame(libFrame));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const downloadRef = useRef<HTMLAnchorElement>(null);
  const dims = getFrameDimensions(dimPresetIdx, customWidth, customHeight);
  const previewSize = getFramePreviewSize(dims);

  async function handleGenerate(refinementText?: string) {
    const activeFields = getActiveCardFields(cardContent);
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
          cardContent: getCardContentForFrameGeneration({
            cardContent,
            frameThemeChoice,
            promptToSend,
          }),
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

      const frame = createGeneratedFrameFromResponse({
        dataUrl: data.dataUrl,
        face,
        heightMm: dims.heightMm,
        prompt: promptToSend,
        typography: data.typography,
        widthMm: dims.widthMm,
      });

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
    downloadRef.current.href = frame.dataUrl;
    downloadRef.current.download = getFrameDownloadFilename(frame);
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

  function handleSelectDeckEngineDeck(deckId: DeckId) {
    setSelectedDeckId(deckId);
    const autofill = getFrameDeckAutofill(deckId);
    if (!autofill) return;

    setBuilderMetadata(prev => ({
      ...prev,
      ...autofill.deckMetadata,
      primaryColorHex: autofill.deckMetadata.primaryColorHex || prev.primaryColorHex,
    }));

    if (!autofill.edition) return;

    setSelectedEditionId(autofill.edition.id);
    setCardContent(autofill.edition.sampleCard);
    handleCardTypeChange(autofill.inferredType);
  }

  function handleEnhanceThemeDescription() {
    setBuilderMetadata(prev => ({
      ...prev,
      themeDescription: prev.themeDescription
        ? `${prev.themeDescription}, hyper-detailed, elegant, trending on artstation, cinematic lighting, vivid colors`
        : 'hyper-detailed, elegant, trending on artstation, cinematic lighting, vivid colors',
    }));
  }

  function handleAppendThemeInspiration(label: string) {
    setBuilderMetadata(prev => ({
      ...prev,
      themeDescription: prev.themeDescription ? `${prev.themeDescription}, ${label}` : label,
    }));
  }

  function handleCardTypeChange(nextCardType: CardType) {
    setCardType(nextCardType);
    setBuilderMetadata(prev => ({ ...prev, cardType: nextCardType }));
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

        <FrameGeneratorControls
          artDirectorPreview={buildArtDirectorMetaPrompt(builderMetadata)}
          builderMetadata={builderMetadata}
          cardType={cardType}
          customHeight={customHeight}
          customWidth={customWidth}
          dimensionPresets={FRAME_DIMENSION_PRESETS}
          dimPresetIdx={dimPresetIdx}
          face={face}
          structuralPreview={buildStructuralConstraints(builderMetadata)}
          onAppendThemeInspiration={handleAppendThemeInspiration}
          onCardTypeChange={handleCardTypeChange}
          onClearPrimaryColor={() => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: undefined }))}
          onClearThemeDescription={() => setBuilderMetadata(prev => ({ ...prev, themeDescription: '' }))}
          onCustomHeightChange={setCustomHeight}
          onCustomWidthChange={setCustomWidth}
          onDimensionPresetChange={setDimPresetIdx}
          onEnhanceThemeDescription={handleEnhanceThemeDescription}
          onFaceChange={setFace}
          onPrimaryColorChange={(color) => setBuilderMetadata(prev => ({ ...prev, primaryColorHex: color }))}
          onSelectDeck={handleSelectDeckEngineDeck}
          onThemeDescriptionChange={(description) => setBuilderMetadata(prev => ({ ...prev, themeDescription: description }))}
        />

        <FramePreviewPanel
          activePreview={activePreview}
          analyzingTypography={analyzingTypography}
          cardContent={cardContent}
          error={error}
          face={face}
          history={history}
          loading={loading}
          previewHeight={previewSize.height}
          previewWidth={previewSize.width}
          primaryTypographyKey={primaryTypographyKey}
          refinementText={refinementText}
          saveSuccess={saveSuccess}
          savingToLibrary={frameLibrary.saving}
          selectedDeckId={selectedDeckId}
          showCardContext={showCardContext}
          showSafeZone={showSafeZone}
          onAnalyzeTypography={handleAnalyzeTypography}
          onDownload={handleDownload}
          onGenerate={handleGenerate}
          onRefinementTextChange={setRefinementText}
          onSaveToLibrary={frameLibrary.saveToLibrary}
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
        frames={frameLibrary.frames}
        loading={frameLibrary.loading}
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
