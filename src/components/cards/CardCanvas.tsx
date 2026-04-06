// src/components/admin/CardCanvas.tsx
import React, { useState } from 'react';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import styles from './CardCanvas.module.css';

interface CardCanvasProps {
  card: Card;
  deck: DeckSchema;
  previewUrl?: string | null;
  flipped?: boolean;
  onFlip?: () => void;
  // Let the parent dictate if we force original aspect ratio math
  forceOriginalMode?: boolean;
}

export function CardCanvas({ card, deck, previewUrl, flipped = false, onFlip, forceOriginalMode = false }: CardCanvasProps) {
  const displayArtUrl = previewUrl || card.front.art_url;
  
  const design = deck.design;
  const bgColor = design.background || design.primary_color || '#0c0b09';
  const surfaceColor = design.surface_color || '#141210';
  const accentColor = design.accent_color || '#d4af64';
  const textColor = design.text_color || '#f0ebe0';
  const fontHeading = design.font_heading || 'Cormorant Garamond';
  const fontBody = design.font_body || 'Inter';

  const width = deck.print_specs?.dimensions?.width || 88;
  const height = deck.print_specs?.dimensions?.height || 138;
  const aspectRatioDecimal = width / height;

  const finalAspectRatio = forceOriginalMode ? (88 / 63) : aspectRatioDecimal;
  const paddingRatio = (1 / finalAspectRatio) * 100;

  return (
    <div 
      className={styles.wrapper}
      style={{
        '--card-padding': `${paddingRatio}%`,
        '--card-bg': bgColor,
        '--card-surface': surfaceColor,
        '--card-accent': accentColor,
        '--card-text': textColor,
        '--card-font-head': `'${fontHeading}', serif`,
        '--card-font-body': `'${fontBody}', sans-serif`,
      } as React.CSSProperties}
    >
      <div className={styles.infoRow}>
        <span className={styles.cardNumber}>
          #{String(card.front.number).padStart(2, '0')}
        </span>
        <span className={styles.cardTitle}>
          {card.front.title}
        </span>
      </div>

      <div
        className={`${styles.cardContainer} ${flipped ? styles.flipped : ''} ${forceOriginalMode ? styles.originalMode : ''}`}
        onClick={() => onFlip?.()}
        role='button'
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onFlip?.()}
        style={{ paddingTop: `var(--card-padding)` }} // Keep the 3D hack pure here
      >
        <div className={`${styles.face} ${styles.faceFront}`}>
          {displayArtUrl ? (
            <img src={displayArtUrl} alt='' className={styles.artImage} />
          ) : (
            <div className={styles.noArtPlaceholder}>
              <span>🎨</span>
              <span className={styles.noArtText}>Sin ilustración</span>
            </div>
          )}
        </div>

        <div className={`${styles.face} ${styles.faceBack} ${card.back.answer ? styles.triviaMode : ''}`}>
          <div className={card.back.answer ? styles.triviaInner : ''}>
            <div className={styles.whenText}>{card.back.when_to_use}</div>
            <div className={styles.phraseText}>"{card.back.phrase}"</div>
            <div className={styles.instructionText}>{card.back.instruction}</div>
            
            {card.back.answer && (
              <div className={styles.answerText}>Rta: {card.back.answer}</div>
            )}
            
            {card.back.fun_fact && (
              <div className={styles.funFactText}>💡 {card.back.fun_fact}</div>
            )}
            
            <div className={styles.qrPlaceholder}><span>QR</span></div>
            <div className={styles.brandText}>Baraja · {deck.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
