// src/components/admin/GalleryHero.tsx
import React, { useState } from 'react';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { PDFViewer, Document, Page, View } from '@react-pdf/renderer';
import { PdfCardFace } from './PdfCard';
import styles from './GalleryHero.module.css';

interface GalleryHeroProps {
  card: Card;
  deck: DeckSchema;
  onEdit: (card: Card) => void;
  onGenerateArt: (cardId: string) => void;
  onRestoreVersion: (cardId: string, url: string) => void;
  isGeneratingArt: boolean;
}

const SingleCardPdf = ({ card, deck, previewUrl }: { card: Card, deck: DeckSchema, previewUrl?: string | null }) => {
  const widthMm = deck.print_specs.dimensions.width || 88;
  const heightMm = deck.print_specs.dimensions.height || 138;
  const bleedMm = deck.print_specs.bleed || 3;
  const totalWidth = widthMm + bleedMm * 2;
  const totalHeight = heightMm + bleedMm * 2;

  return (
    <Document title={`Carta_${card.front.number}`}>
      <Page size={[totalWidth * 2.83465 * 2 + 60, totalHeight * 2.83465 + 60]} style={{ backgroundColor: '#1f1f1f', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
         {/* Front Face */}
         <View style={{ margin: 10 }}>
           <PdfCardFace card={card} deck={deck} face="front" previewUrl={previewUrl} widthMm={widthMm} heightMm={heightMm} bleedMm={bleedMm} />
         </View>
         {/* Back Face */}
         <View style={{ margin: 10 }}>
           <PdfCardFace card={card} deck={deck} face="back" previewUrl={previewUrl} widthMm={widthMm} heightMm={heightMm} bleedMm={bleedMm} />
         </View>
      </Page>
    </Document>
  );
};

export function GalleryHero({ 
  card, 
  deck, 
  onEdit, 
  onGenerateArt, 
  onRestoreVersion, 
  isGeneratingArt 
}: GalleryHeroProps) {
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
      </div>

      {/* The isolated pure Canvas now using PDFViewer for 100% accurate print preview */}
      <div className={styles.canvasWrapper} style={{ height: '600px', padding: 0 }}>
        <PDFViewer style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#111' }}>
           <SingleCardPdf card={card} deck={deck} previewUrl={previewUrl} />
        </PDFViewer>
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
