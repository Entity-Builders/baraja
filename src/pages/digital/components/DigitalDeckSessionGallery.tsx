import { useEffect } from 'react';
import type { Card, DeckSchema } from '@entity-builders/deck-engine';

interface SessionGalleryProps {
  activeDeck: DeckSchema;
  cards: Card[];
  onClose: () => void;
  onSelectCard: (card: Card) => void;
  open: boolean;
  playedCardIds: string[];
  savedCardIds: string[];
  selectedCardId: string | null;
}

export function SessionGallery({
  activeDeck,
  cards,
  onClose,
  onSelectCard,
  open,
  playedCardIds,
  savedCardIds,
  selectedCardId,
}: SessionGalleryProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="baraja-session-gallery" role="dialog" aria-modal="true" aria-label="Galería de cartas">
      <button
        className="baraja-session-gallery-backdrop"
        type="button"
        aria-label="Cerrar galería"
        onClick={onClose}
      />
      <section className="baraja-session-gallery-panel">
        <header className="baraja-session-gallery-header">
          <div>
            <p>{activeDeck.name}</p>
            <h2>Galería</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar galería">
            ×
          </button>
        </header>

        <div className="baraja-session-gallery-grid">
          {cards.map((card, index) => {
            const isCurrent = card.id === selectedCardId;
            const isPlayed = playedCardIds.includes(card.id);
            const isSaved = savedCardIds.includes(card.id);

            return (
              <button
                key={card.id}
                className={`baraja-session-gallery-card${isCurrent ? ' is-current' : ''}`}
                type="button"
                onClick={() => onSelectCard(card)}
                aria-label={`Ir a carta ${card.front.number}: ${card.front.title}`}
              >
                <span className="baraja-session-gallery-thumb">
                  {card.front.art_url ? (
                    <img src={card.front.art_url} alt="" loading="lazy" draggable={false} />
                  ) : (
                    <span>{String(card.front.number).padStart(2, '0')}</span>
                  )}
                </span>
                <span className="baraja-session-gallery-copy">
                  <strong>{card.front.title}</strong>
                  <small>{index + 1}/{cards.length}</small>
                </span>
                {(isCurrent || isPlayed || isSaved) && (
                  <span className="baraja-session-gallery-badges" aria-hidden="true">
                    {isCurrent && <span>Actual</span>}
                    {isPlayed && <span>Jugada</span>}
                    {isSaved && <span>Guardada</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
