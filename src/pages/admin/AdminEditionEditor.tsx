import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { useDeck } from '../../hooks/useDeck';

import { EditorSidebar } from '../../components/cards/EditorSidebar';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { DeckSettingsModal } from '../../components/admin/DeckSettingsModal';
import { AdminDeckWorkspaceNav } from './components/AdminDeckWorkspaceNav';
import { AdminDeckGallery } from './components/AdminDeckGallery';
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

type DeckPrintableConfig = NonNullable<NonNullable<DeckSchema['digital']>['printable']>;

function getStudioMode(value: string | null): StudioMode {
  if (value === 'design' || value === 'output') return value;
  return 'cards';
}

type PublicationStatusPanelProps = {
  deck: DeckSchema;
  cards: Card[];
  saving: boolean;
  onPublishChange: (nextPublished: boolean) => Promise<void>;
  onSavePrintable: (printable: DeckPrintableConfig) => Promise<void>;
};

function formatCurrency(pricing: DeckSchema['pricing']): string {
  const currency = pricing.currency.toUpperCase();
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(pricing.amount / 100);
}

function PublicationStatusPanel({ deck, cards, saving, onPublishChange, onSavePrintable }: PublicationStatusPanelProps) {
  const readiness = getDeckPublicationReadiness(deck, cards);
  const nextBlocker = readiness.blockers[0];
  const isPublished = deck.digital?.is_published === true;
  const printable = deck.digital?.printable;
  const [printableEnabled, setPrintableEnabled] = useState(printable?.enabled ?? false);
  const [printableFileKey, setPrintableFileKey] = useState(printable?.file_key ?? '');
  const [printableVersion, setPrintableVersion] = useState(printable?.version ?? '');

  function handlePrintableSubmit(e: React.FormEvent) {
    e.preventDefault();
    const licenseScopes = printable?.license_scopes?.length
      ? printable.license_scopes
      : (['personal_print'] as DeckPrintableConfig['license_scopes']);

    void onSavePrintable({
      ...printable,
      enabled: printableEnabled,
      license_scopes: licenseScopes,
      file_key: printableFileKey.trim() || undefined,
      version: printableVersion.trim() || undefined,
    });
  }

  const title = isPublished
    ? (readiness.isPublishable ? 'Landing publicada' : `Landing publicada con ${readiness.blockers.length} pendientes`)
    : (readiness.isPublishable ? 'Lista para activar landing' : 'Landing bloqueada');

  return (
    <section
      aria-labelledby="publication-panel-title"
      style={{
        border: '1px solid rgba(212,175,100,0.2)',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, rgba(212,175,100,0.08), rgba(255,255,255,0.035))',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'grid',
        gap: '1rem',
        width: '100%',
        maxWidth: 'calc(100vw - 2rem)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        alignItems: 'start',
      }}>
        <div>
          <p style={{ margin: '0 0 0.35rem', color: 'var(--color-gold)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Landing pública
          </p>
          <h2 id="publication-panel-title" style={{ margin: 0, fontSize: '1.35rem' }}>
            {title}
          </h2>
          <p style={{ margin: '0.45rem 0 0', opacity: 0.72, fontSize: '0.9rem' }}>
            {nextBlocker
              ? `Próximo paso: ${nextBlocker.label} (${nextBlocker.detail}).`
              : `Precio configurado: ${formatCurrency(deck.pricing)}.`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={() => void onPublishChange(!isPublished)}
            disabled={saving || (!isPublished && !readiness.isPublishable)}
            style={{
              background: isPublished ? 'rgba(248,113,113,0.12)' : 'var(--color-gold)',
              border: isPublished ? '1px solid rgba(248,113,113,0.35)' : '1px solid var(--color-gold)',
              color: isPublished ? '#fca5a5' : '#1a1714',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              cursor: saving || (!isPublished && !readiness.isPublishable) ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontWeight: 700,
              opacity: saving || (!isPublished && !readiness.isPublishable) ? 0.58 : 1,
            }}
            title={!isPublished && !readiness.isPublishable ? 'Completá los requisitos antes de activar la landing.' : undefined}
          >
            {isPublished ? 'Desactivar landing' : 'Activar landing'}
          </button>
          <Link
            to={`/decks/${deck.slug}`}
            style={{
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'rgba(255,255,255,0.82)',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            Ver landing
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        <PublicationChip label="Arte frontal" ready={readiness.missingFrontArtCount === 0} detail={`${readiness.totalCards - readiness.missingFrontArtCount}/${readiness.totalCards}`} />
        <PublicationChip label="Reversos" ready={readiness.missingBackCount === 0} detail={`${readiness.totalCards - readiness.missingBackCount}/${readiness.totalCards}`} />
        <PublicationChip label="Contenido" ready={readiness.incompleteContentCount === 0} detail={`${readiness.totalCards - readiness.incompleteContentCount}/${readiness.totalCards}`} />
        <PublicationChip label="Datos landing" ready={readiness.landingDataComplete} detail={readiness.landingDataComplete ? 'listos' : 'incompletos'} />
        <PublicationChip label="Landing" ready={isPublished} detail={isPublished ? 'activa' : readiness.isPublishable ? 'lista' : 'bloqueada'} />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', opacity: 0.78, fontSize: '0.8rem' }}>
        <span>{readiness.missingFrontArtCount} sin arte frontal</span>
        <span>{readiness.missingBackCount} con reverso incompleto</span>
        <span>{readiness.incompleteContentCount} con contenido incompleto</span>
        <span>{readiness.missingBackImageCount} sin imagen IA de reverso (opcional si el layout/texto está listo)</span>
        <span>{saving ? 'Guardando cambios…' : 'Sin guardado en curso'}</span>
      </div>

      {readiness.blockers.length > 0 && (
        <div
          style={{
            border: '1px solid rgba(248,113,113,0.24)',
            borderRadius: '8px',
            background: 'rgba(248,113,113,0.07)',
            padding: '0.75rem',
            display: 'grid',
            gap: '0.35rem',
          }}
        >
          <strong style={{ color: '#fca5a5', fontSize: '0.82rem' }}>Falta para activar la landing</strong>
          {readiness.blockers.map(blocker => (
            <span key={blocker.key} style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem' }}>
              {blocker.label}: {blocker.detail}
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={handlePrintableSubmit}
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '1rem',
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          alignItems: 'end',
        }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: '0.86rem', fontWeight: 700 }}>
            PDF de impresión
          </p>
          <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.76rem' }}>
            Opcional para publicar la landing. Usalo cuando tengas un PDF aprobado para compradores.
          </p>
        </div>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={printableEnabled}
            onChange={e => setPrintableEnabled(e.target.checked)}
          />
          PDF listo para entregar
        </label>
        <label htmlFor="pdf-file-key" style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', opacity: 0.86 }}>
          Archivo privado
          <input
            id="pdf-file-key"
            name="pdf-file-key"
            value={printableFileKey}
            onChange={e => setPrintableFileKey(e.target.value)}
            placeholder="prints/deck-slug/v1.pdf"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'white',
              borderRadius: '4px',
              padding: '0.5rem 0.65rem',
              fontSize: '0.85rem',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.46)', fontSize: '0.7rem', lineHeight: 1.35 }}>
            Ruta interna del PDF aprobado. No se muestra al comprador.
          </span>
        </label>
        <label htmlFor="pdf-version" style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', opacity: 0.86 }}>
          Versión
          <input
            id="pdf-version"
            name="pdf-version"
            value={printableVersion}
            onChange={e => setPrintableVersion(e.target.value)}
            placeholder="v1"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'white',
              borderRadius: '4px',
              padding: '0.5rem 0.65rem',
              fontSize: '0.85rem',
            }}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: 'transparent',
            border: '1px solid rgba(212,175,100,0.42)',
            color: 'var(--color-gold)',
            padding: '0.55rem 0.75rem',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem',
            opacity: saving ? 0.6 : 1,
          }}
        >
          Guardar PDF
        </button>
      </form>
    </section>
  );
}

function PublicationChip({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: '0.35rem',
        alignItems: 'center',
        padding: '0.35rem 0.55rem',
        borderRadius: '999px',
        border: `1px solid ${ready ? 'rgba(116,196,147,0.35)' : 'rgba(248,113,113,0.28)'}`,
        color: ready ? '#9ee0b6' : '#fca5a5',
        background: ready ? 'rgba(116,196,147,0.08)' : 'rgba(248,113,113,0.08)',
        fontSize: '0.72rem',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <strong>{label}</strong>
      <span style={{ opacity: 0.78, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>
    </span>
  );
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

  async function handleSave(e: React.FormEvent) {
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
