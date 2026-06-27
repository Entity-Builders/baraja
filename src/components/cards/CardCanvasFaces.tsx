import { QRCodeSVG } from 'qrcode.react';
import type { Template } from '@pdfme/common';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import {
  getCardFieldText,
  type CardFieldDefinition,
  type FieldPlacementMap,
} from '../../lib/cardFieldPlacements';
import { PdfmeTemplatePreview } from './PdfmeTemplatePreview';
import styles from './CardCanvas.module.css';

interface PdfmeSize {
  width: number;
  height: number;
}

interface QrRenderProps {
  qrBgColor: string;
  qrFgColor: string;
  qrUrl: string;
  shouldShowQr: boolean;
}

export function CardCanvasInfoRow({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.cardNumber}>{number}</span>
      <span className={styles.cardTitle}>{title}</span>
    </div>
  );
}

export function CardCanvasFrontFace({
  card,
  deck,
  displayArtUrl,
  frontTextFields,
  hasPdfmeFront,
  number,
  pdfmeMockData,
  pdfmeSize,
  pdfmeTemplate,
  placements,
  qrBgColor,
  qrFgColor,
  qrUrl,
  shouldShowQr,
  title,
}: {
  card: Card;
  deck: DeckSchema;
  displayArtUrl: string | undefined;
  frontTextFields: CardFieldDefinition[];
  hasPdfmeFront: boolean;
  number: string;
  pdfmeMockData: Record<string, string>;
  pdfmeSize: PdfmeSize | null;
  pdfmeTemplate: Template | null;
  placements: FieldPlacementMap;
  title: string;
} & QrRenderProps) {
  return (
    <div className={`${styles.face} ${styles.faceFront}`}>
      {hasPdfmeFront && pdfmeTemplate ? (
        <PdfmeTemplatePreview
          template={pdfmeTemplate}
          mockData={pdfmeMockData}
          activeFace="front"
          fallbackWidth={pdfmeSize?.width ?? 70}
          fallbackHeight={pdfmeSize?.height ?? 120}
          variant="card"
        />
      ) : displayArtUrl ? (
        <img
          key={displayArtUrl}
          src={displayArtUrl}
          alt={title}
          className={styles.artImage}
          draggable={false}
          onLoad={(event) => {
            event.currentTarget.style.display = '';
          }}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className={styles.noArtPlaceholder}>
          <span className={styles.noArtText}>Sin Arte</span>
        </div>
      )}
      {!hasPdfmeFront && placements.number === 'front' && (
        <span className={styles.frontNumber}>{number}</span>
      )}
      {!hasPdfmeFront && placements.title === 'front' && (
        <span className={styles.frontTitle}>{title}</span>
      )}
      {!hasPdfmeFront && frontTextFields.length > 0 && (
        <div className={styles.frontContentStack}>
          {frontTextFields.map((field) => renderFrontField(field, card, deck))}
        </div>
      )}
      {!hasPdfmeFront && shouldShowQr && placements.qr === 'front' && qrUrl && (
        <div className={styles.frontQrWrapper}>
          <QRCodeSVG
            value={qrUrl}
            size={30}
            bgColor={qrBgColor}
            fgColor={qrFgColor}
            level="M"
          />
        </div>
      )}
      {!hasPdfmeFront && placements.brand === 'front' && (
        <p className={styles.frontBrandText}>Baraja · {deck.name}</p>
      )}
    </div>
  );
}

export function CardCanvasBackFace({
  backContentClassName,
  card,
  deck,
  frameUrl,
  hasPdfmeBack,
  orderedBackFields,
  pdfmeMockData,
  pdfmeSize,
  pdfmeTemplate,
  placements,
  qrBgColor,
  qrFgColor,
  qrUrl,
  shouldShowQr,
}: {
  backContentClassName: string;
  card: Card;
  deck: DeckSchema;
  frameUrl: string;
  hasPdfmeBack: boolean;
  orderedBackFields: CardFieldDefinition[];
  pdfmeMockData: Record<string, string>;
  pdfmeSize: PdfmeSize | null;
  pdfmeTemplate: Template | null;
  placements: FieldPlacementMap;
} & QrRenderProps) {
  return (
    <div className={`${styles.face} ${styles.faceBack}`}>
      {hasPdfmeBack && pdfmeTemplate ? (
        <PdfmeTemplatePreview
          template={pdfmeTemplate}
          mockData={pdfmeMockData}
          activeFace="back"
          fallbackWidth={pdfmeSize?.width ?? 70}
          fallbackHeight={pdfmeSize?.height ?? 120}
          variant="card"
        />
      ) : card.back.back_image_url ? (
        <>
          <img
            key={card.back.back_image_url}
            src={card.back.back_image_url}
            alt="AI card back"
            className={styles.frameImage}
            draggable={false}
            onLoad={(event) => {
              event.currentTarget.style.display = '';
            }}
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          {shouldShowQr && placements.qr === 'back' && qrUrl && (
            <div className={styles.qrOverlay}>
              <QRCodeSVG
                value={qrUrl}
                size={26}
                bgColor={qrBgColor}
                fgColor={qrFgColor}
                level="M"
              />
            </div>
          )}
        </>
      ) : (
        <>
          <img
            src={frameUrl}
            alt="Card frame"
            className={styles.frameImage}
            draggable={false}
            onError={(event) => {
              if (event.currentTarget.src !== window.location.origin + '/frames/back-frame.png') {
                event.currentTarget.src = '/frames/back-frame.png';
              }
            }}
          />
          <div className={backContentClassName}>
            {orderedBackFields.map((field) => renderBackField(field, card, deck, {
              qrBgColor,
              qrFgColor,
              qrUrl,
              shouldShowQr,
            }))}
          </div>
        </>
      )}
    </div>
  );
}

function renderFrontField(
  field: CardFieldDefinition,
  card: Card,
  deck: DeckSchema,
) {
  const value = getCardFieldText(card, deck.name, field.key);
  if (!value) return null;

  return (
    <p
      key={field.key}
      className={`${styles.frontField} ${styles[`frontField_${field.key}`] ?? ''}`}
    >
      {value}
    </p>
  );
}

function renderBackField(
  field: CardFieldDefinition,
  card: Card,
  deck: DeckSchema,
  qr: QrRenderProps,
) {
  if (field.key === 'qr') {
    if (!qr.shouldShowQr || !qr.qrUrl) return null;

    return (
      <div key={field.key} className={styles.qrWrapper}>
        <QRCodeSVG
          value={qr.qrUrl}
          size={26}
          bgColor={qr.qrBgColor}
          fgColor={qr.qrFgColor}
          level="M"
        />
      </div>
    );
  }

  const value = getCardFieldText(card, deck.name, field.key);
  if (!value) return null;

  const classNameByKey: Partial<Record<CardFieldDefinition['key'], string>> = {
    number: styles.whenText,
    title: styles.phraseText,
    when_to_use: styles.whenText,
    phrase: styles.phraseText,
    instruction: styles.instructionText,
    answer: styles.answerText,
    fun_fact: styles.funFactText,
    brand: styles.brandText,
  };

  return (
    <p key={field.key} className={classNameByKey[field.key] ?? styles.instructionText}>
      {value}
    </p>
  );
}
