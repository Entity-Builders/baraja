import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Card, DeckSchema } from '@entity-builders/deck-engine';
import { CardCanvas } from '../../../components/cards/CardCanvas';
import {
  getCardPublicationReadiness,
  getDeckPublicationReadiness,
  getMissingRequiredFieldLabels,
} from '../../../lib/deckPublicationReadiness';
import styles from './AdminDeckGallery.module.css';

type PreviewFace = 'front' | 'back';
type GalleryFilter = 'all' | 'missing-art' | 'missing-back' | 'ready';

interface AdminDeckGalleryProps {
  deck: DeckSchema;
  cards: Card[];
  activeCardId: string | null;
  generatingArt: Record<string, boolean>;
  batchGenerating: boolean;
  onSelectCard: (cardId: string) => void;
  onEditCard: (card: Card) => void;
  onGenerateArt: (cardId: string) => void;
  onBatchGenerateArt: () => void;
}

const FILTERS: Array<{ id: GalleryFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'missing-art', label: 'Sin arte' },
  { id: 'missing-back', label: 'Reverso incompleto' },
  { id: 'ready', label: 'Publicables' },
];

function matchesFilter(deck: DeckSchema, card: Card, filter: GalleryFilter): boolean {
  const readiness = getCardPublicationReadiness(deck, card);

  if (filter === 'missing-art') return !readiness.hasFrontArt;
  if (filter === 'missing-back') return !readiness.hasRenderableBack;
  if (filter === 'ready') return readiness.isPublishable;
  return true;
}

function getFilterCount(deck: DeckSchema, cards: Card[], filter: GalleryFilter): number {
  return cards.filter(card => matchesFilter(deck, card, filter)).length;
}

function formatCardNumber(card: Card): string {
  return `#${String(card.front.number).padStart(2, '0')}`;
}

