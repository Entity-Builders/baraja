import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Template } from '@pdfme/common';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { CardFieldInventoryPanel, FieldPlacementPanel } from './components/CardFieldInventoryPanel';
import { TuckBoxSidebar } from './components/TuckBoxSidebar';
import { LayoutToolsPanel } from './components/LayoutToolsPanel';
import { SavedConfigsPanel } from './components/SavedConfigsPanel';
import { DesignPipelineWorkspace } from './components/DesignPipelineWorkspace';
import { AdminTemplatesHeader } from './components/AdminTemplatesHeader';
import { BarajaStudioInventoryPanel } from './components/BarajaStudioInventoryPanel';
import {
  getCardFieldInventory,
  type DeckCardLike,
} from './components/cardFieldInventory';
import { useSavedDeckConfigs } from './hooks/useSavedDeckConfigs';
import { useTuckBoxPreview } from './hooks/useTuckBoxPreview';
import { useTemplateAssetGeneration } from './hooks/useTemplateAssetGeneration';
import { normalizeFlujoBTemplate } from '../../lib/pdfmeConfig';
import {
  buildDeckDesignPipelineState,
  type DesignRecommendation,
} from '../../lib/deckDesignPipeline';
import {
  getReverseModelDescription,
  getReverseModelLabel,
  shouldUseEditableReverseLayout,
  shouldUseLegacyFullBackTemplate,
} from '../../lib/reverseModel';

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
    activePreviewTemplate,
    reverseModelInfo,
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
    handleApplyFieldPlacementsAndSave,
    handleBackgroundSourceChange,
    handlePrepareEditableMigration,
  } = useDeckStudio();

  const designerRunnerRef = useRef<DeckDesignerRunnerRef>(null);
  const syncLiveTemplate = useCallback(() => {
    const liveTemplate = designerRunnerRef.current?.getLatestCombinedTemplate();
    if (liveTemplate) setActiveTemplate(liveTemplate);
    return liveTemplate || undefined;
  }, [setActiveTemplate]);

  const shouldOpenTuckBox = searchParams.get('tool') === 'tuckbox';
  const getSavedConfigApplyOverrides = useCallback((config: { layout_config: Record<string, unknown>; card_width: number; card_height: number }) => {
    if (!reverseModelInfo || !shouldUseLegacyFullBackTemplate(reverseModelInfo)) return undefined;

    const width = config.card_width || cardWidth;
    const height = config.card_height || cardHeight;
    const sanitizedTemplate = normalizeFlujoBTemplate(
      config.layout_config as unknown as Template,
      width,
      height,
    );

    return {
      layout_config: sanitizedTemplate as unknown as Record<string, unknown>,
      hidden_fields: {},
      card_width: width,
      card_height: height,
    };
  }, [cardHeight, cardWidth, reverseModelInfo]);

  // ── Tuck Box state ─────────────────────────────────────────────
  const [showTuckBox, setShowTuckBox] = useState(() => shouldOpenTuckBox);
  const [showProductionTools, setShowProductionTools] = useState(false);
  const [showAdvancedDesignTools, setShowAdvancedDesignTools] = useState(false);
  const [rejectedRecommendationIds, setRejectedRecommendationIds] = useState<string[]>([]);
  const [applyingRecommendationId, setApplyingRecommendationId] = useState<string | null>(null);
  const {
    savedConfigs,
    selectedConfigId,
    loadingConfigs,
    savingConfig,
    applyingConfigId,
    handleSelectConfig,
    handleSaveConfig,
    saveConfigSnapshot,
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
    getApplyOverrides: getSavedConfigApplyOverrides,
  });

  useEffect(() => {
    const deckFromQuery = embeddedDeckId || searchParams.get('deck');
    if (deckFromQuery && deckFromQuery !== selectedDeckId) {
      setSelectedDeckId(deckFromQuery);
    }
  }, [embeddedDeckId, searchParams, selectedDeckId, setSelectedDeckId]);

  useEffect(() => {
    setRejectedRecommendationIds([]);
  }, [activeRawDeck?.id]);

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
    fieldPlacements,
    getLiveTemplate: syncLiveTemplate,
    onBackgroundSourceChange: handleBackgroundSourceChange,
    setMockData,
    onTemplateChange: setActiveTemplate,
  });
  const focusBackgroundInspector = useCallback(() => {
    document.getElementById('baraja-background-inspector')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const selectedConfig = savedConfigs.find(config => config.id === selectedConfigId);
  const activeLayoutLabel = selectedConfig?.name
    || (activeRawDeck?.design_template_overrides?.layout_config ? 'Layout aplicado' : 'Layout base');
  const hiddenFieldCount = Object.values(hiddenFields).filter(Boolean).length;
  const activeSampleCard = activeResolvedDeck?.cards?.[activeCardIndex] as DeckCardLike | undefined;
  const fieldInventory = useMemo(() => {
    if (!activeRawDeck || !mockData) return { front: [], back: [] };

    return getCardFieldInventory({
      deckName: activeRawDeck.name,
      card: activeSampleCard,
      mockData,
      hiddenFields,
      fieldPlacements,
    });
  }, [
    activeRawDeck,
    activeSampleCard,
    fieldPlacements,
    hiddenFields,
    mockData,
  ]);
  const usesLegacyFullBack = reverseModelInfo ? shouldUseLegacyFullBackTemplate(reverseModelInfo) : false;
  const canUseEditableLayout = reverseModelInfo ? shouldUseEditableReverseLayout(reverseModelInfo) : true;
  const autoLayoutUnavailableReason = usesLegacyFullBack
    ? 'Este mazo usa dorsos completos heredados; migrá a layout editable para usar auto-layout.'
    : undefined;
  const pipeline = useMemo(() => {
    if (!activeResolvedDeck) return null;

    return buildDeckDesignPipelineState({
      deck: activeResolvedDeck,
      template: activeTemplate,
      fieldPlacements,
      hiddenFields,
      activeCardIndex,
      activeFace,
      cardWidth,
      cardHeight,
      savedConfigCount: savedConfigs.length,
      selectedConfigId,
      hasBackgroundAsset: Boolean(mockData?.bg || mockData?.back_ai_image),
      reverseModelInfo,
    });
  }, [
    activeResolvedDeck,
    activeTemplate,
    fieldPlacements,
    hiddenFields,
    activeCardIndex,
    activeFace,
    cardWidth,
    cardHeight,
    savedConfigs.length,
    selectedConfigId,
    mockData?.bg,
    mockData?.back_ai_image,
    reverseModelInfo,
  ]);

  const handleApplyRecommendation = useCallback(async (recommendation: DesignRecommendation) => {
    if (!activeRawDeck) return;

    const confirmed = window.confirm(`Aplicar "${recommendation.title}" a ${activeRawDeck.name}?`);
    if (!confirmed) return;

    setApplyingRecommendationId(recommendation.id);
    try {
      if (
        recommendation.actionId === 'run_auto_layout' ||
        recommendation.actionId === 'hide_field' ||
        recommendation.actionId === 'move_field_to_front' ||
        recommendation.actionId === 'move_field_to_back'
      ) {
        const savedSnapshot = await saveConfigSnapshot(makePipelineSnapshotName(activeRawDeck.name), { notify: false });
        if (!savedSnapshot) return;
      }

      if (recommendation.actionId === 'run_auto_layout') {
        await handleAutoLayout();
      } else if (recommendation.actionId === 'save_layout_version') {
        const saved = await saveConfigSnapshot(makePipelineSnapshotName(activeRawDeck.name), { notify: true });
        if (!saved) return;
      } else if (recommendation.actionId === 'hide_field' && recommendation.fieldKey) {
        await handleApplyFieldPlacementsAndSave({
          ...fieldPlacements,
          [recommendation.fieldKey]: 'hidden',
        });
      } else if (recommendation.actionId === 'move_field_to_front' && recommendation.fieldKey) {
        await handleApplyFieldPlacementsAndSave({
          ...fieldPlacements,
          [recommendation.fieldKey]: 'front',
        });
      } else if (recommendation.actionId === 'move_field_to_back' && recommendation.fieldKey) {
        await handleApplyFieldPlacementsAndSave({
          ...fieldPlacements,
          [recommendation.fieldKey]: 'back',
        });
      } else if (recommendation.actionId === 'review_card' && typeof recommendation.cardIndex === 'number') {
        handleJumpToCard(recommendation.cardIndex, syncLiveTemplate());
      } else if (recommendation.actionId === 'open_background_tools') {
        focusBackgroundInspector();
      }

      setRejectedRecommendationIds(prev => [...new Set([...prev, recommendation.id])]);
    } finally {
      setApplyingRecommendationId(null);
    }
  }, [
    activeRawDeck,
    fieldPlacements,
    focusBackgroundInspector,
    handleApplyFieldPlacementsAndSave,
    handleAutoLayout,
    handleJumpToCard,
    saveConfigSnapshot,
    syncLiveTemplate,
  ]);

  if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Cargando...</div>;

  return (
    <div className="admin-templates-studio" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a10', color: 'white' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .admin-templates-main {
          flex: 1;
          display: grid;
          grid-template-columns: minmax(250px, 300px) minmax(420px, 1fr) minmax(330px, 390px);
          overflow: hidden;
          min-width: 0;
        }

        .admin-templates-main--two {
          grid-template-columns: minmax(280px, 340px) minmax(420px, 1fr);
        }

        .admin-templates-inventory,
        .admin-templates-inspector {
          background: #111;
          padding: 1.5rem;
          overflow-y: auto;
          min-width: 0;
        }

        .admin-templates-inventory {
          border-right: 1px solid rgba(255,255,255,0.06);
        }

        .admin-templates-inspector {
          border-left: 1px solid rgba(255,255,255,0.06);
        }

        .admin-templates-canvas {
          position: relative;
          overflow: hidden;
          min-width: 0;
        }

        @media (max-width: 760px) {
          .admin-templates-studio {
            height: auto !important;
            min-height: 100vh;
            overflow-x: hidden;
          }

          .admin-templates-main {
            flex-direction: column;
            display: flex;
            overflow: visible;
          }

          .admin-templates-inventory,
          .admin-templates-inspector {
            width: auto !important;
            min-width: 0 !important;
            border-right: none;
            border-left: none;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            padding: 1rem !important;
            overflow: visible;
          }

          .admin-templates-canvas {
            min-height: 560px;
            overflow: hidden;
          }
        }
      `}} />

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
      <div className={`admin-templates-main ${showTuckBox ? 'admin-templates-main--two' : ''}`}>

        {/* Left inventory — deck navigation and object list */}
        <div className="admin-templates-inventory">
          {showTuckBox && activeRawDeck ? (
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
          ) : activeRawDeck && activeResolvedDeck ? (
            <BarajaStudioInventoryPanel
              activeCardIndex={activeCardIndex}
              activeFace={activeFace}
              cards={activeResolvedDeck.cards}
              deckName={activeRawDeck.name}
              onJumpToCard={index => handleJumpToCard(index, syncLiveTemplate())}
            />
          ) : (
            <div style={{ opacity: 0.5, fontSize: '0.85rem' }}>Seleccioná un mazo para ver su inventario.</div>
          )}
        </div>

        {/* Canvas — switches between pdfme editor and tuck box preview */}
        <div className="admin-templates-canvas">
          {!activeRawDeck || (!showTuckBox && (!activeTemplate || !mockData)) ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>☝️</span>
              <p>Selecciona un mazo arriba para comenzar a editar su diseño.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Verás el fondo (frame) y el contenido exactamente igual que al Imprimir el PDF.</p>
            </div>
          ) : showTuckBox ? (
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
              previewTemplate={activePreviewTemplate ?? activeTemplate!}
              mockData={mockData!}
              activeFace={activeFace}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              analyzing={analyzing}
              autoLayoutUnavailableReason={autoLayoutUnavailableReason}
              onFaceChange={setActiveFace}
              onCardSizeChange={handleCardSizeChange}
              onAutoLayout={handleAutoLayout}
              onSave={handleSaveDeckTemplate}
              onTemplateDraftChange={setActiveTemplate}
              onFocusBackgroundTools={focusBackgroundInspector}
            />
          )}
        </div>

        {!showTuckBox && (
          <div className="admin-templates-inspector">
            {activeRawDeck && activeResolvedDeck && mockData && pipeline ? (
              <DesignPipelineWorkspace
                deckName={activeRawDeck.name}
                activeFace={activeFace}
                activeCardIndex={activeCardIndex}
                totalCards={activeResolvedDeck.cards.length}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                hiddenFieldCount={hiddenFieldCount}
                savedConfigCount={savedConfigs.length}
                activeLayoutLabel={activeLayoutLabel}
                pipeline={pipeline}
                rejectedRecommendationIds={rejectedRecommendationIds}
                applyingRecommendationId={applyingRecommendationId}
                advancedOpen={showAdvancedDesignTools}
                analyzing={analyzing}
                autoLayoutUnavailableReason={autoLayoutUnavailableReason}
                onToggleAdvanced={() => setShowAdvancedDesignTools(prev => !prev)}
                onAutoLayout={handleAutoLayout}
                onJumpToCard={index => handleJumpToCard(index, syncLiveTemplate())}
                onApplyRecommendation={handleApplyRecommendation}
                onRejectRecommendation={recommendationId => {
                  setRejectedRecommendationIds(prev => [...new Set([...prev, recommendationId])]);
                }}
                fieldInventory={(
                  <CardFieldInventoryPanel
                    activeFace={activeFace}
                    frontFields={fieldInventory.front}
                    backFields={fieldInventory.back}
                  />
                )}
                backgroundTools={(
                  canUseEditableLayout ? (
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
                  ) : (
                    <section style={{ display: 'grid', gap: '0.45rem' }}>
                      <p style={{ margin: 0, color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Dorso completo heredado
                      </p>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '0.74rem', lineHeight: 1.45 }}>
                        Este dorso ya es una imagen completa con texto. Para cambiar solo el fondo sin romper el contenido, prepará primero un dorso editable con fondo limpio y campos separados.
                      </p>
                      <button
                        type="button"
                        onClick={handlePrepareEditableMigration}
                        style={{
                          width: '100%',
                          minHeight: '38px',
                          border: '1px solid rgba(212,175,100,0.45)',
                          background: 'rgba(212,175,100,0.14)',
                          color: '#f3d58c',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 850,
                          fontSize: '0.76rem',
                        }}
                      >
                        Preparar dorso editable
                      </button>
                    </section>
                  )
                )}
                layoutTools={(
                  usesLegacyFullBack && reverseModelInfo ? (
                    <section
                      style={{
                        background: 'rgba(255,255,255,0.035)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        marginBottom: '1rem',
                        display: 'grid',
                        gap: '0.45rem',
                      }}
                    >
                      <p style={{ margin: 0, color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {getReverseModelLabel(reverseModelInfo)}
                      </p>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.74rem', lineHeight: 1.45 }}>
                        {getReverseModelDescription(reverseModelInfo)}
                      </p>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.52)', fontSize: '0.7rem', lineHeight: 1.4 }}>
                        En este modo el canvas solo debe ajustar la imagen completa y el QR. Para pensar orden, tamaños, color y posiciones de texto, prepará una migración editable.
                      </p>
                      <button
                        type="button"
                        onClick={handlePrepareEditableMigration}
                        style={{
                          width: '100%',
                          minHeight: '36px',
                          border: '1px solid rgba(212,175,100,0.45)',
                          background: 'rgba(212,175,100,0.14)',
                          color: '#f3d58c',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                        }}
                      >
                        Preparar migración editable
                      </button>
                    </section>
                  ) : (
                    <>
                      <FieldPlacementPanel
                        placements={fieldPlacements}
                        onChange={handleFieldPlacementsChange}
                      />
                      <LayoutToolsPanel
                        hiddenFields={hiddenFields}
                        analyzing={analyzing}
                        autoLayoutUnavailableReason={autoLayoutUnavailableReason}
                        onFieldChange={handleHiddenFieldsChange}
                        onAutoLayout={handleAutoLayout}
                      />
                    </>
                  )
                )}
                savedConfigTools={(
                  <SavedConfigsPanel
                    configs={savedConfigs}
                    loading={loadingConfigs}
                    applyingId={applyingConfigId}
                    onApply={handleApplyConfig}
                    onDelete={handleDeleteConfig}
                  />
                )}
              />
            ) : (
              <div style={{ opacity: 0.5, fontSize: '0.85rem' }}>Selecciona un mazo para ver el inspector.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function makePipelineSnapshotName(deckName: string): string {
  return `${deckName} · snapshot pipeline ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}
