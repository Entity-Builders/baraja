import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { FieldVisibilityMenu } from './features/deck-studio/FieldVisibilityMenu';
import { CardNavigator } from './features/deck-studio/CardNavigator';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { SavedConfigRepository, type SavedConfigRow } from '../../lib/deckRepository';
import { getEditionBySlug } from '../../lib/editions';
import {
  CARD_FIELD_DEFINITIONS,
  type FieldPlacementMap,
} from '../../lib/cardFieldPlacements';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import type { Template } from '@pdfme/common';
import {
  calculateTuckBoxDimensions,
  generateTuckBoxSVG,
  generateTuckBoxPdf,
  getEditionColors,
  type TuckBoxParams,
  type TuckBoxContent,
} from '../../lib/TuckBoxEngine';

const savedConfigRepo = new SavedConfigRepository();

type DeckCardLike = {
  front?: {
    art_url?: string;
    number?: number | string;
    title?: string;
  };
  back?: {
    back_image_url?: string;
    when_to_use?: string;
    phrase?: string;
    instruction?: string;
    answer?: string;
    fun_fact?: string;
    qr_url?: string;
  };
};

type CardFieldStatus = 'visible' | 'hidden' | 'missing' | 'base';

type CardFieldState = {
  label: string;
  status: CardFieldStatus;
  value: string;
};

interface AdminTemplatesProps {
  embeddedDeckId?: string;
}

