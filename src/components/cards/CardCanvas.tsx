// src/components/cards/CardCanvas.tsx
// Pure HTML/CSS card renderer — NO pdfme Viewer dependency.
// FRONT: Full-bleed art with overlaid number/title
// BACK: High-res PNG frame with AI-typography-aware text content
import { useMemo, useEffect, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Card, DeckSchema } from '@entity-builders/deck-engine';
import { getCardQrUrl, shouldRenderPrintableQr } from '@entity-builders/deck-engine';
import { getFrameUrl, getFrameTheme, getFrameTypography, loadGoogleFonts } from '../../lib/cardFrame';
import { resolveReadableSchemaColorOverrides } from '../../lib/cardReadability';
import {
  getFieldDefinitionsForPlacement,
  normalizeFieldPlacements,
} from '../../lib/cardFieldPlacements';
import { getPdfmeTemplateSize } from '../../lib/pdfmeTemplateSize';
import {
  CardCanvasBackFace,
  CardCanvasFrontFace,
  CardCanvasInfoRow,
} from './CardCanvasFaces';
import {
  adaptiveFontSize,
  buildFallbackBackSchemas,
  getFallbackContrastVars,
  getPdfmeLayoutConfig,
  shouldUseInstructionFirstBack,
  sortInstructionFirstBackFields,
  type TypographyHints,
} from './cardCanvasHelpers';
import styles from './CardCanvas.module.css';

// GOOGLE_FONT_CATALOG lives in ./fontCatalog.ts (plain .ts, not .tsx)
// so Vite Fast Refresh can handle this component file correctly.
export { GOOGLE_FONT_CATALOG } from './fontCatalog';

interface CardCanvasProps {
  card: Card;
  deck: DeckSchema;
  className?: string;
  previewUrl?: string | null;
  flipped?: boolean;
  onFlip?: () => void;
  forceOriginalMode?: boolean;
  showInfoRow?: boolean;
  /** QR is reserved for printable editions; digital surfaces can force it off. */
  showQr?: boolean;
  /** AI typography hints — props override localStorage */
  typography?: TypographyHints | null;
  /** 'light' or 'dark' frame theme — auto-detected from localStorage if omitted */
  frameTheme?: 'light' | 'dark';
}

// ── Component ────────────────────────────────────────────────────────────────

