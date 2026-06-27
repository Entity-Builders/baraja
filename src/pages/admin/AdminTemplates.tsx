import { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { FieldPlacementPanel } from './components/CardFieldInventoryPanel';
import { TuckBoxSidebar } from './components/TuckBoxSidebar';
import { DesignScopePanel } from './components/DesignScopePanel';
import { LayoutToolsPanel } from './components/LayoutToolsPanel';
import { SavedConfigsPanel } from './components/SavedConfigsPanel';
import { DeckGenerationStatusPanel } from './components/DeckGenerationStatusPanel';
import { AdminTemplatesHeader } from './components/AdminTemplatesHeader';
import { useSavedDeckConfigs } from './hooks/useSavedDeckConfigs';
import { useTuckBoxPreview } from './hooks/useTuckBoxPreview';
import { useTemplateAssetGeneration } from './hooks/useTemplateAssetGeneration';

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

  const shouldOpenTuckBox = searchParams.get('tool') === 'tuckbox';

  // ── Tuck Box state ─────────────────────────────────────────────
  const [showTuckBox, setShowTuckBox] = useState(() => shouldOpenTuckBox);
  const [showProductionTools, setShowProductionTools] = useState(false);
  const [showAdvancedDesignTools, setShowAdvancedDesignTools] = useState(false);
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
  }, [embeddedDeckId, searchParams, selectedDeckId, setSelectedDeckId]);

  const numCards = activeResolvedDeck?.cards?.length || 30;
  const {
    tuckDims,
    tuckSvg,
    editionLabel,
    editionColors,
    tuckTolerance,
    tuckThickness,
    tuckBleed,
    isGeneratingTuckPdf,
    setTuckTolerance,
    setTuckThickness,
    setTuckBleed,
    handleDownloadTuckSvg,
    handleDownloadTuckPdf,
  } = useTuckBoxPreview({
    activeDeck: activeRawDeck,
    cardWidth,
    cardHeight,
    numCards,
    enabled: showTuckBox,
  });
  const {
    handleBackgroundGenerated,
    handleAssetGenerated,
  } = useTemplateAssetGeneration({
    activeDeck: activeRawDeck,
    activeTemplate,
    getLiveTemplate: syncLiveTemplate,
    setMockData,
    onTemplateChange: setActiveTemplate,
  });

  if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a10', color: 'white' }}>

      <AdminTemplatesHeader
        decks={decks}
        selectedDeckId={selectedDeckId}
        activeDeck={activeRawDeck}
        activeCardIndex={activeCardIndex}
        totalCards={activeResolvedDeck?.cards.length ?? 0}
        savedConfigs={savedConfigs}
        selectedConfigId={selectedConfigId}
        savingConfig={savingConfig}
        isEmbedded={isEmbeddedStudio}
        showProductionTools={showProductionTools}
        showTuckBox={showTuckBox}
        canSaveConfig={Boolean(activeTemplate)}
        onSelectDeck={setSelectedDeckId}
        onSelectConfig={handleSelectConfig}
        onSaveConfig={handleSaveConfig}
        onToggleProductionTools={() => setShowProductionTools(prev => !prev)}
        onToggleTuckBox={() => setShowTuckBox(prev => !prev)}
        onPrevCard={() => handlePrevCard(syncLiveTemplate())}
        onNextCard={() => handleNextCard(syncLiveTemplate())}
        onJumpToCard={index => handleJumpToCard(index, syncLiveTemplate())}
      />

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
                onBackgroundGenerated={handleBackgroundGenerated}
                onAssetGenerated={handleAssetGenerated}
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
