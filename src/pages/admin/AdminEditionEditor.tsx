import { useState, useEffect, type FormEvent } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { useDeck } from '../../hooks/useDeck';

import { EditorSidebar } from '../../components/cards/EditorSidebar';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { DeckSettingsModal } from '../../components/admin/DeckSettingsModal';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { AdminDeckGallery } from './components/AdminDeckGallery';
import {
  PublicationStatusPanel,
  type DeckPrintableConfig,
} from './components/PublicationStatusPanel';
import AdminTemplates from './AdminTemplates';
import {
  getDeckPublicationReadiness,
} from '../../lib/deckPublicationReadiness';

type AdminNotice = {
  kind: 'success' | 'warning' | 'error';
  message: string;
};

type StudioMode = 'cards' | 'design' | 'output';

type SaveEditionResponse = {
  success?: boolean;
  warnings?: string[];
  error?: string;
};

function getStudioMode(value: string | null): StudioMode {
  if (value === 'design' || value === 'output') return value;
  return 'cards';
}

export default function AdminEditionEditor() {
  const { deckId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { deck, loading, error } = useDeck(deckId);
  const studioMode = getStudioMode(searchParams.get('studio'));
  
  // Local state to see edits instantly before full page reload
  const [deckDraft, setDeckDraft] = useState<DeckSchema | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<AdminNotice | null>(null);
  const [generatingArt, setGeneratingArt] = useState<Record<string, boolean>>({});
  const [generatingBack, setGeneratingBack] = useState<Record<string, boolean>>({});
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchGeneratingBacks, setBatchGeneratingBacks] = useState(false);
  const [viewMode, setViewMode] = useState<'print' | 'original' | 'gallery'>('gallery');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Sync local cards state when deck loads from Supabase
  useEffect(() => {
    if (deck) {
      setDeckDraft(deck);
      setCards(deck.cards);
      if (!activeCardId && deck.cards.length > 0) {
        setActiveCardId(deck.cards[0].id);
      }
    }
  }, [deck]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLocalCard(cardId: string, updateCard: (card: Card) => Card) {
    setCards(prev => prev.map(card => card.id === cardId ? updateCard(card) : card));
    setDeckDraft(prev => prev
      ? {
          ...prev,
          cards: prev.cards.map(card => card.id === cardId ? updateCard(card) : card),
        }
      : prev
    );
    setEditingCard(prev => prev?.id === cardId ? updateCard(prev) : prev);
  }

  async function handleGenerateArt(cardId: string, force = true) {
    setGeneratingArt(prev => ({ ...prev, [cardId]: true }));
    try {
      const res = await fetch('/__cms__/generate-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, cardId, force }),
      });
      const result = await res.json() as { success?: boolean; art_url?: string; art_versions?: string[]; error?: string };
      if (result.success && result.art_url) {
        const nextArtUrl = result.art_url;
        updateLocalCard(cardId, card => ({
          ...card,
          front: {
            ...card.front,
            art_url: nextArtUrl,
            ...(result.art_versions ? { art_versions: result.art_versions } : {}),
          },
        }));
        setNotice({ kind: 'success', message: 'Arte actualizado y sincronizado.' });
      } else {
        setNotice({ kind: 'error', message: result.error || 'No se pudo generar el arte.' });
      }
    } catch (err: unknown) {
      setNotice({ kind: 'error', message: `No se pudo conectar con el generador: ${(err as Error).message}` });
    } finally {
      setGeneratingArt(prev => ({ ...prev, [cardId]: false }));
    }
  }

  async function handleBatchGenerate(force = false) {
    const targets = force ? cards : cards.filter(c => !c.front.art_url);
    if (targets.length === 0) { alert('All cards already have illustrations.'); return; }
    if (!confirm(`Generate art for ${targets.length} cards? This will take ~${Math.ceil(targets.length * 3 / 60)} min.`)) return;
    setBatchGenerating(true);
    for (const card of targets) {
      await handleGenerateArt(card.id, force);
    }
    setBatchGenerating(false);
  }

  async function handleGenerateCardBack(cardId: string, force = true) {
    setGeneratingBack(prev => ({ ...prev, [cardId]: true }));
    try {
      const res = await fetch('/__cms__/generate-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, cardId, force }),
      });
      const result = await res.json() as { success?: boolean; back_image_url?: string; skipped?: boolean; error?: string };
      if (result.success && result.back_image_url) {
        const nextBackImageUrl = result.back_image_url;
        updateLocalCard(cardId, card => ({
          ...card,
          back: {
            ...card.back,
            back_image_url: nextBackImageUrl,
          },
        }));
        setNotice({ kind: 'success', message: 'Reverso IA actualizado y sincronizado.' });
      } else if (!result.skipped) {
        setNotice({ kind: 'error', message: result.error || 'No se pudo generar el reverso.' });
      }
    } catch (err: unknown) {
      setNotice({ kind: 'error', message: `No se pudo conectar con el generador: ${(err as Error).message}` });
    } finally {
      setGeneratingBack(prev => ({ ...prev, [cardId]: false }));
    }
  }

  async function handleBatchGenerateCardBacks(force = false) {
    const targets = force ? cards : cards.filter(c => !c.back.back_image_url);
    if (targets.length === 0) { alert('All cards already have AI back images.'); return; }
    if (!confirm(`Generate AI card backs for ${targets.length} cards?\nThis will take ~${Math.ceil(targets.length * 4 / 60)} min and use Imagen 4 credits.`)) return;
    setBatchGeneratingBacks(true);
    for (const card of targets) {
      await handleGenerateCardBack(card.id, force);
    }
    setBatchGeneratingBacks(false);
  }

  if (studioMode === 'design' && deckId) {
    return <AdminTemplates embeddedDeckId={deckId} />;
  }

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Cargando deck…</div>;
  if (error || !deck) return <div style={{ color: 'white', padding: '2rem' }}>{error || 'No se encontró el deck.'}</div>;

  const activeDeck = deckDraft ?? deck;
  const workspaceDeckId = activeDeck.slug || deckId || activeDeck.id;
  const studioTitle = studioMode === 'output'
    ? 'Publicar / PDF'
    : studioMode === 'design'
      ? 'Diseño global'
      : 'Mazo';

  async function saveEditionUpdates(updates: Partial<DeckSchema>, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetch('/__cms__/save-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: activeDeck.slug || deckId,
          updates,
        }),
      });

      const result = await response.json().catch((): SaveEditionResponse => ({})) as SaveEditionResponse;
      if (response.ok && result.success !== false) {
        setDeckDraft(prev => ({ ...(prev ?? activeDeck), ...updates }));
        setNotice({
          kind: result.warnings?.length ? 'warning' : 'success',
          message: result.warnings?.length ? result.warnings.join(' ') : successMessage,
        });
      } else {
        setNotice({ kind: 'error', message: result.error || 'No se pudo guardar la edición.' });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', message: 'No se pudo conectar para guardar la edición.' });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishChange(nextPublished: boolean) {
    if (nextPublished) {
      const readiness = getDeckPublicationReadiness(activeDeck, cards);
      if (!readiness.isPublishable) {
        setNotice({
          kind: 'warning',
          message: `Todavía no se puede activar la landing: ${readiness.blockers.map(item => `${item.label} (${item.detail})`).join('; ')}.`,
        });
        return;
      }

      const confirmed = window.confirm(`Activar la landing pública de "${activeDeck.name}"?`);
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(`Desactivar la landing pública de "${activeDeck.name}"?`);
      if (!confirmed) return;
    }

    await saveEditionUpdates({
      digital: {
        ...(activeDeck.digital ?? {}),
        is_published: nextPublished,
      },
    }, nextPublished ? 'Landing pública activada.' : 'Landing pública desactivada.');
  }

  async function handleSavePrintable(printable: DeckPrintableConfig) {
    await saveEditionUpdates({
      digital: {
        ...(activeDeck.digital ?? {}),
        printable,
      },
    }, 'PDF companion actualizado.');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editingCard) return;
    
    setSaving(true);
    try {
      const response = await fetch('/__cms__/save-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          cardId: editingCard.id,
          updates: {
            front: editingCard.front,
            back: editingCard.back,
            tags: editingCard.tags,
          }
        })
      });
      
      const result = await response.json().catch((): SaveEditionResponse => ({})) as SaveEditionResponse;
      if (response.ok && result.success !== false) {
        setCards(cards.map(c => c.id === editingCard.id ? editingCard : c));
        setEditingCard(null);
        setNotice({
          kind: result.warnings?.length ? 'warning' : 'success',
          message: result.warnings?.length ? result.warnings.join(' ') : 'Carta guardada y sincronizada.',
        });
      } else {
        setNotice({ kind: 'error', message: result.error || 'No se pudo guardar la carta.' });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', message: 'No se pudo conectar para guardar la carta.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEdition() {
    if (!deckId || !deck) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the entirely edition '${activeDeck.name}'? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/__cms__/delete-edition/${deckId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setNotice({ kind: 'success', message: 'Edición eliminada. Ejecutá sync para reflejarlo en código.' });
        navigate('/admin');
      } else {
        const data = await res.json() as { error: string };
        setNotice({ kind: 'error', message: `No se pudo eliminar: ${data.error}` });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', message: 'No se pudo conectar para eliminar la edición.' });
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)', color: 'white' }}>
      
      {/* Editor Modal / Drawer */}
      {editingCard && (
        <EditorSidebar 
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleSave}
          onUpdateCard={setEditingCard}
          generatingArt={!!generatingArt[editingCard.id]}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && activeDeck && (
        <DeckSettingsModal deck={activeDeck} onClose={() => setShowSettingsModal(false)} />
      )}

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100vw', overflowX: 'hidden', padding: 'clamp(1rem, 3vw, 2rem)', transition: 'margin-right 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>&larr; Dashboard</Link>
            <h1 style={{ margin: 0 }}>{activeDeck.name} · {studioTitle}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-start', flex: '1 1 100%', width: '100%', maxWidth: 'calc(100vw - 2rem)', minWidth: 0 }}>
            {studioMode === 'cards' && (
              <>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflowX: 'auto', overflowY: 'hidden', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%' }}>
                  <button
                    onClick={() => setViewMode('print')}
                    style={{
                      background: viewMode === 'print' ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: viewMode === 'print' ? 'white' : 'rgba(255,255,255,0.5)',
                      border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                    }}
                  >
                    Layout impreso
                  </button>
                  <button
                    onClick={() => setViewMode('original')}
                    style={{
                      background: viewMode === 'original' ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: viewMode === 'original' ? 'white' : 'rgba(255,255,255,0.5)',
                      border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                    }}
                  >
                    Arte original
                  </button>
                  <button
                    onClick={() => setViewMode('gallery')}
                    style={{
                      background: viewMode === 'gallery' ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: viewMode === 'gallery' ? 'var(--color-gold)' : 'rgba(255,255,255,0.5)',
                      border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                    }}
                  >
                    Galería
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Ajustes
            </button>
            <Link
              to={`/admin/${encodeURIComponent(workspaceDeckId)}?studio=output`}
              className={studioMode === 'output' ? 'btn-primary' : 'btn-ghost'}
              style={{ textDecoration: 'none' }}
            >
              Publicar / PDF
            </Link>
            <Link to={`/admin/${encodeURIComponent(workspaceDeckId)}?studio=design&tool=tuckbox`} className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
              Tuck box
            </Link>
            <button
              onClick={handleDeleteEdition}
              style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.45)', color: '#f87171', padding: '0.5rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              Eliminar
            </button>
          </div>
        </div>

        <AdminDeckWorkspaceNav
          deckId={workspaceDeckId}
          deckName={activeDeck.name}
          activeMode={studioMode}
        />

        {notice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${notice.kind === 'error' ? 'rgba(248,113,113,0.35)' : notice.kind === 'warning' ? 'rgba(212,175,100,0.35)' : 'rgba(116,196,147,0.35)'}`,
              background: notice.kind === 'error' ? 'rgba(248,113,113,0.08)' : notice.kind === 'warning' ? 'rgba(212,175,100,0.08)' : 'rgba(116,196,147,0.08)',
              color: notice.kind === 'error' ? '#fca5a5' : notice.kind === 'warning' ? '#d4af64' : '#9ee0b6',
              fontSize: '0.88rem',
            }}
          >
            {notice.message}
          </div>
        )}

        {studioMode === 'output' && (
          <PublicationStatusPanel
            key={`${activeDeck.id}-${activeDeck.digital?.printable?.enabled ? 'pdf-on' : 'pdf-off'}-${activeDeck.digital?.printable?.file_key ?? 'no-file'}-${activeDeck.digital?.printable?.version ?? 'no-version'}`}
            deck={activeDeck}
            cards={cards}
            saving={saving}
            onPublishChange={handlePublishChange}
            onSavePrintable={handleSavePrintable}
          />
        )}

        {/* ── Dynamic Layout Engine ─────────────────────────── */}
        {studioMode === 'output' ? (
          <section
            style={{
              display: 'grid',
              gap: '1rem',
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.025)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Pruebas rápidas antes de publicar</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to={`/decks/${activeDeck.slug}`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                Ver landing
              </Link>
              <Link to={`/decks/${activeDeck.slug}/session`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                Probar sesión digital
              </Link>
              <Link to={`/admin/${encodeURIComponent(workspaceDeckId)}/print`} className="btn-primary" style={{ textDecoration: 'none' }}>
                Generar PDF imprimible
              </Link>
            </div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.86rem', lineHeight: 1.5 }}>
              Este modo concentra la salida del mazo: landing pública, PDF de impresión y pruebas de lectura. Los cambios de diseño viven en “Diseño global”; contenido y revisión viven en “Mazo”.
            </p>
          </section>
        ) : viewMode === 'gallery' ? (
          <AdminDeckGallery
            deck={activeDeck}
            cards={cards}
            activeCardId={activeCardId}
            generatingArt={generatingArt}
            generatingBack={generatingBack}
            batchGenerating={batchGenerating}
            batchGeneratingBacks={batchGeneratingBacks}
            onSelectCard={setActiveCardId}
            onEditCard={setEditingCard}
            onGenerateArt={(cardId) => void handleGenerateArt(cardId)}
            onGenerateCardBack={(cardId) => void handleGenerateCardBack(cardId)}
            onBatchGenerateArt={() => void handleBatchGenerate(false)}
            onBatchGenerateBacks={() => void handleBatchGenerateCardBacks(false)}
          />
        ) : (
          /* STANDARD GRID (Print or Original Modes) */
          <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'original' ? 'repeat(auto-fill, minmax(280px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2rem' }}>
            {cards.map((card) => (
               <div key={card.id} style={{ position: 'relative' }}>
                 <div style={{ position: 'absolute', zIndex: 50, top: 10, right: 10, display: 'flex', gap: '0.5rem' }}>
                    <button 
                       onClick={() => setEditingCard(card)}
                       style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                       Edit
                    </button>
                    <button 
                       onClick={() => handleGenerateArt(card.id)}
                       disabled={!!generatingArt[card.id]}
                       style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid #4ade80', padding: '0.2rem 0.5rem', color: '#4ade80', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', opacity: generatingArt[card.id] ? 0.5 : 1 }}
                    >
                       {generatingArt[card.id] ? '...' : 'Art'}
                    </button>
                    <button 
                       onClick={() => handleGenerateCardBack(card.id)}
                       disabled={!!generatingBack[card.id]}
                       style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${card.back.back_image_url ? '#a78bfa' : 'rgba(167,139,250,0.4)'}`, padding: '0.2rem 0.5rem', color: '#a78bfa', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', opacity: generatingBack[card.id] ? 0.5 : 1 }}
                       title={card.back.back_image_url ? 'Regenerate AI card back' : 'Generate AI card back'}
                    >
                       {generatingBack[card.id] ? '...' : card.back.back_image_url ? '🎴✓' : '🎴'}
                    </button>
                 </div>
                 <CardCanvas
                   card={card}
                   deck={activeDeck}
                   forceOriginalMode={viewMode === 'original'}
                 />
               </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
