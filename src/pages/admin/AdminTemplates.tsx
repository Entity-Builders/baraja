import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDeckStudio } from './features/deck-studio/useDeckStudio';
import { DeckDesignerRunner, type DeckDesignerRunnerRef } from './features/deck-studio/DeckDesignerRunner';
import { FieldVisibilityMenu } from './features/deck-studio/FieldVisibilityMenu';
import { CardNavigator } from './features/deck-studio/CardNavigator';
import { AIPanelSidebar } from './components/AIPanelSidebar';
import { SupabaseDeckRepository } from '../../lib/deckRepository';

const deckRepo = new SupabaseDeckRepository();

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

          {/* Save Master Template */}
          {activeRawDeck && activeTemplate && (
            <button
              onClick={async () => {
                const tName = prompt('Nombre de la Plantilla Global (ej: Accion Premium 2026):');
                if (!tName) return;
                try {
                  const id = tName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `template-${Date.now()}`;
                  const { error } = await deckRepo.client
                    .from('baraja_design_templates')
                    .insert({ id, name: tName, layout_config: activeTemplate, hidden_fields: hiddenFields });
                  if (error) throw error;
                  alert('¡Plantilla Maestra Guardada exitosamente! Podrás asignarla a cualquier mazo globalmente.');
                } catch (err: any) {
                  alert('Error: ' + err.message);
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #1e3c72, #2a5298)', border: '1px solid #4a90e2',
                color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                cursor: 'pointer', fontWeight: 'bold',
              }}
              title="Guarda este diseño como un Preset Master reusable."
            >
              🌌 Guardar Plantilla
            </button>
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

        {/* AI Sidebar */}
        <div style={{ width: '320px', minWidth: '320px', background: '#111', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', overflowY: 'auto' }}>
          {activeRawDeck && mockData ? (
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
          ) : (
            <div style={{ opacity: 0.5, fontSize: '0.85rem' }}>Selecciona un mazo para ver las herramientas IA.</div>
          )}
        </div>

        {/* pdfme Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {!activeRawDeck || !activeTemplate || !mockData ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>☝️</span>
              <p>Selecciona un mazo arriba para comenzar a editar su diseño.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Verás el fondo (frame) y el contenido exactamente igual que al Imprimir el PDF.</p>
            </div>
          ) : (
            <DeckDesignerRunner
              ref={designerRunnerRef}
              deck={activeRawDeck}
              template={activeTemplate}
              mockData={mockData}
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
