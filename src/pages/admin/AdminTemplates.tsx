import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import type { Template, Schema } from '@pdfme/common';
import { SupabaseDeckRepository } from '../../lib/deckRepository';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { getTemplateForDeck, buildPdfmeFonts, pdfmePlugins, cardUsesFlujob } from '../../lib/pdfmeConfig';
import { getFrameDataUri } from '../../lib/cardFrame';
import { coverCropToJpeg } from '../../lib/PrintEngine';
import { getCardQrUrl } from '@eb-packages/deck-engine';

const deckRepo = new SupabaseDeckRepository();

// A local designer wrapper to handle pdfme lifecycle per-deck
function DeckDesignerRunner({ 
  deck, 
  template,
  mockData,
  onSave,
}: { 
  deck: RawDeckContent;
  template: Template;
  mockData: Record<string, string>;
  onSave: (tpl: Template) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const [saving, setSaving] = useState(false);
  
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    let mounted = true;
    if (!containerRef.current) return;

    // Load actual fonts so it looks just like the PDF
    buildPdfmeFonts(deck.layout_config as any, template).then(fonts => {
      if (!mounted || !containerRef.current) return;
      
      // Inject mock data directly into schemas so we see visuals perfectly
      const hydratedTpl = JSON.parse(JSON.stringify(template)) as Template;
      hydratedTpl.schemas = hydratedTpl.schemas.map(pageSchema => {
        return pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) {
             (s as any).content = String(mockData[s.name]);
          }
          return s;
        });
      });

      const designer = new Designer({
        domContainer: containerRef.current,
        template: hydratedTpl,
        options: { font: fonts, lang: 'en' },
        plugins: pdfmePlugins,
      });

      designer.onSaveTemplate(async (savedTemplate) => {
        if (saving) return;
        setSaving(true);
        try {
          // Clean out the mock content from the saved template before storing to DB
          const cleanTpl = JSON.parse(JSON.stringify(savedTemplate)) as Template;
          cleanTpl.schemas = cleanTpl.schemas.map(pageSchema => {
             return pageSchema.map(schema => {
                const s = { ...schema };
                // Only delete the content if it was injected by our mockData (e.g. text/images).
                // DO NOT delete it for AI-generated svg containers!
                if (mockData[s.name] !== undefined) {
                  delete (s as any).content;
                }
                return s;
             });
          });
          await onSaveRef.current(cleanTpl);
        } finally {
          setSaving(false);
        }
      });

      designerRef.current = designer;
    }).catch(err => {
      console.error("[DeckDesignerRunner] Failed to load fonts:", err);
    });

    // Hack: Mover la barra flotante de PDFMe (zoom/páginas) hacia arriba
    // para que no tape el código QR en la parte inferior de la carta.
    const observer = new MutationObserver(() => {
      if (!containerRef.current) return;
      // Buscamos cualquier texto con el símbolo % (ej. "100%") o texto de paginación
      const zoomText = Array.from(containerRef.current.querySelectorAll('span, div, button')).find(
        el => el.textContent && (el.textContent.includes('%') || el.textContent.includes('/')) && el.textContent.length <= 5
      );
      if (zoomText) {
        let parent = zoomText.parentElement;
        while (parent && parent !== containerRef.current) {
          const style = window.getComputedStyle(parent);
          // Ojo: hay que checar si pdfme lo inyectó con style.position
          if ((style.position === 'absolute' || style.position === 'sticky') && style.bottom !== 'auto') {
            parent.style.left = '16px';
            parent.style.bottom = '16px';
            parent.style.top = 'auto';
            parent.style.transform = 'none'; // Quitar el translateX(-50%) que lo centra
            parent.style.zIndex = '9999';
            observer.disconnect(); // Dejar de observar una vez modificado
            break;
          }
          parent = parent.parentElement;
        }
      }
    });
    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mounted = false;
      if (designerRef.current) {
        designerRef.current.destroy();
        designerRef.current = null;
      }
    };
  }, [deck.id]); // Re-mount entirely when deck changes

  // Hot-swap card texts when mockData changes without losing current layout edits
  useEffect(() => {
    if (!designerRef.current) return;
    try {
      const currentTpl = designerRef.current.getTemplate();
      const updatedTpl = JSON.parse(JSON.stringify(currentTpl)) as Template;
      updatedTpl.schemas = updatedTpl.schemas.map(pageSchema => {
        return pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) {
             (s as any).content = String(mockData[s.name]);
          }
          return s;
        });
      });
      designerRef.current.updateTemplate(updatedTpl);
    } catch (err) {
      console.warn("[DeckDesignerRunner] Hot-swap failed:", err);
    }
  }, [mockData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#131313', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Editando Layout de: <strong style={{ color: '#fff', opacity: 1 }}>{deck.name}</strong></span>
          <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
            {template.basePdf && typeof template.basePdf === 'object' ? `${template.basePdf.width}x${template.basePdf.height}mm` : ''}
          </span>
        </div>
        <button 
          onClick={() => designerRef.current?.saveTemplate()}
          disabled={saving}
          style={{
            background: 'var(--color-gold)', color: '#000', border: 'none', padding: '0.4rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem'
          }}
        >
          {saving ? 'Guardando Layout...' : '💾 Guardar Layout en Mazo'}
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />
    </div>
  );
}


