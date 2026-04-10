// src/components/cards/CardCanvas.tsx
// Pure HTML/CSS card renderer — NO pdfme Viewer dependency.
// FRONT: Full-bleed art with overlaid number/title
// BACK: High-res PNG frame with AI-typography-aware text content
import { useMemo, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { getCardQrUrl } from '@eb-packages/deck-engine';
import { FRAME_URL, getFrameUrl, getFrameTheme, getFrameTypography, loadGoogleFonts } from '../../lib/cardFrame';
import styles from './CardCanvas.module.css';
import { GOOGLE_FONT_CATALOG } from './fontCatalog';

// GOOGLE_FONT_CATALOG lives in ./fontCatalog.ts (plain .ts, not .tsx)
// so Vite Fast Refresh can handle this component file correctly.
export { GOOGLE_FONT_CATALOG } from './fontCatalog';

// ── Types ────────────────────────────────────────────────────────────────────

interface TypographyZone {
  fontSize?: number;    // pdfme mm units (converted to cqi for screen)
  fontFamily?: string;  // Any Google Fonts family name
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;       // hex
}

interface TypographyHints {
  whenToUse?: TypographyZone;
  phrase?: TypographyZone;
  instruction?: TypographyZone;
  answer?: TypographyZone;
  brand?: { color?: string; fontFamily?: string };
  qrFgColor?: string;
  qrSizeMm?: number;
}

interface CardCanvasProps {
  card: Card;
  deck: DeckSchema;
  previewUrl?: string | null;
  flipped?: boolean;
  onFlip?: () => void;
  forceOriginalMode?: boolean;
  /** AI typography hints — props override localStorage */
  typography?: TypographyHints | null;
  /** 'light' or 'dark' frame theme — auto-detected from localStorage if omitted */
  frameTheme?: 'light' | 'dark';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * pdfme uses mm for font size. We convert to cqi (container query inline size)
 * so the preview scales with the card width automatically.
 * Reference: 70mm card. At 100cqi = card width. 1mm ≈ 1.428cqi
 */
function mmToCqi(mm: number): string {
  return `${(mm * (100 / 70)).toFixed(2)}cqi`;
}

function adaptiveFontSize(text: string | undefined | null, aiSizeMm: number | undefined, defaultCqi: number, isSmallZone = false): string {
  const safeText = text || '';
  const len = safeText.length;
  // AI size in cqi (if provided) is the upper bound, otherwise fallback
  const maxCqi = aiSizeMm ? (aiSizeMm * (100 / 70)) : defaultCqi;
  let scale: number;
  
  if (isSmallZone) {
    if      (len <= 60)  scale = 1.00;
    else if (len <= 100) scale = 0.85;
    else if (len <= 150) scale = 0.75;
    else if (len <= 200) scale = 0.65;
    else                 scale = 0.55;
  } else {
    if      (len <= 40)  scale = 1.00;
    else if (len <= 60)  scale = 0.88;
    else if (len <= 80)  scale = 0.76;
    else if (len <= 100) scale = 0.65;
    else if (len <= 130) scale = 0.56;
    else                 scale = 0.48;
  }
  
  return `${(maxCqi * scale).toFixed(2)}cqi`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CardCanvas({
  card,
  deck,
  previewUrl,
  flipped = false,
  onFlip,
  typography,
  frameTheme,
}: CardCanvasProps) {
  const displayArtUrl = previewUrl || card.front.art_url;

  // Card data
  const number      = `#${String(card.front.number).padStart(2, '0')}`;
  const title       = card.front.title;
  const whenToUse   = card.back.when_to_use;
  const phrase      = card.back.phrase;
  const instruction = card.back.instruction;
  const answer      = card.back.answer ? `Rta: ${card.back.answer}` : '';
  const funFact     = card.back.fun_fact ? `💡 ${card.back.fun_fact}` : '';
  // Canonical per-card QR URL: baraja.cards/c/{deck-slug}/{card-number}
  // Falls back to a manual override in card.back.qr_url if present.
  const qrUrl = card.back.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number);
  const brand       = `Baraja · ${deck.name}`;

  // Resolve per-deck frame URL (falls back to global)
  const frameUrl = useMemo(() => getFrameUrl(deck.slug || null), [deck.slug]);

  // Resolve theme: prop > localStorage
  const theme = useMemo(() => frameTheme ?? getFrameTheme(), [frameTheme]);

  // Resolve typography: prop > localStorage
  const typo = useMemo<TypographyHints | null>(
    () => typography ?? getFrameTypography() as TypographyHints | null,
    [typography]
  );

  // Dynamically load any Google Fonts the AI suggested
  useEffect(() => {
    if (!typo) return;
    const families = [
      typo.whenToUse?.fontFamily,
      typo.phrase?.fontFamily,
      typo.instruction?.fontFamily,
      typo.answer?.fontFamily,
      typo.brand?.fontFamily,
    ].filter((f): f is string => !!f);
    if (families.length) loadGoogleFonts(families);
  }, [typo]);

  // Build CSS custom-property overrides from AI hints
  const typographyVars = useMemo<React.CSSProperties>(() => {
    // Apply adaptive sizing to all text zones using the AI size as max, falling back to defaults.
    const vars: Record<string, string> = {
      '--fs-phrase': adaptiveFontSize(phrase, typo?.phrase?.fontSize, 9.5, false),
      '--fs-instruction': adaptiveFontSize(instruction, typo?.instruction?.fontSize, 6.5, true),
      '--fs-when': adaptiveFontSize(whenToUse, typo?.whenToUse?.fontSize, 4.5, true),
      '--fs-answer': adaptiveFontSize(answer, typo?.answer?.fontSize, 5.5, true),
    };

    if (!typo) return vars as React.CSSProperties;

    // Line heights
    if (typo.phrase?.lineHeight)     vars['--lh-phrase']      = String(typo.phrase.lineHeight);
    if (typo.instruction?.lineHeight) vars['--lh-instruction'] = String(typo.instruction.lineHeight);

    // Font families
    if (typo.whenToUse?.fontFamily)   vars['--ff-when']        = `'${typo.whenToUse.fontFamily}', serif`;
    if (typo.phrase?.fontFamily)      vars['--ff-phrase']      = `'${typo.phrase.fontFamily}', serif`;
    if (typo.instruction?.fontFamily) vars['--ff-instruction'] = `'${typo.instruction.fontFamily}', serif`;
    if (typo.answer?.fontFamily)      vars['--ff-answer']      = `'${typo.answer.fontFamily}', sans-serif`;

    // Colors
    if (typo.whenToUse?.color)    vars['--c-when']        = typo.whenToUse.color;
    if (typo.phrase?.color)       vars['--c-phrase']      = typo.phrase.color;
    if (typo.instruction?.color)  vars['--c-instruction'] = typo.instruction.color;
    if (typo.answer?.color)       vars['--c-answer']      = typo.answer.color;
    if (typo.brand?.color)        vars['--c-brand']       = typo.brand.color;
    if (typo.qrFgColor)           vars['--c-qr-fg']       = typo.qrFgColor;

    return vars as React.CSSProperties;
  }, [typo, phrase]);


  // QR color — 3-level priority (first defined wins):
  //   1. Preset field   → deck.design.qr_color  (column in baraja_design_templates)
  //   2. AI hint        → typo.qrFgColor  (set by typography analysis)
  //   3. Theme default  → gold on dark / dark-gold on light
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qrFgColor = (deck.design as any)?.qr_color
    ?? typo?.qrFgColor
    ?? (theme === 'light' ? '#4a2e08' : '#d4af64');
  const qrBgColor = 'rgba(0,0,0,0)'; // always transparent — no dark box

  return (
    <div
      className={styles.wrapper}
      data-theme={theme}
      style={typographyVars}
    >
      <div className={styles.infoRow}>
        <span className={styles.cardNumber}>{number}</span>
        <span className={styles.cardTitle}>{title}</span>
      </div>

      <div
        className={`${styles.cardContainer} ${flipped ? styles.flipped : ''}`}
        onClick={() => onFlip?.()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onFlip?.()}
      >
        {/* ── FRONT FACE ── */}
        <div className={`${styles.face} ${styles.faceFront}`}>
          {displayArtUrl ? (
            <img src={displayArtUrl} alt={title} className={styles.artImage} draggable={false} />
          ) : (
            <div className={styles.noArtPlaceholder}>
              <span className={styles.noArtText}>Sin Arte</span>
            </div>
          )}
          <span className={styles.frontNumber}>{number}</span>
          <span className={styles.frontTitle}>{title}</span>
        </div>

        {/* ── BACK FACE ── */}
        <div className={`${styles.face} ${styles.faceBack}`}>
          {card.back.back_image_url ? (
            /* Flujo B: AI-generated full card back image */
            <>
              <img
                src={card.back.back_image_url}
                alt="AI card back"
                className={styles.frameImage}
                draggable={false}
              />
                <div className={styles.qrOverlay}>
                  <QRCodeSVG
                    value={qrUrl}
                    size={26}
                    bgColor={qrBgColor}
                    fgColor={qrFgColor}
                    level="M"
                  />
                </div>
            </>
          ) : (
            /* Standard: PNG frame + text overlay */
            <>
              <img
                src={frameUrl}
                alt="Card frame"
                className={styles.frameImage}
                draggable={false}
              />
              <div className={styles.backContent}>

                {whenToUse && (
                  <p className={styles.whenText}>{whenToUse}</p>
                )}

                <p className={styles.phraseText}>"{phrase}"</p>

                {instruction && (
                  <p className={styles.instructionText}>{instruction}</p>
                )}

                {answer && (
                  <p className={styles.answerText}>{answer}</p>
                )}

                {funFact && (
                  <p className={styles.funFactText}>{funFact}</p>
                )}

                <div className={styles.qrWrapper}>
                  <QRCodeSVG
                    value={qrUrl}
                    size={26}
                    bgColor={qrBgColor}
                    fgColor={qrFgColor}
                    level="M"
                  />
                </div>

                <p className={styles.brandText}>{brand}</p>

              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
