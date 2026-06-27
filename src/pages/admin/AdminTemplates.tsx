import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { CardNavigator } from './features/deck-studio/CardNavigator';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { getEditionBySlug } from '../../lib/editions';
import type { Template } from '@pdfme/common';
import {
  calculateTuckBoxDimensions,
  generateTuckBoxSVG,
  generateTuckBoxPdf,
  getEditionColors,
  type TuckBoxParams,
  type TuckBoxContent,
} from '../../lib/TuckBoxEngine';
import { FieldPlacementPanel } from './components/CardFieldInventoryPanel';
import { TuckBoxSidebar } from './components/TuckBoxSidebar';
import { DesignScopePanel } from './components/DesignScopePanel';
import { LayoutToolsPanel } from './components/LayoutToolsPanel';
import { SavedConfigsPanel } from './components/SavedConfigsPanel';
import { DeckGenerationStatusPanel } from './components/DeckGenerationStatusPanel';
import { useSavedDeckConfigs } from './hooks/useSavedDeckConfigs';

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

  const {
    savedConfigs,
    selectedConfigId,
    loadingConfigs,
    savingConfig,
    applyingConfigId,
    handleSelectConfig,
    handleSaveConfig,
    handleApplyConfig,
    handleDeleteConfig,
  } = useSavedDeckConfigs({
    activeDeck: activeRawDeck,
    activeTemplate,
    cardWidth,
    cardHeight,
    hiddenFields,
    getLiveTemplate: syncLiveTemplate,
    onApplyTemplateSnapshot: handleApplyTemplateSnapshot,
    onSelectDeckId: setSelectedDeckId,
  });

  useEffect(() => {
    const deckFromQuery = embeddedDeckId || searchParams.get('deck');
    if (deckFromQuery && deckFromQuery !== selectedDeckId) {
      setSelectedDeckId(deckFromQuery);
    }
    if (searchParams.get('tool') === 'tuckbox') {
      setShowTuckBox(true);
    }
  }, [embeddedDeckId, searchParams, selectedDeckId, setSelectedDeckId]);

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
