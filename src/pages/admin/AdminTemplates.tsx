import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { CardNavigator } from './features/deck-studio/CardNavigator';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { SavedConfigRepository, type SavedConfigRow } from '../../lib/deckRepository';
import { getEditionBySlug } from '../../lib/editions';
import type { FieldPlacementMap } from '../../lib/cardFieldPlacements';
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
import {
  CardFieldInventoryPanel,
  FieldPlacementPanel,
} from './components/CardFieldInventoryPanel';
import {
  getCardFieldInventory,
  type DeckCardLike,
} from './components/cardFieldInventory';
import { TuckBoxSidebar } from './components/TuckBoxSidebar';
import { DesignScopePanel, ScopeMetric } from './components/DesignScopePanel';
import { LayoutToolsPanel } from './components/LayoutToolsPanel';
import { SavedConfigsPanel } from './components/SavedConfigsPanel';

const savedConfigRepo = new SavedConfigRepository();

type TemplateSchema = Template['schemas'][number][number];
type TemplateSchemaWithContent = TemplateSchema & { content?: string };

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
        layout_config: liveTemplate as unknown as Record<string, unknown>,
        hidden_fields: hiddenFields,
        card_width: cardWidth,
        card_height: cardHeight,
        card_unit: 'mm',
      });

      await fetchSavedConfigs(activeRawDeck.slug);
      alert(`Versión "${configName}" guardada correctamente.`);
    } catch (err: unknown) {
      alert('Error guardando config: ' + getErrorMessage(err));
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
    } catch (err: unknown) {
      alert('Error aplicando config: ' + getErrorMessage(err));
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
    } catch (err: unknown) {
      alert('Error eliminando config: ' + getErrorMessage(err));
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
                    const bgIdx = newTemplate.schemas[pageIdx].findIndex((schema) => schema.name === targetNode);
                    if (bgIdx >= 0) {
                      const sm = [...newTemplate.schemas[pageIdx]];
                      const updatedSchema: TemplateSchemaWithContent = { ...sm[bgIdx], content: dataUrl };
                      sm[bgIdx] = updatedSchema;
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
                    const updatedSchema: TemplateSchemaWithContent = { ...arr[existingIdx], content };
                    arr[existingIdx] = updatedSchema;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Error inesperado';
}
