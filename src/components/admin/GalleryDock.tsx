// src/components/admin/GalleryDock.tsx
import React from 'react';
import type { Card } from '@eb-packages/deck-engine';
import styles from './GalleryDock.module.css';

interface GalleryDockProps {
  cards: Card[];
  activeCardId: string | null;
  onSelectCard: (id: string) => void;
}

export function GalleryDock({ cards, activeCardId, onSelectCard }: GalleryDockProps) {
  return (
    <div className={styles.dockContainer}>
      {cards.map(card => (
        <div 
          key={`thumb-${card.id}`}
          onClick={() => onSelectCard(card.id)}
          className={`${styles.thumbItem} ${activeCardId === card.id ? styles.thumbActive : ''}`}
          style={{ backgroundImage: `url(${card.front.art_url})` }}
        />
      ))}
    </div>
  );
}
