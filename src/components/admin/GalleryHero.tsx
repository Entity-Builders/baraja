// src/components/admin/GalleryHero.tsx
import React, { useState } from 'react';
import type { Card, Edition } from '@eb-packages/deck-engine';
import { CardCanvas } from './CardCanvas';
import styles from './GalleryHero.module.css';

interface GalleryHeroProps {
  card: Card;
  deck: Edition;
  onEdit: (card: Card) => void;
  onGenerateArt: (cardId: string) => void;
  onRestoreVersion: (cardId: string, url: string) => void;
  isGeneratingArt: boolean;
}

export function GalleryHero({ 
  card, 
  deck, 
  onEdit, 
  onGenerateArt, 
  onRestoreVersion, 
  isGeneratingArt 
}: GalleryHeroProps) {
  const [flipped, setFlipped] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const versions = card.front.art_versions || [];
  const hasVersions = versions.length > 0;

  return (
    <div className={styles.heroWrapper}>
      {/* Action Bar (Top) */}
      <div className={styles.actionsBar}>
        <button className={styles.btnAction} onClick={() => onEdit(card)}>
          ✏️ Editar Texto
        </button>
        <button 
          className={`${styles.btnAction} ${styles.btnPrimary}`} 
          onClick={() => onGenerateArt(card.id)}
          disabled={isGeneratingArt}
        >
          {isGeneratingArt ? '⏳ Generando IA...' : '🎨 Regenerar Arte'}
        </button>
        <button className={styles.btnAction} onClick={() => setFlipped(!flipped)}>
          🔄 Dar Vuelta
        </button>
      </div>

      {/* The isolated pure Canvas */}
      <div className={styles.canvasWrapper}>
        <CardCanvas 
          card={card} 
          deck={deck} 
          flipped={flipped} 
          onFlip={() => setFlipped(!flipped)}
          previewUrl={previewUrl}
          forceOriginalMode={true} // Hero is always original view to prevent crop bug on square images while regenerating
        />
      </div>

      {/* Versions Gallery Bar (Bottom) */}
      {hasVersions && (
        <div className={styles.versionsBar}>
          <div className={styles.versionsLabel}>
            📦 Historial ({versions.length})
          </div>
          <div className={styles.versionsStrip}>
            {card.front.art_url && (
              <div
                className={`${styles.thumbBtn} ${!previewUrl ? styles.thumbActive : ''}`}
                onMouseEnter={() => setPreviewUrl(null)}
                onClick={() => setPreviewUrl(null)}
                title='Versión actual'
              >
                <img src={card.front.art_url} alt='Current' />
                <span className={styles.badgeCheck}>✓</span>
              </div>
            )}
            {versions.map((url, i) => (
              <div
                key={url}
                className={`${styles.thumbBtn} ${previewUrl === url ? styles.thumbActive : ''}`}
                onMouseEnter={() => setPreviewUrl(url)}
                onMouseLeave={() => setPreviewUrl(null)}
                onClick={() => {
                  if (confirm(`¿Restaurar esta versión como ilustración activa?`)) {
                    onRestoreVersion(card.id, url);
                  }
                }}
                title={`Versión ${versions.length - i}`}
              >
                <img src={url} alt={`v${versions.length - i}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
