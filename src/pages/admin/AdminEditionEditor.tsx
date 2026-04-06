import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { Card } from '@eb-packages/deck-engine';
import { useDeck } from '../../hooks/useDeck';

// Modular Admin Components
import { GalleryHero } from '../../components/cards/GalleryHero';
import { GalleryDock } from '../../components/cards/GalleryDock';
import { EditorSidebar } from '../../components/cards/EditorSidebar';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { DeckSettingsModal } from '../../components/admin/DeckSettingsModal';

export default function AdminEditionEditor() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { deck, loading, error } = useDeck(deckId);
  
  // Local state to see edits instantly before full page reload
  const [cards, setCards] = useState<Card[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [, setSaving] = useState(false);
  const [generatingArt, setGeneratingArt] = useState<Record<string, boolean>>({});
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'print' | 'original' | 'gallery'>('gallery');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Sync local cards state when deck loads from Supabase
  useEffect(() => {
    if (deck) {
      setCards(deck.cards);
      if (!activeCardId && deck.cards.length > 0) {
        setActiveCardId(deck.cards[0].id);
      }
    }
  }, [deck]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerateArt(cardId: string, force = true) {
    setGeneratingArt(prev => ({ ...prev, [cardId]: true }));
    try {
      const res = await fetch('/api/admin/generate-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, cardId, force }),
      });
      const result = await res.json() as { success?: boolean; art_url?: string; art_versions?: string[]; error?: string };
      if (result.success && result.art_url) {
        setCards(prev => prev.map(c => {
          if (c.id !== cardId) return c;
          return { ...c, front: { ...c.front, art_url: result.art_url, ...(result.art_versions ? { art_versions: result.art_versions } : {}) } };
        }));
        if (editingCard?.id === cardId) {
          setEditingCard(prev => prev ? { ...prev, front: { ...prev.front, art_url: result.art_url! } } : null);
        }
      } else {
        alert(`Failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: unknown) {
      alert(`Network error: ${(err as Error).message}`);
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

  async function handleRestoreVersion(cardId: string, versionUrl: string) {
    setSaving(true);
    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      const currentUrl = card.front.art_url;
      const currentVersions = card.front.art_versions || [];

      const newVersions = currentVersions.filter(v => v !== versionUrl);
      if (currentUrl) newVersions.unshift(currentUrl);

      const updatedFront = {
        ...card.front,
        art_url: versionUrl,
        art_versions: newVersions,
      };

      const response = await fetch('/api/admin/save-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          cardId,
          updates: { front: updatedFront },
        }),
      });

      if (response.ok) {
        setCards(prev => prev.map(c =>
          c.id === cardId ? { ...c, front: updatedFront } : c
        ));
      } else {
        alert('Failed to restore version.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while restoring version.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Cargando deck...</div>;
  if (error || !deck) return <div style={{ color: 'white', padding: '2rem' }}>Deck not found. {error}</div>;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCard) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/admin/save-edition', {
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
      
      if (response.ok) {
        setCards(cards.map(c => c.id === editingCard.id ? editingCard : c));
        setEditingCard(null);
      } else {
        alert('Failed to save edit.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEdition() {
    if (!deckId || !deck) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the entirely edition '${deck.name}'? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/admin/delete-edition/${deckId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Edition deleted successfully. You MUST run "yarn workspace @eb-packages/deck-engine sync" to reflect this in code.');
        navigate('/admin');
      } else {
        const data = await res.json() as { error: string };
        alert('Failed to delete: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting.');
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
      {showSettingsModal && deck && (
        <DeckSettingsModal deck={deck} onClose={() => setShowSettingsModal(false)} />
      )}

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '2rem', marginRight: editingCard ? '400px' : '0', transition: 'margin-right 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>&larr; All Editions</Link>
            <h1 style={{ margin: 0 }}>{deck.name} Cards</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginRight: '1rem' }}>
              <button
                onClick={() => setViewMode('print')}
                style={{
                  background: viewMode === 'print' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: viewMode === 'print' ? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                }}
              >
                Print Layout
              </button>
              <button
                onClick={() => setViewMode('original')}
                style={{
                  background: viewMode === 'original' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: viewMode === 'original' ? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                }}
              >
                Original Art
              </button>
              <button
                onClick={() => setViewMode('gallery')}
                style={{
                  background: viewMode === 'gallery' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: viewMode === 'gallery' ? 'var(--color-gold)' : 'rgba(255,255,255,0.5)',
                  border: 'none', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem'
                }}
              >
                Gallery View
              </button>
            </div>
            <button
              onClick={() => handleBatchGenerate(false)}
              disabled={batchGenerating}
              style={{ background: 'transparent', border: '1px solid #4ade80', color: '#4ade80', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', opacity: batchGenerating ? 0.5 : 1 }}
            >
              {batchGenerating ? '🎨 Generating...' : '🎨 Generate Missing Art'}
            </button>
            <button
              onClick={() => handleBatchGenerate(true)}
              disabled={batchGenerating}
              style={{ background: 'transparent', border: '1px solid #f97316', color: '#f97316', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', opacity: batchGenerating ? 0.5 : 1 }}
            >
              🔄 Regen ALL Art
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              ⚙️ Settings
            </button>
            <Link to={`/admin/${deckId}/print`} className="btn-primary" style={{ textDecoration: 'none' }}>
              Generate PDF
            </Link>
            <button
              onClick={handleDeleteEdition}
              style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        {/* ── Dynamic Layout Engine ─────────────────────────── */}
        {viewMode === 'gallery' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0, maxWidth: '100%', gap: '2rem' }}>
            
            {/* HERO SECTION */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', position: 'relative' }}>
               <button 
                onClick={() => {
                  const idx = cards.findIndex(c => c.id === activeCardId);
                  if (idx > 0) setActiveCardId(cards[idx - 1].id);
                }}
                disabled={activeCardId === cards[0]?.id}
                style={{ position: 'absolute', left: '0', alignSelf: 'center', zIndex: 20, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: '2rem', cursor: 'pointer', width: '50px', height: '50px', borderRadius: '25px', opacity: activeCardId === cards[0]?.id ? 0.2 : 1 }}
              >
                &lsaquo;
              </button>

               {cards.map(card => card.id === activeCardId && (
                  <GalleryHero
                    key={`hero-${card.id}`}
                    card={card}
                    deck={deck}
                    onEdit={setEditingCard}
                    onGenerateArt={(cId) => handleGenerateArt(cId)}
                    onRestoreVersion={handleRestoreVersion}
                    isGeneratingArt={!!generatingArt[card.id]}
                  />
               ))}

               <button 
                onClick={() => {
                  const idx = cards.findIndex(c => c.id === activeCardId);
                  if (idx < cards.length - 1) setActiveCardId(cards[idx + 1].id);
                }}
                disabled={activeCardId === cards[cards.length - 1]?.id}
                style={{ position: 'absolute', right: '0', alignSelf: 'center', zIndex: 20, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', fontSize: '2rem', cursor: 'pointer', width: '50px', height: '50px', borderRadius: '25px', opacity: activeCardId === cards[cards.length - 1]?.id ? 0.2 : 1 }}
              >
                &rsaquo;
              </button>
            </div>

            {/* DOCK MINIATURES */}
            <GalleryDock 
               cards={cards} 
               activeCardId={activeCardId} 
               onSelectCard={setActiveCardId} 
            />

          </div>
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
                       Regen
                    </button>
                 </div>
                 <CardCanvas
                   card={card}
                   deck={deck}
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