export default function AdminTemplates({ embeddedDeckId }: AdminTemplatesProps = {}) {
  const [searchParams] = useSearchParams();
  const isEmbeddedStudio = Boolean(embeddedDeckId);
  const {
    decks,
    loading,
    selectedDeckId,
    activeRawDeck,
    activeResolvedDeck,
    activeTemplate,
    mockData,
    setMockData,
    activeCardIndex,
    hiddenFields,
    fieldPlacements,
    analyzing,
    activeFace,
    cardWidth,
    cardHeight,
    setSelectedDeckId,
    setActiveTemplate,
    setActiveFace,
    handleNextCard,
    handlePrevCard,
    handleHiddenFieldsChange,
    handleSaveDeckTemplate,
    handleAutoLayout,
    handleCardSizeChange,
    handleJumpToCard,
    handleApplyTemplateSnapshot,
    handleFieldPlacementsChange,
  } = useDeckStudio();

  const designerRunnerRef = useRef<DeckDesignerRunnerRef>(null);
  const layoutScratchRef = useRef<{
    template: Template;
    cardWidth: number;
    cardHeight: number;
    hiddenFields: Record<string, boolean>;
  } | null>(null);

  const syncLiveTemplate = useCallback(() => {
    const liveTemplate = designerRunnerRef.current?.getLatestCombinedTemplate();
    if (liveTemplate) setActiveTemplate(liveTemplate);
    return liveTemplate || undefined;
  }, [setActiveTemplate]);

  // ── Tuck Box state ─────────────────────────────────────────────
  const [showTuckBox, setShowTuckBox] = useState(false);
  const [showProductionTools, setShowProductionTools] = useState(false);
  const [showAdvancedDesignTools, setShowAdvancedDesignTools] = useState(false);
  const [tuckTolerance, setTuckTolerance] = useState(1);
  const [tuckThickness, setTuckThickness] = useState(0.4);
  const [tuckBleed, setTuckBleed] = useState(3);
  const [isGeneratingTuckPdf, setIsGeneratingTuckPdf] = useState(false);

  // ── Saved Configs state ────────────────────────────────────────
  const [savedConfigs, setSavedConfigs] = useState<SavedConfigRow[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [applyingConfigId, setApplyingConfigId] = useState<string | null>(null);

  useEffect(() => {
    const deckFromQuery = embeddedDeckId || searchParams.get('deck');
    if (deckFromQuery && deckFromQuery !== selectedDeckId) {
      setSelectedDeckId(deckFromQuery);
    }
    if (searchParams.get('tool') === 'tuckbox') {
      setShowTuckBox(true);
    }
  }, [embeddedDeckId, searchParams, selectedDeckId, setSelectedDeckId]);

  // Fetch saved configs when deck changes
  const fetchSavedConfigs = useCallback(async (slug?: string) => {
    if (!slug) { setSavedConfigs([]); return; }
    setLoadingConfigs(true);
    try {
      const configs = await savedConfigRepo.getAll(slug);
      setSavedConfigs(configs);
    } catch (err) {
      console.error('Failed to fetch saved configs:', err);
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    if (activeRawDeck?.slug) {
      fetchSavedConfigs(activeRawDeck.slug);
    } else {
      setSavedConfigs([]);
    }
    setSelectedConfigId('');
  }, [activeRawDeck?.slug, fetchSavedConfigs]);

  // Select a saved config → apply in-memory (instant preview, no DB write)
  const handleSelectConfig = useCallback((configId: string) => {
    setSelectedConfigId(configId);
    if (!configId) {
      const scratch = layoutScratchRef.current;
      if (!scratch) return;
      handleApplyTemplateSnapshot(
        scratch.template,
        scratch.cardWidth,
        scratch.cardHeight,
        scratch.hiddenFields,
      );
      layoutScratchRef.current = null;
      return;
    }

    const config = savedConfigs.find(c => c.id === configId);
    if (!config) return;

    if (!layoutScratchRef.current && activeTemplate) {
      layoutScratchRef.current = {
        template: designerRunnerRef.current?.getLatestCombinedTemplate() || activeTemplate,
        cardWidth,
        cardHeight,
        hiddenFields,
      };
    }

    const nextTemplate = config.layout_config && Object.keys(config.layout_config).length > 0
      ? config.layout_config as Template
      : activeTemplate;

    if (!nextTemplate) return;

    handleApplyTemplateSnapshot(
      nextTemplate,
      config.card_width || cardWidth,
      config.card_height || cardHeight,
      config.hidden_fields || hiddenFields,
    );
  }, [activeTemplate, cardHeight, cardWidth, hiddenFields, savedConfigs, handleApplyTemplateSnapshot]);

  // Save current config
  const handleSaveConfig = useCallback(async () => {
    if (!activeRawDeck || !activeTemplate) return;
    const configName = prompt(
      'Nombre de la versión de diseño:\n(ej: "Barómetro 6×9 Premium", "Poker Night")',
      `${activeRawDeck.name} ${cardWidth}×${cardHeight}`
    );
    if (!configName) return;

    setSavingConfig(true);
    try {
      // Get the live template from the designer runner if available
      const liveTemplate = designerRunnerRef.current?.getLatestCombinedTemplate() || activeTemplate;

      await savedConfigRepo.create({
        name: configName,
        edition_slug: activeRawDeck.slug || null,
        design_template_id: activeRawDeck.design_template_id || null,
        layout_config: liveTemplate as any,
        hidden_fields: hiddenFields,
        card_width: cardWidth,
        card_height: cardHeight,
        card_unit: 'mm',
      });

      await fetchSavedConfigs(activeRawDeck.slug);
      alert(`Versión "${configName}" guardada correctamente.`);
    } catch (err: any) {
      alert('Error guardando config: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  }, [activeRawDeck, activeTemplate, hiddenFields, cardWidth, cardHeight, fetchSavedConfigs]);

  // Apply a saved config
  const handleApplyConfig = useCallback(async (config: SavedConfigRow) => {
    if (!activeRawDeck) return;
    if (!confirm(`¿Aplicar la versión "${config.name}" a ${activeRawDeck.name}?\n\nEsto reemplazará el layout, tamaño y campos ocultos actuales para todo el mazo.`)) return;

    setApplyingConfigId(config.id);
    try {
      await savedConfigRepo.applyToEdition(config.id, activeRawDeck.slug || activeRawDeck.id);
      // Reload the deck to reflect changes
      setSelectedDeckId('');
      setTimeout(() => setSelectedDeckId(activeRawDeck.id), 100);
      alert(`Versión "${config.name}" aplicada al mazo. El editor se recargó.`);
    } catch (err: any) {
      alert('Error aplicando config: ' + err.message);
    } finally {
      setApplyingConfigId(null);
    }
  }, [activeRawDeck, setSelectedDeckId]);

  // Delete a saved config
  const handleDeleteConfig = useCallback(async (config: SavedConfigRow) => {
    if (!confirm(`¿Eliminar la versión "${config.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await savedConfigRepo.delete(config.id);
      setSavedConfigs(prev => prev.filter(c => c.id !== config.id));
    } catch (err: any) {
      alert('Error eliminando config: ' + err.message);
    }
  }, []);

  // ── Tuck Box derived state ──────────────────────────────────────
  const numCards = activeResolvedDeck?.cards?.length || 30;
  const editionConfig = activeRawDeck?.slug ? getEditionBySlug(activeRawDeck.slug) : null;
  const editionId = editionConfig?.id || 'custom';
  const editionLabel = editionConfig?.label || activeRawDeck?.name || 'Custom';
  const editionColors = getEditionColors(editionId);

  const tuckParams: TuckBoxParams = useMemo(() => ({
    cardWidth: cardWidth,
    cardHeight: cardHeight,
    numCards,
    cardThickness: tuckThickness,
    tolerance: tuckTolerance,
    bleed: tuckBleed,
  }), [cardWidth, cardHeight, numCards, tuckThickness, tuckTolerance, tuckBleed]);

  const tuckContent: TuckBoxContent = useMemo(() => ({
    deckName: activeRawDeck?.name || 'Baraja',
    editionLabel,
    description: editionConfig?.description || '',
    numCards,
  }), [activeRawDeck?.name, editionLabel, editionConfig?.description, numCards]);

  const tuckDims = useMemo(() => calculateTuckBoxDimensions(tuckParams), [tuckParams]);

  const tuckSvg = useMemo(() => {
    if (!activeRawDeck || !showTuckBox) return '';
    return generateTuckBoxSVG(tuckParams, editionColors, tuckContent);
  }, [activeRawDeck, showTuckBox, tuckParams, editionColors, tuckContent]);

  const handleDownloadTuckSvg = useCallback(() => {
    if (!tuckSvg || !activeRawDeck) return;
    const blob = new Blob([tuckSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TuckBox_${activeRawDeck.name.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tuckSvg, activeRawDeck]);

  const handleDownloadTuckPdf = useCallback(async () => {
    if (!activeRawDeck) return;
    setIsGeneratingTuckPdf(true);
    try {
      const blob = await generateTuckBoxPdf(tuckParams, editionColors, tuckContent);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TuckBox_${activeRawDeck.name.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Tuck box PDF failed:', err);
      alert('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingTuckPdf(false);
    }
  }, [activeRawDeck, tuckParams, editionColors, tuckContent]);

  if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a10', color: 'white' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

        <div>
          <Link to="/admin" style={{ color: '#d4af64', textDecoration: 'none', fontSize: '0.85rem' }}>← Dashboard</Link>
          <h1 style={{ margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.4rem' }}>
            {activeRawDeck ? `${activeRawDeck.name} · Diseño del mazo` : 'Diseño del mazo'}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>

          {/* Deck Selector */}
          {!isEmbeddedStudio ? (
            <>
              <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Seleccionar mazo:</label>
              <select
                value={selectedDeckId}
                onChange={e => setSelectedDeckId(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--color-gold)',
                  borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="">-- Elige un mazo para editar --</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </>
          ) : (
            <span
              style={{
                border: '1px solid rgba(212,175,100,0.26)',
                background: 'rgba(212,175,100,0.1)',
                color: '#f3d58c',
                borderRadius: '999px',
                padding: '0.4rem 0.65rem',
                fontSize: '0.76rem',
                fontWeight: 700,
              }}
            >
              Alcance: todo el mazo
            </span>
          )}

          {/* Version Selector — instant preview */}
          {activeRawDeck && savedConfigs.length > 0 && (
            <>
              <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
              <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Layout activo:</label>
              <select
                value={selectedConfigId}
                onChange={e => handleSelectConfig(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'white',
                  border: `1px solid ${selectedConfigId ? '#4a90e2' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.85rem',
                  cursor: 'pointer', outline: 'none', maxWidth: '220px',
                }}
              >
                <option value="">Actual del mazo</option>
                {savedConfigs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.card_width}×{c.card_height}mm)
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Save Config Snapshot */}
          {activeRawDeck && activeTemplate && (
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              style={{
                background: 'linear-gradient(135deg, #1e3c72, #2a5298)', border: '1px solid #4a90e2',
                color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                cursor: savingConfig ? 'not-allowed' : 'pointer', fontWeight: 'bold',
                opacity: savingConfig ? 0.6 : 1,
              }}
              title="Guarda la versión completa de diseño. El botón Guardar Layout del canvas aplica el layout actual a todo el mazo."
            >
              {savingConfig ? 'Guardando...' : 'Guardar versión'}
            </button>
          )}

          {/* Production Tools Toggle */}
          {activeRawDeck && (
            <button
              onClick={() => setShowProductionTools(prev => !prev)}
              style={{
                background: showProductionTools ? 'rgba(212,175,100,0.15)' : 'transparent',
                border: `1px solid ${showProductionTools ? '#d4af64' : 'rgba(255,255,255,0.2)'}`,
                color: showProductionTools ? '#d4af64' : 'white',
                padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                cursor: 'pointer', fontWeight: showProductionTools ? 700 : 400,
                transition: 'all 0.2s',
              }}
            >
              Producción
            </button>
          )}

          {activeRawDeck && showProductionTools && (
            <>
              <button
                onClick={() => setShowTuckBox(prev => !prev)}
                style={{
                  background: showTuckBox ? 'rgba(212,175,100,0.15)' : 'transparent',
                  border: `1px solid ${showTuckBox ? '#d4af64' : 'rgba(255,255,255,0.2)'}`,
                  color: showTuckBox ? '#d4af64' : 'white',
                  padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                  cursor: 'pointer', fontWeight: showTuckBox ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >
                Caja
              </button>

              <Link
                to={`/admin/${encodeURIComponent(activeRawDeck.slug || activeRawDeck.id)}?studio=output`}
                style={{
                  background: '#d4af64', color: '#000', padding: '0.5rem 1rem',
                  borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                Publicar / PDF
              </Link>
            </>
          )}

          {/* Card Navigator */}
          {activeResolvedDeck && (
            <CardNavigator
              activeCardIndex={activeCardIndex}
              totalCards={activeResolvedDeck.cards.length}
              onPrev={() => handlePrevCard(syncLiveTemplate())}
              onNext={() => handleNextCard(syncLiveTemplate())}
              onJump={index => handleJumpToCard(index, syncLiveTemplate())}
            />
          )}
        </div>
      </div>

      {activeRawDeck && (
        <div style={{ padding: '0.75rem 2rem 0' }}>
          <AdminDeckWorkspaceNav
            deckId={activeRawDeck.slug || activeRawDeck.id}
            deckName={activeRawDeck.name}
            activeMode="design"
          />
        </div>
      )}

      {/* ── MAIN: Sidebar + Editor ──────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar — contextual based on mode */}
        <div style={{ width: '320px', minWidth: '320px', background: '#111', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', overflowY: 'auto' }}>

          {showTuckBox && activeRawDeck ? (
            /* ── TUCK BOX SIDEBAR ─────────────────────────────────── */
            <TuckBoxSidebar
              dims={tuckDims}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              numCards={numCards}
              editionLabel={editionLabel}
              editionColors={editionColors}
              tolerance={tuckTolerance}
              thickness={tuckThickness}
              bleed={tuckBleed}
              isGeneratingPdf={isGeneratingTuckPdf}
              onToleranceChange={setTuckTolerance}
              onThicknessChange={setTuckThickness}
              onBleedChange={setTuckBleed}
              onDownloadSvg={handleDownloadTuckSvg}
              onDownloadPdf={handleDownloadTuckPdf}
            />
          ) : activeRawDeck && mockData ? (
            /* ── AI PANEL SIDEBAR (existing) ──────────────────────── */
            <>
              <DeckGenerationStatusPanel
                deck={activeRawDeck}
                cards={activeResolvedDeck?.cards ?? []}
                mockData={mockData}
                activeFace={activeFace}
                activeCardIndex={activeCardIndex}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                hiddenFields={hiddenFields}
                fieldPlacements={fieldPlacements}
                configs={savedConfigs}
                selectedConfigId={selectedConfigId}
                loadingConfigs={loadingConfigs}
                savingConfig={savingConfig}
                applyingId={applyingConfigId}
                onSelectConfig={handleSelectConfig}
                onSaveConfig={handleSaveConfig}
                onApplyConfig={handleApplyConfig}
              />

              <FieldPlacementPanel
                placements={fieldPlacements}
                onChange={handleFieldPlacementsChange}
              />

              <DesignScopePanel
                activeFace={activeFace}
                activeCardIndex={activeCardIndex}
                totalCards={activeResolvedDeck?.cards?.length ?? 0}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                showAdvanced={showAdvancedDesignTools}
                onToggleAdvanced={() => setShowAdvancedDesignTools(prev => !prev)}
              />

              {showAdvancedDesignTools && (
                <LayoutToolsPanel
                  hiddenFields={hiddenFields}
                  analyzing={analyzing}
                  onFieldChange={handleHiddenFieldsChange}
                  onAutoLayout={handleAutoLayout}
                />
              )}

              <AIPanelSidebar
                key={activeRawDeck.id}
                deck={activeRawDeck}
                cardContent={{
                  when_to_use: mockData.when_to_use,
                  phrase: mockData.phrase,
                  instruction: mockData.instruction,
                  answer: mockData.answer,
                  fun_fact: mockData.fun_fact,
                }}
                activeFace={activeFace}
                widthMm={cardWidth}
                heightMm={cardHeight}
                hiddenFields={hiddenFields}
                onBackgroundGenerated={async (dataUrl, w, h, face) => {
                  const liveTemplate = designerRunnerRef.current?.getLatestCombinedTemplate() || activeTemplate;
                  if (!liveTemplate) return;
                  const newTemplate = { ...liveTemplate, basePdf: { width: w, height: h, padding: [0, 0, 0, 0] as [number, number, number, number] } };
                  const pageIdx = face === 'front' ? 0 : 1;
                  const targetNode = face === 'front' ? 'art' : 'bg';
                  
                  // Immediately update the mockData so the designer's render cycle doesn't overwrite our new BG with the old cached one
                  setMockData(prev => prev ? { ...prev, [targetNode]: dataUrl } : prev);
                  
                  if (newTemplate.schemas[pageIdx]) {
                    const bgIdx = newTemplate.schemas[pageIdx].findIndex((s: any) => s.name === targetNode);
                    if (bgIdx >= 0) {
                      const sm = [...newTemplate.schemas[pageIdx]];
                      (sm[bgIdx] as any).content = dataUrl;
                      newTemplate.schemas[pageIdx] = sm;
                    }
                  }
                  setActiveTemplate(newTemplate);
                  try {
                    await fetch('/__cms__/set-frame', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dataUrl, face, deckId: activeRawDeck.id }),
                    });
                  } catch (err) {
                    console.error('Error setting frame globally:', err);
                  }
                }}
                onAssetGenerated={async (content, type, face, elementName) => {
                  const liveTemplate = designerRunnerRef.current?.getLatestCombinedTemplate() || activeTemplate;
                  if (!liveTemplate) return;
                  const newTemplate = { ...liveTemplate };
                  const pageIdx = face === 'front' ? 0 : 1;
                  if (!newTemplate.schemas[pageIdx]) return;
                  const arr = [...newTemplate.schemas[pageIdx]];
                  
                  const finalName = elementName || `asset_${Date.now()}`;
                  const existingIdx = arr.findIndex(node => node.name === finalName);

                  if (existingIdx >= 0) {
                    // Update existing
                    const sm = { ...arr[existingIdx] };
                    (sm as any).content = content;
                    arr[existingIdx] = sm as any;
                  } else {
                    // Insert new
                    const bgIndex = arr.findIndex(node => node.name === 'bg' || node.name === 'art');
                    const insertPos = bgIndex >= 0 ? bgIndex + 1 : 0;
                    
                    const defaultW = type === 'image' ? 60 : 50;
                    const defaultH = type === 'image' ? 40 : 30;

                    arr.splice(insertPos, 0, {
                      name: finalName,
                      type: type,
                      position: { x: 10, y: 30 },
                      width: defaultW,
                      height: defaultH,
                      content: content,
                    });
                  }
                  newTemplate.schemas[pageIdx] = arr;
                  setActiveTemplate(newTemplate);
                }}
              />

              {showAdvancedDesignTools && (
                <SavedConfigsPanel
                  configs={savedConfigs}
                  loading={loadingConfigs}
                  applyingId={applyingConfigId}
                  onApply={handleApplyConfig}
                  onDelete={handleDeleteConfig}
                />
              )}
            </>
          ) : (
            <div style={{ opacity: 0.5, fontSize: '0.85rem' }}>Selecciona un mazo para ver las herramientas IA.</div>
          )}
        </div>

        {/* Canvas — switches between pdfme editor and tuck box preview */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {!activeRawDeck || (!showTuckBox && (!activeTemplate || !mockData)) ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>☝️</span>
              <p>Selecciona un mazo arriba para comenzar a editar su diseño.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Verás el fondo (frame) y el contenido exactamente igual que al Imprimir el PDF.</p>
            </div>
          ) : showTuckBox ? (
            /* ── TUCK BOX CANVAS ──────────────────────────────────── */
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', background: '#1a1a1a', overflow: 'auto', padding: '2rem',
            }}>
              <div
                style={{
                  maxWidth: '92%', maxHeight: '92%',
                  filter: 'drop-shadow(0 6px 30px rgba(0,0,0,0.6))',
                  transition: 'all 0.3s ease',
                }}
                dangerouslySetInnerHTML={{ __html: tuckSvg }}
              />
            </div>
          ) : (
            <DeckDesignerRunner
              ref={designerRunnerRef}
              deck={activeRawDeck}
              template={activeTemplate!}
              mockData={mockData!}
              activeFace={activeFace}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              onFaceChange={setActiveFace}
              onCardSizeChange={handleCardSizeChange}
              onSave={handleSaveDeckTemplate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DeckGenerationStatusPanel({
  deck,
  cards,
  mockData,
  activeFace,
  activeCardIndex,
  cardWidth,
  cardHeight,
  hiddenFields,
  fieldPlacements,
  configs,
  selectedConfigId,
  loadingConfigs,
  savingConfig,
  applyingId,
  onSelectConfig,
  onSaveConfig,
  onApplyConfig,
}: {
  deck: RawDeckContent;
  cards: DeckCardLike[];
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  activeCardIndex: number;
  cardWidth: number;
  cardHeight: number;
  hiddenFields: Record<string, boolean>;
  fieldPlacements: FieldPlacementMap;
  configs: SavedConfigRow[];
  selectedConfigId: string;
  loadingConfigs: boolean;
  savingConfig: boolean;
  applyingId: string | null;
  onSelectConfig: (configId: string) => void;
  onSaveConfig: () => void;
  onApplyConfig: (config: SavedConfigRow) => void;
}) {
  const totalCards = cards.length;
  const frontArtCount = cards.filter(card => Boolean(card.front?.art_url)).length;
  const aiBackCount = cards.filter(card => Boolean(card.back?.back_image_url)).length;
  const hiddenCount = Object.values(hiddenFields).filter(Boolean).length;
  const selectedConfig = configs.find(config => config.id === selectedConfigId);
  const sampleCard = cards[activeCardIndex];
  const hasDeckLayout = Boolean(deck.design_template_overrides?.layout_config);
  const currentLayoutLabel = selectedConfig?.name || (hasDeckLayout ? 'Layout aplicado' : 'Layout base');

  const fieldInventory = getCardFieldInventory({
    deckName: deck.name,
    card: sampleCard,
    mockData,
    hiddenFields,
    fieldPlacements,
  });

  const shownConfigs = configs.slice(0, 3);

  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '0.9rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.85rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.22rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Datos del mazo activo
        </p>
        <h2 style={{ margin: 0, color: 'white', fontSize: '0.94rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deck.name}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
        <GenerationMetric label="Arte" count={frontArtCount} total={totalCards} tone="#35d07f" />
        <GenerationMetric label="Reversos IA" count={aiBackCount} total={totalCards} tone="#a78bfa" />
        <ScopeMetric label="Versiones" value={loadingConfigs ? '...' : String(configs.length)} />
        <ScopeMetric label="Ocultos" value={String(hiddenCount)} />
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '7px',
          padding: '0.7rem',
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <DataRow label="Layout" value={currentLayoutLabel} strong={Boolean(selectedConfig)} />
          <DataRow label="Muestra" value={`${activeCardIndex + 1}/${Math.max(totalCards, 1)} · ${activeFace === 'front' ? 'Frente' : 'Dorso'}`} />
          <DataRow label="Tamaño" value={`${cardWidth}×${cardHeight}mm`} />
        </div>
      </div>

      <CardFieldInventoryPanel
        activeFace={activeFace}
        frontFields={fieldInventory.front}
        backFields={fieldInventory.back}
      />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Layouts guardados
          </div>
          <button
            type="button"
            onClick={onSaveConfig}
            disabled={savingConfig}
            style={{
              background: 'rgba(74,144,226,0.14)',
              border: '1px solid rgba(74,144,226,0.38)',
              color: '#9cc6ff',
              borderRadius: '6px',
              padding: '0.32rem 0.48rem',
              cursor: savingConfig ? 'not-allowed' : 'pointer',
              fontSize: '0.68rem',
              fontWeight: 700,
              opacity: savingConfig ? 0.55 : 1,
            }}
          >
            {savingConfig ? 'Guardando' : 'Guardar'}
          </button>
        </div>

        {loadingConfigs ? (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.76rem' }}>Cargando versiones...</div>
        ) : configs.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.11)',
              borderRadius: '7px',
              padding: '0.7rem',
              color: 'rgba(255,255,255,0.44)',
              fontSize: '0.74rem',
              lineHeight: 1.45,
            }}
          >
            Todavía no hay layouts guardados para comparar.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => onSelectConfig('')}
              style={{
                textAlign: 'left',
                background: !selectedConfigId ? 'rgba(212,175,100,0.11)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${!selectedConfigId ? 'rgba(212,175,100,0.34)' : 'rgba(255,255,255,0.08)'}`,
                color: !selectedConfigId ? '#f3d58c' : 'rgba(255,255,255,0.64)',
                borderRadius: '7px',
                padding: '0.55rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 700,
              }}
            >
              Actual del mazo
            </button>

            {shownConfigs.map(config => {
              const isSelected = selectedConfigId === config.id;
              const isApplying = applyingId === config.id;
              const hiddenInConfig = Object.values(config.hidden_fields || {}).filter(Boolean).length;
              const dateLabel = formatSavedConfigDate(config.updated_at || config.created_at);

              return (
                <div
                  key={config.id}
                  style={{
                    border: `1px solid ${isSelected ? 'rgba(74,144,226,0.48)' : 'rgba(255,255,255,0.08)'}`,
                    background: isSelected ? 'rgba(74,144,226,0.12)' : 'rgba(255,255,255,0.025)',
                    borderRadius: '7px',
                    padding: '0.6rem',
                    display: 'grid',
                    gap: '0.48rem',
                  }}
                >
                  <div>
                    <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {config.name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.67rem', marginTop: '0.15rem' }}>
                      {config.card_width}×{config.card_height}mm · {hiddenInConfig} ocultos · {dateLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => onSelectConfig(config.id)}
                      style={{
                        flex: 1,
                        background: isSelected ? 'rgba(74,144,226,0.22)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isSelected ? 'rgba(74,144,226,0.5)' : 'rgba(255,255,255,0.11)'}`,
                        color: isSelected ? '#9cc6ff' : 'rgba(255,255,255,0.7)',
                        borderRadius: '5px',
                        padding: '0.35rem',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      {isSelected ? 'En vista' : 'Previsualizar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyConfig(config)}
                      disabled={isApplying}
                      style={{
                        flex: 1,
                        background: 'rgba(212,175,100,0.1)',
                        border: '1px solid rgba(212,175,100,0.32)',
                        color: '#d4af64',
                        borderRadius: '5px',
                        padding: '0.35rem',
                        cursor: isApplying ? 'not-allowed' : 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        opacity: isApplying ? 0.5 : 1,
                      }}
                    >
                      {isApplying ? 'Aplicando' : 'Aplicar'}
                    </button>
                  </div>
                </div>
              );
            })}

            {configs.length > shownConfigs.length && (
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.68rem', textAlign: 'center' }}>
                {configs.length - shownConfigs.length} más en herramientas avanzadas
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function getCardFieldInventory({
  deckName,
  card,
  mockData,
  hiddenFields,
  fieldPlacements,
}: {
  deckName: string;
  card?: DeckCardLike;
  mockData: Record<string, string>;
  hiddenFields: Record<string, boolean>;
  fieldPlacements: FieldPlacementMap;
}): { front: CardFieldState[]; back: CardFieldState[] } {
  const frontNumber = card?.front?.number == null ? '' : `#${String(card.front.number).padStart(2, '0')}`;
  const frontTitle = card?.front?.title || mockData.title || '';
  const frontArt = card?.front?.art_url || mockData.art || '';
  const front: CardFieldState[] = [
    buildFieldState('Arte', frontArt, false, frontArt ? 'Imagen generada' : ''),
  ];
  const back: CardFieldState[] = [
    buildFieldState('Fondo', mockData.bg, false, mockData.bg ? 'Frame base' : '', mockData.bg ? 'base' : undefined),
    buildFieldState('Reverso IA', card?.back?.back_image_url || mockData.back_ai_image || '', false, card?.back?.back_image_url ? 'Imagen generada' : ''),
  ];

  CARD_FIELD_DEFINITIONS.forEach(field => {
    const value = getInventoryFieldValue(field.key, {
      card,
      deckName,
      frontNumber,
      frontTitle,
      mockData,
    });
    const hidden = fieldPlacements[field.key] === 'hidden'
      || hiddenFields[field.key]
      || (field.key === 'when_to_use' && hiddenFields.whenToUse);
    const preview = field.key === 'qr' && value ? 'Generado' : undefined;
    const state = buildFieldState(field.label, value, hidden, preview);
    const target = fieldPlacements[field.key] === 'front'
      ? front
      : back;
    target.push(state);
  });

  return { front, back };
}

function getInventoryFieldValue(
  key: (typeof CARD_FIELD_DEFINITIONS)[number]['key'],
  context: {
    card?: DeckCardLike;
    deckName: string;
    frontNumber: string;
    frontTitle: string;
    mockData: Record<string, string>;
  },
): string {
  const { card, deckName, frontNumber, frontTitle, mockData } = context;

  switch (key) {
    case 'number':
      return frontNumber || mockData.number || '';
    case 'title':
      return frontTitle || mockData.title || '';
    case 'when_to_use':
      return card?.back?.when_to_use || mockData.when_to_use || mockData.whenToUse || '';
    case 'phrase':
      return card?.back?.phrase || mockData.phrase || '';
    case 'instruction':
      return card?.back?.instruction || mockData.instruction || '';
    case 'answer':
      return card?.back?.answer || mockData.answer || '';
    case 'fun_fact':
      return card?.back?.fun_fact || mockData.fun_fact || '';
    case 'qr':
      return card?.back?.qr_url || mockData.qr || mockData.qr_overlay || '';
    case 'brand':
      return mockData.brand || `Baraja · ${deckName}`;
  }
}

function buildFieldState(
  label: string,
  rawValue: string | undefined,
  hidden = false,
  previewOverride?: string,
  forcedStatus?: CardFieldStatus,
): CardFieldState {
  const value = cleanFieldPreview(previewOverride ?? rawValue ?? '');
  const hasValue = Boolean(cleanFieldPreview(rawValue ?? ''));

  if (forcedStatus) {
    return { label, status: forcedStatus, value: value || statusCopy[forcedStatus] };
  }

  if (hidden) {
    return { label, status: 'hidden', value: hasValue ? value : 'Sin contenido cargado' };
  }

  if (!hasValue) {
    return { label, status: 'missing', value: 'Sin contenido' };
  }

  return { label, status: 'visible', value };
}

function cleanFieldPreview(value: string): string {
  return value
    .replace(/^Rta:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
}

const statusCopy: Record<CardFieldStatus, string> = {
  visible: 'Visible',
  hidden: 'Oculto',
  missing: 'Falta',
  base: 'Base',
};

const statusTone: Record<CardFieldStatus, { border: string; background: string; color: string }> = {
  visible: { border: 'rgba(53,208,127,0.34)', background: 'rgba(53,208,127,0.09)', color: '#7ee3aa' },
  hidden: { border: 'rgba(255,255,255,0.13)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)' },
  missing: { border: 'rgba(248,113,113,0.34)', background: 'rgba(248,113,113,0.09)', color: '#fca5a5' },
  base: { border: 'rgba(212,175,100,0.34)', background: 'rgba(212,175,100,0.09)', color: '#f3d58c' },
};

function CardFieldInventoryPanel({
  activeFace,
  frontFields,
  backFields,
}: {
  activeFace: 'front' | 'back';
  frontFields: CardFieldState[];
  backFields: CardFieldState[];
}) {
  const frontCounts = getFieldCounts(frontFields);
  const backCounts = getFieldCounts(backFields);

  return (
    <div>
      <div style={{ marginBottom: '0.45rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Campos de la carta actual
      </div>
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <CardFaceFieldGroup
          label="Frente"
          active={activeFace === 'front'}
          fields={frontFields}
          counts={frontCounts}
        />
        <CardFaceFieldGroup
          label="Dorso"
          active={activeFace === 'back'}
          fields={backFields}
          counts={backCounts}
        />
      </div>
    </div>
  );
}

const placementLabel: Record<'front' | 'back' | 'hidden', string> = {
  front: 'Frente',
  back: 'Dorso',
  hidden: 'Oculto',
};

const placementTone: Record<'front' | 'back' | 'hidden', { border: string; bg: string; color: string }> = {
  front: { border: 'rgba(53,208,127,0.34)', bg: 'rgba(53,208,127,0.1)', color: '#86efac' },
  back: { border: 'rgba(212,175,100,0.34)', bg: 'rgba(212,175,100,0.1)', color: '#f3d58c' },
  hidden: { border: 'rgba(255,255,255,0.14)', bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)' },
};

function FieldPlacementPanel({
  placements,
  onChange,
}: {
  placements: FieldPlacementMap;
  onChange: (placements: FieldPlacementMap) => void;
}) {
  const counts = {
    front: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'front').length,
    back: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'back').length,
    hidden: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'hidden').length,
  };

  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.7rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.24rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Campos y caras
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '0.73rem', lineHeight: 1.45 }}>
          Mové qué información vive en frente, dorso u oculto. Después ajustá posición en el canvas y guardá el layout.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
        {(['front', 'back', 'hidden'] as const).map(placement => {
          const tone = placementTone[placement];
          return (
            <div
              key={placement}
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                borderRadius: '7px',
                padding: '0.45rem 0.25rem',
                textAlign: 'center',
              }}
            >
              <div style={{ color: tone.color, fontSize: '0.68rem', fontWeight: 800 }}>
                {placementLabel[placement]}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.8rem', fontWeight: 850 }}>
                {counts[placement]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {CARD_FIELD_DEFINITIONS.map(field => (
          <div
            key={field.key}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.16)',
              borderRadius: '7px',
              padding: '0.55rem',
              display: 'grid',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.76rem', fontWeight: 800 }}>
                {field.label}
              </span>
              <span style={{ color: placementTone[placements[field.key]].color, fontSize: '0.66rem', fontWeight: 800 }}>
                {placementLabel[placements[field.key]]}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.3rem' }}>
              {(['front', 'back', 'hidden'] as const).map(placement => {
                const active = placements[field.key] === placement;
                const tone = placementTone[placement];
                return (
                  <button
                    key={placement}
                    type="button"
                    onClick={() => onChange({ ...placements, [field.key]: placement })}
                    style={{
                      minHeight: '30px',
                      border: `1px solid ${active ? tone.border : 'rgba(255,255,255,0.09)'}`,
                      background: active ? tone.bg : 'rgba(255,255,255,0.025)',
                      color: active ? tone.color : 'rgba(255,255,255,0.5)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                    }}
                  >
                    {placementLabel[placement]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function getFieldCounts(fields: CardFieldState[]) {
  return {
    visible: fields.filter(field => field.status === 'visible' || field.status === 'base').length,
    hidden: fields.filter(field => field.status === 'hidden').length,
    missing: fields.filter(field => field.status === 'missing').length,
  };
}

function CardFaceFieldGroup({
  label,
  active,
  fields,
  counts,
}: {
  label: string;
  active: boolean;
  fields: CardFieldState[];
  counts: { visible: number; hidden: number; missing: number };
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? 'rgba(212,175,100,0.32)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(212,175,100,0.06)' : 'rgba(0,0,0,0.16)',
        borderRadius: '7px',
        padding: '0.62rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.46rem' }}>
        <span style={{ color: active ? '#f3d58c' : 'rgba(255,255,255,0.72)', fontSize: '0.74rem', fontWeight: 800 }}>
          {label}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.66rem' }}>
          {counts.visible} ok · {counts.hidden} ocultos · {counts.missing} falta
        </span>
      </div>

      <div style={{ display: 'grid', gap: '0.34rem' }}>
        {fields.map(field => (
          <CardFieldRow key={`${label}-${field.label}`} field={field} />
        ))}
      </div>
    </div>
  );
}

function CardFieldRow({ field }: { field: CardFieldState }) {
  const tone = statusTone[field.status];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '5.3rem 3.4rem 1fr',
        gap: '0.38rem',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {field.label}
      </span>
      <span
        style={{
          border: `1px solid ${tone.border}`,
          background: tone.background,
          color: tone.color,
          borderRadius: '999px',
          padding: '0.16rem 0.34rem',
          fontSize: '0.58rem',
          lineHeight: 1,
          textAlign: 'center',
          fontWeight: 800,
          textTransform: 'uppercase',
        }}
      >
        {statusCopy[field.status]}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {field.value}
      </span>
    </div>
  );
}

function GenerationMetric({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding: '0.55rem',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'baseline' }}>
        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ color: tone, fontSize: '0.68rem', fontWeight: 800 }}>{percent}%</span>
      </div>
      <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 750, marginTop: '0.18rem' }}>
        {count}/{total}
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.42rem' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: tone, borderRadius: '999px' }} />
      </div>
    </div>
  );
}

function DataRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '4.4rem 1fr', gap: '0.5rem', alignItems: 'baseline' }}>
      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ color: strong ? '#9cc6ff' : 'rgba(255,255,255,0.78)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.76rem', fontWeight: strong ? 800 : 650 }}>
        {value}
      </span>
    </div>
  );
}

function formatSavedConfigDate(value: string): string {
  if (!value) return 'sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sin fecha';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
}

function DesignScopePanel({
  activeFace,
  activeCardIndex,
  totalCards,
  cardWidth,
  cardHeight,
  showAdvanced,
  onToggleAdvanced,
}: {
  activeFace: 'front' | 'back';
  activeCardIndex: number;
  totalCards: number;
  cardWidth: number;
  cardHeight: number;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}) {
  return (
    <section
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,100,0.12), rgba(255,255,255,0.035))',
        border: '1px solid rgba(212,175,100,0.24)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.25rem', color: '#f3d58c', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Cambios globales
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.68)', fontSize: '0.76rem', lineHeight: 1.45 }}>
          Lo que ajustes acá se aplica como diseño base del mazo. La carta visible es una muestra para revisar el resultado con contenido real.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
        <ScopeMetric label="Cara activa" value={activeFace === 'front' ? 'Frente' : 'Dorso'} />
        <ScopeMetric label="Carta muestra" value={totalCards > 0 ? `${activeCardIndex + 1}/${totalCards}` : '--'} />
        <ScopeMetric label="Tamaño" value={`${cardWidth}×${cardHeight}mm`} />
        <ScopeMetric label="Alcance" value="Todo el mazo" />
      </div>

      <button
        type="button"
        onClick={onToggleAdvanced}
        style={{
          width: '100%',
          background: showAdvanced ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.14)',
          color: showAdvanced ? 'white' : 'rgba(255,255,255,0.72)',
          borderRadius: '6px',
          padding: '0.5rem 0.7rem',
          cursor: 'pointer',
          fontSize: '0.78rem',
          fontWeight: 650,
        }}
      >
        {showAdvanced ? 'Ocultar herramientas avanzadas' : 'Mostrar herramientas avanzadas'}
      </button>
    </section>
  );
}

function ScopeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding: '0.55rem',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>
        {value}
      </div>
    </div>
  );
}

function LayoutToolsPanel({
  hiddenFields,
  analyzing,
  onFieldChange,
  onAutoLayout,
}: {
  hiddenFields: Record<string, boolean>;
  analyzing: boolean;
  onFieldChange: (newFields: Record<string, boolean>) => void;
  onAutoLayout: () => void;
}) {
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.25rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Layout global
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.74rem', lineHeight: 1.45 }}>
          Ajustá campos, guías y distribución general. Estos cambios afectan la plantilla del mazo, no una carta suelta.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <FieldVisibilityMenu
          hiddenFields={hiddenFields}
          onFieldChange={onFieldChange}
        />

        <button
          onClick={onAutoLayout}
          disabled={analyzing}
          style={{
            width: '100%',
            background: analyzing ? '#444' : 'linear-gradient(135deg, #2a2a2a, #111)',
            border: '1px solid rgba(255,255,255,0.18)',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            color: 'white',
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 650,
          }}
        >
          {analyzing ? 'Analizando layout...' : 'Sugerir auto-layout'}
        </button>
      </div>
    </section>
  );
}

// ── Saved Configs Panel Component ──────────────────────────────────

function SavedConfigsPanel({
  configs,
  loading,
  applyingId,
  onApply,
  onDelete,
}: {
  configs: SavedConfigRow[];
  loading: boolean;
  applyingId: string | null;
  onApply: (config: SavedConfigRow) => void;
  onDelete: (config: SavedConfigRow) => void;
}) {
  if (loading) {
    return (
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando versiones de diseño...</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.6rem',
      }}>
        <h3 style={{
          margin: 0, fontSize: '0.8rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)',
        }}>
          Versiones de diseño
        </h3>
        <span style={{
          fontSize: '0.7rem', background: 'rgba(212,175,100,0.15)',
          color: '#d4af64', padding: '2px 8px', borderRadius: '10px',
        }}>
          {configs.length}
        </span>
      </div>

      {configs.length === 0 ? (
        <div style={{
          padding: '1rem', background: 'rgba(255,255,255,0.02)',
          borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.08)',
          textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)',
        }}>
          No hay versiones guardadas aún.
          <br />
          <span style={{ fontSize: '0.7rem' }}>Usá "Guardar versión" arriba para crear una.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {configs.map(config => {
            const isApplying = applyingId === config.id;
            const isGlobal = !config.edition_slug;
            const dateStr = new Date(config.created_at).toLocaleDateString('es-AR', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            });

            return (
              <div
                key={config.id}
                style={{
                  padding: '0.7rem 0.8rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,100,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
              >
                {/* Config Name + Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{config.name}</span>
                  {isGlobal && (
                    <span style={{
                      fontSize: '0.6rem', background: 'rgba(139,190,238,0.15)',
                      color: '#8be', padding: '1px 6px', borderRadius: '8px',
                    }}>
                      Global
                    </span>
                  )}
                </div>

                {/* Meta info */}
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem' }}>
                  {config.card_width}×{config.card_height}mm • {dateStr}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={() => onApply(config)}
                    disabled={isApplying}
                    style={{
                      flex: 1, padding: '0.35rem', fontSize: '0.75rem',
                      background: isApplying ? '#333' : 'rgba(212,175,100,0.1)',
                      border: '1px solid rgba(212,175,100,0.3)',
                      color: '#d4af64', borderRadius: '4px',
                      cursor: isApplying ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {isApplying ? '⏳...' : '▶ Aplicar'}
                  </button>
                  <button
                    onClick={() => onDelete(config)}
                    style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.75rem',
                      background: 'transparent',
                      border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tuck Box Sidebar Component ─────────────────────────────────────

import type { TuckBoxDimensions, TuckBoxColors as TBColors } from '../../lib/TuckBoxEngine';

function TuckBoxSidebar({
  dims, cardWidth, cardHeight, numCards,
  editionLabel, editionColors,
  tolerance, thickness, bleed,
  isGeneratingPdf,
  onToleranceChange, onThicknessChange, onBleedChange,
  onDownloadSvg, onDownloadPdf,
}: {
  dims: TuckBoxDimensions;
  cardWidth: number;
  cardHeight: number;
  numCards: number;
  editionLabel: string;
  editionColors: TBColors;
  tolerance: number;
  thickness: number;
  bleed: number;
  isGeneratingPdf: boolean;
  onToleranceChange: (v: number) => void;
  onThicknessChange: (v: number) => void;
  onBleedChange: (v: number) => void;
  onDownloadSvg: () => void;
  onDownloadPdf: () => void;
}) {
  return (
    <>
      {/* ── Header ────────────────────────────────────────────────── */}
      <h3 style={{
        margin: '0 0 1rem', fontSize: '0.8rem', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: '#d4af64',
      }}>
        Caja
      </h3>

      {/* ── Dimensions Info ───────────────────────────────────────── */}
      <div style={{
        padding: '0.8rem', background: 'rgba(212,175,100,0.06)',
        borderRadius: '8px', borderLeft: '3px solid #d4af64',
        marginBottom: '1.2rem',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
          fontSize: '0.75rem',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Carta</div>
            <div style={{ color: '#d4af64', fontWeight: 700, fontSize: '0.9rem' }}>{cardWidth}×{cardHeight}<span style={{ fontSize: '0.6rem', opacity: 0.7 }}> mm</span></div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cartas</div>
            <div style={{ color: '#d4af64', fontWeight: 700, fontSize: '0.9rem' }}>{numCards}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Caja (W×H)</div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{dims.boxW.toFixed(1)}×{dims.boxH.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Profundidad</div>
            <div style={{ color: '#e88', fontWeight: 700, fontSize: '0.85rem' }}>{dims.boxD.toFixed(1)}<span style={{ fontSize: '0.6rem', opacity: 0.7 }}> mm</span></div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Edición</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: editionColors.primary }} />
              <span style={{ color: editionColors.secondary, fontWeight: 600, fontSize: '0.85rem' }}>{editionLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Parameters ────────────────────────────────────────────── */}
      <h4 style={{
        margin: '0 0 0.8rem', fontSize: '0.7rem', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)',
      }}>
        ⚙️ Parámetros
      </h4>

      <SliderControl label="Tolerancia" value={tolerance} min={0.5} max={3} step={0.5} unit="mm" onChange={onToleranceChange} hint="Holgura entre carta y caja" />
      <SliderControl label="Grosor / carta" value={thickness} min={0.2} max={0.8} step={0.05} unit="mm" onChange={onThicknessChange} hint="300g ≈ 0.4mm, plastificado ≈ 0.5mm" />
      <SliderControl label="Sangría" value={bleed} min={0} max={5} step={1} unit="mm" onChange={onBleedChange} hint="Margen de sangría para corte" />

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <h4 style={{
          margin: '0 0 0.5rem', fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: 'rgba(255,255,255,0.35)',
        }}>
          Leyenda
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '22px', height: '0px', borderTop: '1.5px solid #222' }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Línea de corte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '22px', height: '0px', borderTop: '1.5px dashed #888' }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Línea de plegado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '13px', height: '13px', background: editionColors.primary, borderRadius: '2px', opacity: 0.15 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Solapa de pegado</span>
          </div>
        </div>
      </div>

      {/* ── Instructions ──────────────────────────────────────────── */}
      <div style={{
        padding: '0.8rem', background: 'rgba(255,255,255,0.02)',
        borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.72rem', lineHeight: '1.7', marginBottom: '1.5rem',
      }}>
        <h4 style={{
          margin: '0 0 0.4rem', color: 'rgba(255,255,255,0.5)',
          fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          📌 Instrucciones
        </h4>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>
          <div>1. Descargá el PDF del troquel</div>
          <div>2. Imprimí en cartulina 250-300g</div>
          <div>3. Cortá las <strong>líneas sólidas</strong></div>
          <div>4. Plegá las <strong>líneas punteadas</strong></div>
          <div>5. Pegá las solapas con adhesivo</div>
        </div>
      </div>

      {/* ── Download Buttons ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={onDownloadPdf}
          disabled={isGeneratingPdf}
          style={{
            width: '100%', background: '#d4af64', color: '#000',
            padding: '0.7rem 1rem', borderRadius: '6px', border: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: isGeneratingPdf ? 'not-allowed' : 'pointer',
            opacity: isGeneratingPdf ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          {isGeneratingPdf ? '⏳ Generando PDF...' : '📥 Descargar PDF'}
        </button>
        <button
          onClick={onDownloadSvg}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)',
            padding: '0.5rem 1rem', borderRadius: '6px',
            fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          📐 Descargar SVG
        </button>
      </div>
    </>
  );
}

function SliderControl({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>{label}</label>
        <span style={{
          fontSize: '0.75rem', color: '#d4af64', fontWeight: 700,
          background: 'rgba(212,175,100,0.1)', padding: '1px 6px', borderRadius: '4px',
        }}>
          {value}{unit && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}> {unit}</span>}
        </span>
      </div>
      <input
        type="range" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#d4af64', cursor: 'pointer' }}
      />
      {hint && (
        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.1rem' }}>{hint}</div>
      )}
    </div>
  );
}