export default function AdminTemplates() {
  const [decks, setDecks] = useState<RawDeckContent[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Specific deck state
  const [activeRawDeck, setActiveRawDeck] = useState<RawDeckContent | null>(null);
  const [activeResolvedDeck, setActiveResolvedDeck] = useState<any>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [mockData, setMockData] = useState<Record<string, string> | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);

  // Content Configuration Overrides
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>({});
  const [showHideMenu, setShowHideMenu] = useState(false);

  useEffect(() => {
    deckRepo.getAllDecks().then(data => {
      setDecks(data);
      setLoading(false);
    });
  }, []);

  const getCleanWhenToUse = (text: string, doHide: boolean) => {
    if (!text) return '';
    if (!doHide) return text;
    // Strip things like "Para 3+ jugadores." or "Para 3- jugadores"
    return text.replace(/([.¡!]\s*)?[Pp]ara\s*\d+[+-]?\s*jugador(es)?\.?/g, '').trim();
  };

  const loadMockDataForCard = async (deck: any, template: Template, cardIndex: number, overrideHiddenFields?: Record<string, boolean>) => {
    const card = deck.cards[cardIndex];
    if (!card) return;

    const w = (typeof template.basePdf === 'object' && 'width' in template.basePdf) ? template.basePdf.width : 70;
    const h = (typeof template.basePdf === 'object' && 'height' in template.basePdf) ? template.basePdf.height : 120;

    const mData: Record<string, string> = {
      number: `#${String(card.front.number).padStart(2, '0')}`,
      title: card.front.title,
    };

    if (card.front.art_url) {
      mData.art = await coverCropToJpeg(card.front.art_url, w, h);
    }

    if (cardUsesFlujob(card)) {
       mData.back_ai_image = card.back?.back_image_url || '';
       mData.qr_overlay = overrideHiddenFields?.qr ? '' : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
    } else {
       const frameUri = await getFrameDataUri(deck.slug);
       mData.bg = await coverCropToJpeg(frameUri, w, h);
       
       const resolveHide = overrideHiddenFields || hiddenFields || {};
       mData.when_to_use = resolveHide.when_to_use ? '' : getCleanWhenToUse(card.back?.when_to_use || '', !!resolveHide.player_count);
       mData.phrase = resolveHide.phrase ? '' : (card.back?.phrase ? `"${card.back.phrase}"` : '');
       mData.instruction = resolveHide.instruction ? '' : (card.back?.instruction || '');
       mData.answer = resolveHide.answer ? '' : (card.back?.answer ? `Rta: ${card.back.answer}` : '');
       mData.fun_fact = resolveHide.fun_fact ? '' : (card.back?.fun_fact ? `💡 ${card.back.fun_fact}` : '');
       mData.qr = resolveHide.qr ? '' : (card.back?.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number));
       mData.brand = resolveHide.brand ? '' : `Baraja · ${deck.name}`;
    }

    setMockData(mData);
  };


  const loadDeckLayout = useCallback(async (deckId: string) => {
    const rawDeck = decks.find(d => d.id === deckId);
    if (!rawDeck) return;
    
    // 1. Resolve to DeckSchema to map design properly
    const { resolveDeck } = await import('@eb-packages/deck-engine');
    const deck = resolveDeck(rawDeck);

    // 2. Get Base Template for this deck
    const template = getTemplateForDeck(deck);
    
    // Support legacy hide_player_count and merge to new structure
    const isPlayersHidden = !!rawDeck.design_template_overrides?.hide_player_count;
    const initialHiddenFields = rawDeck.design_template_overrides?.hidden_fields || {};
    if (isPlayersHidden) initialHiddenFields.player_count = true;

    setActiveRawDeck(rawDeck);
    setActiveResolvedDeck(deck);
    setActiveTemplate(template);
    setActiveCardIndex(0);
    setHiddenFields(initialHiddenFields);

    // Load up the first card
    await loadMockDataForCard(deck, template, 0, initialHiddenFields);
  }, [decks]);



  useEffect(() => {
    if (selectedDeckId) {
      loadDeckLayout(selectedDeckId);
    } else {
      setActiveRawDeck(null);
      setActiveResolvedDeck(null);
      setActiveTemplate(null);
      setMockData(null);
    }
  }, [selectedDeckId, loadDeckLayout]);

  const handleNextCard = () => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const nextIdx = activeCardIndex < maxIdx ? activeCardIndex + 1 : 0;
    setActiveCardIndex(nextIdx);
    loadMockDataForCard(activeResolvedDeck, activeTemplate, nextIdx);
  };

  const handlePrevCard = () => {
    if (!activeResolvedDeck || !activeTemplate) return;
    const maxIdx = activeResolvedDeck.cards.length - 1;
    const prevIdx = activeCardIndex > 0 ? activeCardIndex - 1 : maxIdx;
    setActiveCardIndex(prevIdx);
    loadMockDataForCard(activeResolvedDeck, activeTemplate, prevIdx);
  };

  async function handleSaveDeckTemplate(savedTpl: Template) {
    if (!activeRawDeck) return;
    
    // Save the layout config strictly to the deck's overrides!
    await deckRepo.updateDeckSettings(activeRawDeck.id, {
      design_template_overrides: {
        ...(activeRawDeck.design_template_overrides || {}),
        layout_config: savedTpl as any,
        hidden_fields: hiddenFields,
      }
    });

    // Also update our local active object so it persists between reloads
    setActiveRawDeck({
      ...activeRawDeck,
      design_template_overrides: {
        ...(activeRawDeck.design_template_overrides || {}),
        layout_config: savedTpl as any,
        hidden_fields: hiddenFields,
      }
    });

    alert('✅ Layout y opciones de contenido guardados correctamente para ' + activeRawDeck.name);
  }


  if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a10', color: 'white' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <Link to="/admin" style={{ color: '#d4af64', textDecoration: 'none', fontSize: '0.85rem' }}>← Dashboard</Link>
          <h1 style={{ margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.4rem' }}>🃏 Editor Visual por Mazo</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {activeRawDeck && (
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowHideMenu(!showHideMenu)}
                style={{
                  background: '#222', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                  color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem'
                }}
              >
                👁️ Ocultar Campos...
              </button>

              {showHideMenu && (
                <div style={{
                   position: 'absolute', top: 'calc(100% + 5px)', right: 0,
                   background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                   padding: '1rem', borderRadius: '8px', zIndex: 1000,
                   boxShadow: '0 4px 20px rgba(0,0,0,0.5)', width: '220px',
                   display: 'flex', flexDirection: 'column', gap: '0.5rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#d4af64' }}>Ocultar Data</h4>
                  {[
                    { key: 'player_count', label: 'Ctd. Jugadores (en When)' },
                    { key: 'brand', label: 'Marca / Nombre Mazo' },
                    { key: 'qr', label: 'Código QR' },
                    { key: 'when_to_use', label: 'Box: Cuándo Usar' },
                    { key: 'phrase', label: 'Box: Frase Principal' },
                    { key: 'instruction', label: 'Box: Instrucción' },
                    { key: 'fun_fact', label: 'Box: Fun Fact' },
                    { key: 'answer', label: 'Box: Respuesta' },
                  ].map(field => (
                    <label key={field.key} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: 0.8 }}>
                      <input 
                        type="checkbox" 
                        checked={!!hiddenFields[field.key]}
                        onChange={e => {
                          const val = e.target.checked;
                          const newFields = { ...hiddenFields, [field.key]: val };
                          setHiddenFields(newFields);
                          if (activeResolvedDeck && activeTemplate) {
                            loadMockDataForCard(activeResolvedDeck, activeTemplate, activeCardIndex, newFields);
                          }
                        }}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Seleccionar Mazo:</label>
          <select 
            value={selectedDeckId} 
            onChange={e => setSelectedDeckId(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--color-gold)',
              borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="">-- Elige un mazo para editar --</option>
            {decks.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {activeResolvedDeck && activeResolvedDeck.cards.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem', background: '#222', borderRadius: '6px', padding: '0.2rem' }}>
               <button onClick={handlePrevCard} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', padding: '0.3rem 0.6rem' }}>◀</button>
               <span style={{ fontSize: '0.8rem', minWidth: '60px', textAlign: 'center' }}>
                 Card {activeCardIndex + 1} / {activeResolvedDeck.cards.length}
               </span>
               <button onClick={handleNextCard} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', padding: '0.3rem 0.6rem' }}>▶</button>
            </div>
          )}
        </div>
      </div>

      {/* EDITOR AREA */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!activeRawDeck || !activeTemplate || !mockData ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
             <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>☝️</span>
             <p>Selecciona un mazo arriba para comenzar a editar su diseño.</p>
             <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Verás el fondo (frame) y el contenido exactamente igual que al Imprimir el PDF.</p>
          </div>
        ) : (
          <DeckDesignerRunner 
            deck={activeRawDeck}
            template={activeTemplate}
            mockData={mockData}
            onSave={handleSaveDeckTemplate}
          />
        )}
      </div>

    </div>
  );
}