export function CardCanvas({
  card,
  deck,
  className,
  previewUrl,
  flipped = false,
  onFlip,
  showInfoRow = true,
  showQr,
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
  const shouldShowQr = showQr ?? shouldRenderPrintableQr(deck);
  // Canonical per-card QR URL: baraja.cards/c/{deck-slug}/{card-number}
  // Falls back to a manual override in card.back.qr_url if present.
  const qrUrl = shouldShowQr
    ? card.back.qr_url || getCardQrUrl(deck.slug ?? 'baraja', card.front.number)
    : '';
  const brand       = `Baraja · ${deck.name}`;
  const instructionFirstBack = shouldUseInstructionFirstBack(deck);
  const placements = useMemo(() => normalizeFieldPlacements(deck.design), [deck.design]);
  const frontFields = useMemo(() => getFieldDefinitionsForPlacement(placements, 'front'), [placements]);
  const backFields = useMemo(() => getFieldDefinitionsForPlacement(placements, 'back'), [placements]);
  const orderedBackFields = useMemo(
    () => instructionFirstBack ? sortInstructionFirstBackFields(backFields) : backFields,
    [backFields, instructionFirstBack],
  );
  const frontTextFields = frontFields.filter(
    field => !['number', 'title', 'qr', 'brand'].includes(field.key),
  );

  // Resolve per-deck frame URL (falls back to global)
  const frameUrl = useMemo(() => getFrameUrl(deck.slug || null), [deck.slug]);

  // Resolve theme: prop > localStorage
  const theme = useMemo(() => frameTheme ?? getFrameTheme(), [frameTheme]);

  // Resolve typography: prop > localStorage
  const typo = useMemo<TypographyHints | null>(
    () => typography ?? getFrameTypography() as TypographyHints | null,
    [typography]
  );
  const [fallbackContrastVars, setFallbackContrastVars] = useState<CSSProperties>({});

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
  const typographyVars = useMemo<CSSProperties>(() => {
    // Apply adaptive sizing to all text zones using the AI size as max, falling back to defaults.
    const vars: Record<string, string> = {
      '--fs-phrase': adaptiveFontSize(phrase, typo?.phrase?.fontSize, instructionFirstBack ? 6.8 : 9.5, false),
      '--fs-instruction': adaptiveFontSize(instruction, typo?.instruction?.fontSize, instructionFirstBack ? 7.2 : 6.5, true),
      '--fs-when': adaptiveFontSize(whenToUse, typo?.whenToUse?.fontSize, 4.5, true),
      '--fs-answer': adaptiveFontSize(answer, typo?.answer?.fontSize, 5.5, true),
    };

    if (!typo) return vars as CSSProperties;

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

    return vars as CSSProperties;
  }, [typo, phrase, instruction, whenToUse, answer, instructionFirstBack]);

  const pdfmeTemplate = useMemo(
    () => getPdfmeLayoutConfig(deck),
    [deck]
  );
  const pdfmeSize = useMemo(
    () => pdfmeTemplate ? getPdfmeTemplateSize(pdfmeTemplate, 70, 120) : null,
    [pdfmeTemplate]
  );
  const hasPdfmeFront = Boolean(pdfmeTemplate && pdfmeTemplate.schemas.length > 1);
  const hasPdfmeBack = Boolean(pdfmeTemplate);

  useEffect(() => {
    let cancelled = false;

    if (hasPdfmeBack || card.back.back_image_url) {
      return () => {
        cancelled = true;
      };
    }

    const schemas = buildFallbackBackSchemas(theme, typo);
    void resolveReadableSchemaColorOverrides(schemas, { bg: frameUrl }).then(overrides => {
      if (cancelled) return;
      setFallbackContrastVars(getFallbackContrastVars(overrides));
    });

    return () => {
      cancelled = true;
    };
  }, [card.back.back_image_url, frameUrl, hasPdfmeBack, theme, typo]);


  // QR color — 3-level priority (first defined wins):
  //   1. Preset field   → deck.design.qr_color  (column in baraja_design_templates)
  //   2. AI hint        → typo.qrFgColor  (set by typography analysis)
  //   3. Theme default  → gold on dark / dark-gold on light
  const qrFgColor = deck.design.qr_color
    ?? typo?.qrFgColor
    ?? (theme === 'light' ? '#4a2e08' : '#d4af64');
  const qrBgColor = 'rgba(0,0,0,0)'; // always transparent — no dark box
  const pdfmeMockData = useMemo(() => ({
    art: displayArtUrl || '',
    number: placements.number === 'hidden' ? '' : number,
    title: placements.title === 'hidden' ? '' : title,
    bg: frameUrl,
    back_ai_image: card.back.back_image_url || '',
    qr: shouldShowQr && placements.qr !== 'hidden' ? qrUrl : '',
    qr_overlay: shouldShowQr && placements.qr !== 'hidden' ? qrUrl : '',
    when_to_use: placements.when_to_use === 'hidden' ? '' : whenToUse || '',
    whenToUse: placements.when_to_use === 'hidden' ? '' : whenToUse || '',
    phrase: placements.phrase === 'hidden' || !phrase ? '' : `"${phrase}"`,
    instruction: placements.instruction === 'hidden' ? '' : instruction || '',
    answer: placements.answer === 'hidden' ? '' : answer,
    fun_fact: placements.fun_fact === 'hidden' ? '' : funFact,
    brand: placements.brand === 'hidden' ? '' : brand,
  }), [displayArtUrl, number, title, frameUrl, card.back.back_image_url, qrUrl, placements, shouldShowQr, whenToUse, phrase, instruction, answer, funFact, brand]);
  const interactiveProps = onFlip
    ? {
        onClick: onFlip,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        },
      }
    : {};
  const wrapperStyle = hasPdfmeBack || card.back.back_image_url
    ? typographyVars
    : { ...typographyVars, ...fallbackContrastVars };
  const backContentClassName = `${styles.backContent} ${instructionFirstBack ? styles.backContentInstructionFirst : ''}`.trim();

  return (
    <div
      className={`${styles.wrapper} ${className ?? ''}`.trim()}
      data-theme={theme}
      style={wrapperStyle}
    >
      {showInfoRow && (
        <CardCanvasInfoRow number={number} title={title} />
      )}

      <div
        className={`${styles.cardContainer} ${flipped ? styles.flipped : ''} ${onFlip ? styles.interactive : ''}`}
        style={pdfmeSize ? { aspectRatio: `${pdfmeSize.width} / ${pdfmeSize.height}` } : undefined}
        {...interactiveProps}
      >
        <CardCanvasFrontFace
          card={card}
          deck={deck}
          displayArtUrl={displayArtUrl}
          frontTextFields={frontTextFields}
          hasPdfmeFront={hasPdfmeFront}
          number={number}
          pdfmeMockData={pdfmeMockData}
          pdfmeSize={pdfmeSize}
          pdfmeTemplate={pdfmeTemplate}
          placements={placements}
          qrBgColor={qrBgColor}
          qrFgColor={qrFgColor}
          qrUrl={qrUrl}
          shouldShowQr={shouldShowQr}
          title={title}
        />

        <CardCanvasBackFace
          backContentClassName={backContentClassName}
          card={card}
          deck={deck}
          frameUrl={frameUrl}
          hasPdfmeBack={hasPdfmeBack}
          orderedBackFields={orderedBackFields}
          pdfmeMockData={pdfmeMockData}
          pdfmeSize={pdfmeSize}
          pdfmeTemplate={pdfmeTemplate}
          placements={placements}
          qrBgColor={qrBgColor}
          qrFgColor={qrFgColor}
          qrUrl={qrUrl}
          shouldShowQr={shouldShowQr}
        />
      </div>
    </div>
  );
}
