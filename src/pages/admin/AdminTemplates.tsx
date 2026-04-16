import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { FieldVisibilityMenu } from './features/deck-studio/FieldVisibilityMenu';
import { CardNavigator } from './features/deck-studio/CardNavigator';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { SupabaseDeckRepository, SavedConfigRepository, type SavedConfigRow } from '../../lib/deckRepository';
import { getEditionBySlug } from '../../lib/editions';
import {
  calculateTuckBoxDimensions,
  generateTuckBoxSVG,
  generateTuckBoxPdf,
  getEditionColors,
  type TuckBoxParams,
  type TuckBoxContent,
} from '../../lib/TuckBoxEngine';

const deckRepo = new SupabaseDeckRepository();
const savedConfigRepo = new SavedConfigRepository();

export default function AdminTemplates() {
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
  } = useDeckStudio();

  const designerRunnerRef = useRef<DeckDesignerRunnerRef>(null);

  // ── Tuck Box state ─────────────────────────────────────────────
  const [showTuckBox, setShowTuckBox] = useState(false);
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
    if (!configId) return; // deselected

    const config = savedConfigs.find(c => c.id === configId);
    if (!config) return;

    // Apply layout template
    if (config.layout_config && Object.keys(config.layout_config).length > 0) {
      setActiveTemplate(config.layout_config as any);
    }

    // Apply card dimensions
    if (config.card_width && config.card_height) {
      handleCardSizeChange(config.card_width, config.card_height);
    }

    // Apply hidden fields
    if (config.hidden_fields) {
      handleHiddenFieldsChange(config.hidden_fields);
    }
  }, [savedConfigs, setActiveTemplate, handleCardSizeChange, handleHiddenFieldsChange]);

  // Save current config
  const handleSaveConfig = useCallback(async () => {
    if (!activeRawDeck || !activeTemplate) return;
    const configName = prompt(
      'Nombre de la configuración guardada:\n(ej: "Barómetro 6×9 Premium", "Poker Night")',
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
      alert(`✅ Config "${configName}" guardada exitosamente.`);
    } catch (err: any) {
      alert('Error guardando config: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  }, [activeRawDeck, activeTemplate, hiddenFields, cardWidth, cardHeight, fetchSavedConfigs]);

  // Apply a saved config
  const handleApplyConfig = useCallback(async (config: SavedConfigRow) => {
    if (!activeRawDeck) return;
    if (!confirm(`¿Aplicar la config "${config.name}" a ${activeRawDeck.name}?\n\nEsto reemplazará el layout, tamaño y campos ocultos actuales.`)) return;

    setApplyingConfigId(config.id);
    try {
      await savedConfigRepo.applyToEdition(config.id, activeRawDeck.slug || activeRawDeck.id);
      // Reload the deck to reflect changes
      setSelectedDeckId('');
      setTimeout(() => setSelectedDeckId(activeRawDeck.id), 100);
      alert(`✅ Config "${config.name}" aplicada. El editor se recargó.`);
    } catch (err: any) {
      alert('Error aplicando config: ' + err.message);
    } finally {
      setApplyingConfigId(null);
    }
  }, [activeRawDeck, setSelectedDeckId]);

  // Delete a saved config
  const handleDeleteConfig = useCallback(async (config: SavedConfigRow) => {
    if (!confirm(`¿Eliminar la config "${config.name}"? Esta acción no se puede deshacer.`)) return;
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
          <h1 style={{ margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.4rem' }}>🃏 Editor Visual por Mazo</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>

          {/* Field Visibility */}
          {activeRawDeck && (
            <FieldVisibilityMenu
              hiddenFields={hiddenFields}
              onFieldChange={handleHiddenFieldsChange}
            />
          )}

          {/* AI Auto-Layout */}
          {activeRawDeck && (
            <button
              onClick={handleAutoLayout}
              disabled={analyzing}
              style={{
                background: analyzing ? '#444' : 'linear-gradient(135deg, #2a2a2a, #111)',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: analyzing ? 'not-allowed' : 'pointer',
                color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}
            >
              {analyzing ? '⏳ Analizando...' : '✨ Auto-Layout IA'}
            </button>
          )}

          {/* Deck Selector */}
          <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Seleccionar Mazo:</label>
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

          {/* Version Selector — instant preview */}
          {activeRawDeck && savedConfigs.length > 0 && (
            <>
              <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
              <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Versión:</label>
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
                <option value="">-- Actual (sin guardar) --</option>
                {savedConfigs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.card_width}×{c.card_height}mm)
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Save Config */}
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
              title="Guarda la configuración completa (layout + tamaño + campos ocultos) como un snapshot reusable."
            >
              {savingConfig ? '⏳ Guardando...' : '💾 Guardar Config'}
            </button>
          )}

          {/* Tuck Box Toggle */}
          {activeRawDeck && (
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
              📦 Tuck Box
            </button>
          )}

          {/* Generate PDF — direct link */}
          {activeRawDeck && (
            <Link
              to={`/admin/${activeRawDeck.id}/print`}
              style={{
                background: '#d4af64', color: '#000', padding: '0.5rem 1rem',
                borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              🖨️ Generar PDF
            </Link>
          )}

          {/* Card Navigator */}
          {activeResolvedDeck && (
            <CardNavigator
              activeCardIndex={activeCardIndex}
              totalCards={activeResolvedDeck.cards.length}
              onPrev={handlePrevCard}
              onNext={handleNextCard}
            />
          )}
        </div>
      </div>

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

              {/* ── Saved Configs Panel ────────────────────────────── */}
              <SavedConfigsPanel
                configs={savedConfigs}
                loading={loadingConfigs}
                applyingId={applyingConfigId}
                onApply={handleApplyConfig}
                onDelete={handleDeleteConfig}
              />
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
        <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Cargando configs guardadas...</div>
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
          📦 Configs Guardadas
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
          No hay configs guardadas aún.
          <br />
          <span style={{ fontSize: '0.7rem' }}>Usa "💾 Guardar Config" arriba para crear una.</span>
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
        📦 Tuck Box
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