export function AdminDeckGallery({
  deck,
  cards,
  activeCardId,
  generatingArt,
  batchGenerating,
  onSelectCard,
  onEditCard,
  onGenerateArt,
  onBatchGenerateArt,
}: AdminDeckGalleryProps) {
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [previewFace, setPreviewFace] = useState<PreviewFace>('front');
  const inspectorRef = useRef<HTMLElement | null>(null);

  const selectedCard = useMemo(
    () => cards.find(card => card.id === activeCardId) ?? cards[0] ?? null,
    [activeCardId, cards]
  );

  const filteredCards = useMemo(
    () => cards.filter(card => matchesFilter(deck, card, filter)),
    [cards, deck, filter]
  );

  const readiness = useMemo(() => getDeckPublicationReadiness(deck, cards), [cards, deck]);

  const selectedIndex = selectedCard
    ? cards.findIndex(card => card.id === selectedCard.id)
    : -1;

  useEffect(() => {
    if (!selectedCard && cards.length > 0) {
      onSelectCard(cards[0].id);
    }
  }, [cards, onSelectCard, selectedCard]);

  function selectCard(card: Card, face: PreviewFace = previewFace, revealInspector = false) {
    onSelectCard(card.id);
    setPreviewFace(face);

    if (revealInspector && window.matchMedia('(max-width: 1020px)').matches) {
      window.setTimeout(() => {
        const inspector = inspectorRef.current;
        if (!inspector) return;
        const targetTop = inspector.getBoundingClientRect().top + window.scrollY - 12;
        document.documentElement.scrollTop = targetTop;
      }, 0);
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, card: Card) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectCard(card);
    }
  }

  function selectRelativeCard(offset: number) {
    if (selectedIndex < 0) return;
    const nextCard = cards[selectedIndex + offset];
    if (nextCard) {
      selectCard(nextCard);
    }
  }

  function togglePreviewFace() {
    setPreviewFace(current => current === 'front' ? 'back' : 'front');
  }

  return (
    <section className={styles.shell} aria-label="Mazo completo">
      <header className={styles.header}>
        <div className={styles.statusRail} aria-label="Estado del mazo">
          <span><strong>{readiness.totalCards}</strong> cartas</span>
          <span><strong>{readiness.missingFrontArtCount}</strong> sin arte frontal</span>
          <span><strong>{readiness.missingBackCount}</strong> reverso incompleto</span>
          <span><strong>{readiness.incompleteContentCount}</strong> contenido incompleto</span>
          <span><strong>{readiness.readyCardCount}</strong> publicables</span>
        </div>

        <div className={styles.filterRail} aria-label="Filtrar cartas">
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterButton} ${filter === item.id ? styles.filterButtonActive : ''}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <strong>{getFilterCount(deck, cards, item.id)}</strong>
            </button>
          ))}
        </div>

        <div className={styles.productionRail} aria-label="Acciones de produccion">
          <button
            type="button"
            className={styles.productionButton}
            onClick={onBatchGenerateArt}
            disabled={batchGenerating || readiness.missingFrontArtCount === 0}
          >
            {batchGenerating ? 'Generando arte...' : 'Generar arte faltante'}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <div className={styles.grid} aria-label="Cartas del mazo">
          {filteredCards.map(card => {
            const cardReadiness = getCardPublicationReadiness(deck, card);
            const selected = selectedCard?.id === card.id;
            const cardGeneratingArt = Boolean(generatingArt[card.id]);
            const contentDetail = cardReadiness.missingRequiredFields.length > 0
              ? getMissingRequiredFieldLabels(cardReadiness.missingRequiredFields)
              : 'Contenido listo';

            return (
              <article
                key={card.id}
                role="button"
                tabIndex={0}
                className={`${styles.cardTile} ${selected ? styles.cardTileSelected : ''}`}
                aria-label={`Inspeccionar ${formatCardNumber(card)} ${card.front.title}`}
                onClick={() => selectCard(card, previewFace, true)}
                onKeyDown={event => handleCardKeyDown(event, card)}
              >
                <div className={styles.tileCanvas}>
                  <CardCanvas
                    card={card}
                    deck={deck}
                    flipped={selected && previewFace === 'back'}
                  />
                </div>

                <div className={styles.tileBody}>
                  <div className={styles.tileTitleRow}>
                    <span>{formatCardNumber(card)}</span>
                    <strong>{card.front.title}</strong>
                  </div>

                  <div className={styles.badgeRow} aria-label="Estado de carta">
                    <span className={`${styles.badge} ${cardReadiness.hasFrontArt ? styles.badgeReady : styles.badgeMissing}`}>
                      {cardReadiness.hasFrontArt ? 'Arte listo' : 'Sin arte'}
                    </span>
                    <span className={`${styles.badge} ${cardReadiness.hasRenderableBack ? styles.badgeReady : styles.badgeMissing}`}>
                      {cardReadiness.hasRenderableBack
                        ? (cardReadiness.hasBackImage ? 'Reverso IA' : 'Reverso layout')
                        : 'Reverso incompleto'}
                    </span>
                    <span
                      className={`${styles.badge} ${cardReadiness.hasCompleteContent ? styles.badgeReady : styles.badgeMissing}`}
                      title={contentDetail}
                    >
                      {cardReadiness.hasCompleteContent ? 'Contenido listo' : 'Contenido falta'}
                    </span>
                  </div>

                  <div className={styles.tileActions}>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onEditCard(card);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        selectCard(card, selected && previewFace === 'back' ? 'front' : 'back', true);
                      }}
                    >
                      {selected && previewFace === 'back' ? 'Frente' : 'Reverso'}
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onGenerateArt(card.id);
                      }}
                      disabled={cardGeneratingArt}
                    >
                      {cardGeneratingArt ? '...' : 'Arte'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredCards.length === 0 && (
            <div className={styles.emptyState}>
              <h2>No hay cartas en este filtro</h2>
              <p>Cambia el filtro para seguir revisando el mazo.</p>
            </div>
          )}
        </div>

        <aside ref={inspectorRef} className={styles.inspector} aria-label="Inspector de carta">
          {selectedCard ? (
            <>
              {(() => {
                const selectedReadiness = getCardPublicationReadiness(deck, selectedCard);
                const selectedContentDetail = selectedReadiness.missingRequiredFields.length > 0
                  ? getMissingRequiredFieldLabels(selectedReadiness.missingRequiredFields)
                  : 'Campos requeridos completos';

                return (
                  <>
              <div className={styles.inspectorHeader}>
                <div>
                  <span>{formatCardNumber(selectedCard)}</span>
                  <h2>{selectedCard.front.title}</h2>
                </div>
                <div className={styles.faceSwitch} aria-label="Cara visible">
                  <button
                    type="button"
                    className={previewFace === 'front' ? styles.faceSwitchActive : ''}
                    aria-pressed={previewFace === 'front'}
                    onClick={() => setPreviewFace('front')}
                  >
                    Frente
                  </button>
                  <button
                    type="button"
                    className={previewFace === 'back' ? styles.faceSwitchActive : ''}
                    aria-pressed={previewFace === 'back'}
                    onClick={() => setPreviewFace('back')}
                  >
                    Reverso
                  </button>
                </div>
              </div>

              <div className={styles.inspectorCanvas}>
                <CardCanvas
                  card={selectedCard}
                  deck={deck}
                  flipped={previewFace === 'back'}
                  onFlip={togglePreviewFace}
                />
              </div>

              <dl className={styles.inspectorStats}>
                <div>
                  <dt>Arte frontal</dt>
                  <dd>{selectedReadiness.hasFrontArt ? 'Listo' : 'Pendiente'}</dd>
                </div>
                <div>
                  <dt>Reverso</dt>
                  <dd>{selectedReadiness.hasRenderableBack ? (selectedReadiness.hasBackImage ? 'Imagen IA' : 'Layout/texto') : 'Pendiente'}</dd>
                </div>
                <div>
                  <dt>Contenido</dt>
                  <dd title={selectedContentDetail}>{selectedReadiness.hasCompleteContent ? 'Listo' : 'Incompleto'}</dd>
                </div>
              </dl>

              <div className={styles.inspectorActions}>
                <button type="button" className={styles.primaryAction} onClick={() => onEditCard(selectedCard)}>
                  Editar carta
                </button>
                <button
                  type="button"
                  onClick={() => onGenerateArt(selectedCard.id)}
                  disabled={Boolean(generatingArt[selectedCard.id])}
                >
                  {generatingArt[selectedCard.id] ? 'Generando...' : 'Generar arte'}
                </button>
              </div>

              <div className={styles.inspectorPager}>
                <button
                  type="button"
                  onClick={() => selectRelativeCard(-1)}
                  disabled={selectedIndex <= 0}
                >
                  Anterior
                </button>
                <span>{selectedIndex + 1} / {cards.length}</span>
                <button
                  type="button"
                  onClick={() => selectRelativeCard(1)}
                  disabled={selectedIndex < 0 || selectedIndex >= cards.length - 1}
                >
                  Siguiente
                </button>
              </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className={styles.emptyState}>
              <h2>Sin cartas</h2>
              <p>Este mazo todavia no tiene cartas para revisar.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
