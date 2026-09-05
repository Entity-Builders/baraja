import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, DeckSchema, RawDeckContent } from '@entity-builders/deck-engine';
import { useDeck } from '../../hooks/useDeck';

import { EditorSidebar } from '../../components/cards/EditorSidebar';
import { DeckSettingsModal } from '../../components/admin/DeckSettingsModal';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { AdminDeckGallery } from './components/AdminDeckGallery';
import { EditionCardGrid } from './components/edition-editor/EditionCardGrid';
import { EditionEditorHeader } from './components/edition-editor/EditionEditorHeader';
import { EditionEditorNotice } from './components/edition-editor/EditionEditorNotice';
import { EditionOutputQuickLinks } from './components/edition-editor/EditionOutputQuickLinks';
import {
  getStudioMode,
  type AdminNotice,
  type CardViewMode,
} from './components/edition-editor/editionEditorTypes';
import {
  PublicationStatusPanel,
  type DeckPrintableConfig,
} from './components/PublicationStatusPanel';
import AdminTemplates from './AdminTemplates';
import {
  getDeckPublicationReadiness,
} from '../../lib/deckPublicationReadiness';
import {
  persistAdminCardUpdates,
  persistAdminEditionUpdates,
} from '../../lib/adminDeckPersistence';
import { getErrorMessage } from '../../lib/errors';

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
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<CardViewMode>('gallery');
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
        body: JSON.stringify({ deckId, cardId, force, legacyFullBack: true }),
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
      await persistAdminEditionUpdates(
        activeDeck.slug || deckId || activeDeck.id,
        updates as Partial<RawDeckContent>,
      );
      setDeckDraft(prev => ({ ...(prev ?? activeDeck), ...updates }));
      setNotice({ kind: 'success', message: successMessage });
    } catch (err: unknown) {
      console.error(err);
      setNotice({ kind: 'error', message: `No se pudo guardar la edición: ${getErrorMessage(err)}` });
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
      await persistAdminCardUpdates(
        activeDeck.slug || deckId || activeDeck.id,
        editingCard.id,
        {
          front: editingCard.front,
          back: editingCard.back,
          tags: editingCard.tags,
        },
      );
      setCards(cards.map(c => c.id === editingCard.id ? editingCard : c));
      setEditingCard(null);
      setNotice({ kind: 'success', message: 'Carta guardada en la base de datos.' });
    } catch (err: unknown) {
      console.error(err);
      setNotice({ kind: 'error', message: `No se pudo guardar la carta: ${getErrorMessage(err)}` });
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
        <EditionEditorHeader
          deckName={activeDeck.name}
          studioMode={studioMode}
          studioTitle={studioTitle}
          viewMode={viewMode}
          workspaceDeckId={workspaceDeckId}
          onDeleteEdition={handleDeleteEdition}
          onOpenSettings={() => setShowSettingsModal(true)}
          onViewModeChange={setViewMode}
        />

        <AdminDeckWorkspaceNav
          deckId={workspaceDeckId}
          deckName={activeDeck.name}
          activeMode={studioMode}
        />

        {notice && <EditionEditorNotice notice={notice} />}

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
          <EditionOutputQuickLinks
            deckSlug={activeDeck.slug}
            workspaceDeckId={workspaceDeckId}
          />
        ) : viewMode === 'gallery' ? (
          <AdminDeckGallery
            deck={activeDeck}
            cards={cards}
            activeCardId={activeCardId}
            generatingArt={generatingArt}
            batchGenerating={batchGenerating}
            onSelectCard={setActiveCardId}
            onEditCard={setEditingCard}
            onGenerateArt={(cardId) => void handleGenerateArt(cardId)}
            onBatchGenerateArt={() => void handleBatchGenerate(false)}
          />
        ) : (
          /* STANDARD GRID (Print or Original Modes) */
          <EditionCardGrid
            cards={cards}
            deck={activeDeck}
            generatingArt={generatingArt}
            viewMode={viewMode}
            onEditCard={setEditingCard}
            onGenerateArt={(cardId) => void handleGenerateArt(cardId)}
          />
        )}
      </div>
    </div>
  );
}
