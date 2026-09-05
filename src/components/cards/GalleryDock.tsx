// src/components/admin/GalleryDock.tsx
import type { Card } from '@entity-builders/deck-engine';
import styles from './GalleryDock.module.css';

interface GalleryDockProps {
  cards: Card[];
  activeCardId: string | null;
  onSelectCard: (id: string) => void;
}

export function GalleryDock({ cards, activeCardId, onSelectCard }: GalleryDockProps) {
  return (
    <div className={styles.dockContainer}>
      {cards.map(card => {
        const hasArt = !!card.front.art_url;
        return (
          <button
            type="button"
            key={`thumb-${card.id}`}
            onClick={() => onSelectCard(card.id)}
            aria-pressed={activeCardId === card.id}
            aria-label={`Seleccionar carta ${card.front.number}: ${card.front.title}`}
            className={`${styles.thumbItem} ${activeCardId === card.id ? styles.thumbActive : ''} ${!hasArt ? styles.noArtThumb : ''}`}
            style={hasArt ? { backgroundImage: `url(${card.front.art_url})` } : {}}
          >
            {/* Overlay for all thumbs */}
            <div className={styles.thumbOverlay}>
              <span className={styles.thumbNumber}>#{String(card.front.number).padStart(2, '0')}</span>
              <span className={styles.thumbTitle}>{card.front.title}</span>
            </div>

            {/* Show tiny placeholder if no art */}
            {!hasArt && <span className={styles.noArtIcon}>🎨</span>}
          </button>
        );
      })}
    </div>
  );
}
