// src/components/cards/CardCanvas.tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { Viewer } from '@pdfme/ui';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { getTemplateForDeck, buildPdfmeFonts, pdfmePlugins } from '../../lib/pdfmeConfig';
import styles from './CardCanvas.module.css';

interface CardCanvasProps {
  card: Card;
  deck: DeckSchema;
  previewUrl?: string | null;
  flipped?: boolean;
  onFlip?: () => void;
  forceOriginalMode?: boolean;
}

export function CardCanvas({ card, deck, previewUrl, flipped = false, onFlip, forceOriginalMode = false }: CardCanvasProps) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  
  const viewerFrontRef = useRef<Viewer | null>(null);
  const viewerBackRef = useRef<Viewer | null>(null);

  const displayArtUrl = previewUrl || card.front.art_url;

  // We memoize the template to prevent constant recreation if getting it is heavy
  const baseTemplate = useMemo(() => getTemplateForDeck(deck), [deck]);
  
  // Create single-page templates for front and back to mount on each side of the 3D card
  const frontTemplate = useMemo(() => ({
    ...baseTemplate,
    schemas: [baseTemplate.schemas[0] || []],
  }), [baseTemplate]);
  
  const backTemplate = useMemo(() => ({
    ...baseTemplate,
    schemas: [baseTemplate.schemas[baseTemplate.schemas.length > 1 ? 1 : 0] || []],
  }), [baseTemplate]);

  // Construct the input matching the template fields
  const inputs = useMemo(() => {
    return [{
      bg: '',
      border: '',
      art: displayArtUrl || '',
      number: `#${String(card.front.number).padStart(2, '0')}`,
      title: card.front.title,
      when_to_use: card.back.when_to_use,
      phrase: `"${card.back.phrase}"`,
      instruction: card.back.instruction,
      answer: card.back.answer ? `Rta: ${card.back.answer}` : '',
      fun_fact: card.back.fun_fact ? `💡 ${card.back.fun_fact}` : '',
      qr: card.back.qr_url || 'https://baraja.cards',
      brand: `Baraja · ${deck.name}`,
    }];
  }, [card, deck.name, displayArtUrl]);

  // Geometry
  // We MUST use the basePdf dimensions so the aspect ratio matches the template EXACTLY,
  // preventing @pdfme/ui from squishing or dropping elements if the template is 127x102 but the deck says 88x63.
  const basePdfMeta = baseTemplate.basePdf as { width?: number; height?: number };
  const parsedWidth = basePdfMeta.width || Number(deck.print_specs?.dimensions?.width) || 88;
  const parsedHeight = basePdfMeta.height || Number(deck.print_specs?.dimensions?.height) || 63;
  const aspectRatioDecimal = parsedWidth / parsedHeight;
  const finalAspectRatio = forceOriginalMode ? (88 / 63) : aspectRatioDecimal;
  const paddingRatio = (1 / finalAspectRatio) * 100;

  // Initialize and update the front Viewer
  useEffect(() => {
    if (!frontRef.current) return;
    if (viewerFrontRef.current) {
      viewerFrontRef.current.updateTemplate(frontTemplate);
      viewerFrontRef.current.setInputs(inputs);
    } else {
      viewerFrontRef.current = new Viewer({
        domContainer: frontRef.current,
        template: frontTemplate,
        inputs,
        options: { font: buildPdfmeFonts() },
        plugins: pdfmePlugins,
      });
    }
  }, [frontTemplate, inputs]);

  // Initialize and update the back Viewer
  useEffect(() => {
    if (!backRef.current) return;
    if (viewerBackRef.current) {
      viewerBackRef.current.updateTemplate(backTemplate);
      viewerBackRef.current.setInputs(inputs);
    } else {
      viewerBackRef.current = new Viewer({
        domContainer: backRef.current,
        template: backTemplate,
        inputs,
        options: { font: buildPdfmeFonts() },
        plugins: pdfmePlugins,
      });
    }
  }, [backTemplate, inputs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      viewerFrontRef.current?.destroy();
      viewerBackRef.current?.destroy();
      viewerFrontRef.current = null;
      viewerBackRef.current = null;
    };
  }, []);

  return (
    <div className={styles.wrapper} style={{ '--card-padding': `${paddingRatio}%` } as React.CSSProperties}>
      <div className={styles.infoRow}>
        <span className={styles.cardNumber}>#{String(card.front.number).padStart(2, '0')}</span>
        <span className={styles.cardTitle}>{card.front.title}</span>
      </div>

      <div
        className={`${styles.cardContainer} ${flipped ? styles.flipped : ''}`}
        onClick={() => onFlip?.()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onFlip?.()}
        style={{ paddingTop: `var(--card-padding)` }} // 3D hack
      >
        <div className={`${styles.face} ${styles.faceFront}`}>
          <div ref={frontRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
        </div>

        <div className={`${styles.face} ${styles.faceBack}`}>
          <div ref={backRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
        </div>
      </div>
    </div>
  );
}
