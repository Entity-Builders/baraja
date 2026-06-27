// src/components/cards/CardCanvas.tsx
// Pure HTML/CSS card renderer — NO pdfme Viewer dependency.
// FRONT: Full-bleed art with overlaid number/title
// BACK: High-res PNG frame with AI-typography-aware text content
import { useMemo, useEffect, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Schema, Template } from '@pdfme/common';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { getCardQrUrl, shouldRenderPrintableQr } from '@eb-packages/deck-engine';
import { getFrameUrl, getFrameTheme, getFrameTypography, loadGoogleFonts } from '../../lib/cardFrame';
import { resolveReadableSchemaColorOverrides } from '../../lib/cardReadability';
import {
  getCardFieldText,
  getFieldDefinitionsForPlacement,
  normalizeTemplateFieldAliases,
  normalizeFieldPlacements,
  type CardFieldDefinition,
} from '../../lib/cardFieldPlacements';
import { getPdfmeTemplateSize } from '../../lib/pdfmeTemplateSize';
import { PdfmeTemplatePreview } from './PdfmeTemplatePreview';
import styles from './CardCanvas.module.css';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function getPdfmeLayoutConfig(deck: DeckSchema): Template | null {
  const config = deck.design?.layout_config;
  if (typeof config === 'object' && config !== null && 'basePdf' in config && 'schemas' in config) {
    return normalizeTemplateFieldAliases(config as Template);
  }
  return null;
}

function getFallbackBackColor(theme: 'light' | 'dark', typo: TypographyHints | null, key: string): string {
  const darkThemeColors: Record<string, string> = {
    when_to_use: 'rgba(200, 200, 200, 0.8)',
    phrase: '#ffffff',
    instruction: 'rgba(230, 230, 230, 0.88)',
    answer: 'rgba(180, 180, 180, 0.75)',
    fun_fact: 'rgba(180, 180, 180, 0.75)',
    brand: 'rgba(255, 255, 255, 0.28)',
  };
  const lightThemeColors: Record<string, string> = {
    when_to_use: 'rgba(60, 35, 10, 0.7)',
    phrase: '#1a0d02',
    instruction: 'rgba(45, 28, 8, 0.88)',
    answer: 'rgba(70, 45, 15, 0.72)',
    fun_fact: 'rgba(70, 45, 15, 0.72)',
    brand: 'rgba(90, 58, 22, 0.55)',
  };

  const aiColors: Record<string, string | undefined> = {
    when_to_use: typo?.whenToUse?.color,
    phrase: typo?.phrase?.color,
    instruction: typo?.instruction?.color,
    answer: typo?.answer?.color,
    fun_fact: typo?.answer?.color,
    brand: typo?.brand?.color,
  };

  return aiColors[key] ?? (theme === 'light' ? lightThemeColors[key] : darkThemeColors[key]);
}

function buildFallbackBackSchemas(theme: 'light' | 'dark', typo: TypographyHints | null): Schema[] {
  const makeTextSchema = (
    name: string,
    position: { x: number; y: number },
    width: number,
    height: number,
  ): Schema => ({
    name,
    type: 'text',
    position,
    width,
    height,
    fontColor: getFallbackBackColor(theme, typo, name),
    rotate: 0,
  } as Schema);

  return [
    {
      name: 'bg',
      type: 'image',
      position: { x: 0, y: 0 },
      width: 70,
      height: 120,
      rotate: 0,
    } as Schema,
    makeTextSchema('when_to_use', { x: 9.8, y: 11.4 }, 50.4, 8),
    makeTextSchema('phrase', { x: 8, y: 22 }, 54, 40),
    makeTextSchema('instruction', { x: 8, y: 62 }, 54, 24),
    makeTextSchema('answer', { x: 8, y: 86 }, 54, 8),
    makeTextSchema('fun_fact', { x: 8, y: 94 }, 54, 8),
    makeTextSchema('brand', { x: 8, y: 105 }, 54, 5),
  ];
}

function getFallbackContrastVars(overrides: Record<string, string>): CSSProperties {
  const vars: Record<string, string> = {};
  if (overrides.when_to_use) vars['--c-when'] = overrides.when_to_use;
  if (overrides.phrase) vars['--c-phrase'] = overrides.phrase;
  if (overrides.instruction) vars['--c-instruction'] = overrides.instruction;
  if (overrides.answer) vars['--c-answer'] = overrides.answer;
  if (overrides.fun_fact) vars['--c-answer'] = overrides.fun_fact;
  if (overrides.brand) vars['--c-brand'] = overrides.brand;
  return vars as CSSProperties;
}

const INSTRUCTION_FIRST_DIGITAL_CATEGORIES = new Set([
  'conversation',
  'trivia',
  'language-learning',
  'team-building',
  'coaching',
  'creative-prompts',
]);

const INSTRUCTION_FIRST_CATALOG_COLLECTIONS = new Set([
  'social-games',
  'couples-dating',
  'team-tools',
  'trivia-games',
  'learning',
]);

const INSTRUCTION_FIRST_BACK_FIELD_ORDER: Partial<Record<CardFieldDefinition['key'], number>> = {
  when_to_use: 0,
  instruction: 1,
  answer: 2,
  fun_fact: 3,
  phrase: 4,
  qr: 5,
  brand: 6,
};

function shouldUseInstructionFirstBack(deck: DeckSchema): boolean {
  const category = deck.digital?.category;
  const collection = deck.digital?.catalog?.collection;

  return Boolean(
    (category && INSTRUCTION_FIRST_DIGITAL_CATEGORIES.has(category)) ||
    (collection && INSTRUCTION_FIRST_CATALOG_COLLECTIONS.has(collection)),
  );
}

function sortInstructionFirstBackFields(fields: CardFieldDefinition[]): CardFieldDefinition[] {
  return [...fields].sort((a, b) => {
    const orderA = INSTRUCTION_FIRST_BACK_FIELD_ORDER[a.key] ?? 99;
    const orderB = INSTRUCTION_FIRST_BACK_FIELD_ORDER[b.key] ?? 99;
    return orderA - orderB;
  });
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
  const renderFrontField = (field: CardFieldDefinition) => {
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
  };
  const renderBackField = (field: CardFieldDefinition) => {
    if (field.key === 'qr') {
      if (!shouldShowQr || !qrUrl) return null;

      return (
        <div key={field.key} className={styles.qrWrapper}>
          <QRCodeSVG
            value={qrUrl}
            size={26}
            bgColor={qrBgColor}
            fgColor={qrFgColor}
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
  };
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
        <div className={styles.infoRow}>
          <span className={styles.cardNumber}>{number}</span>
          <span className={styles.cardTitle}>{title}</span>
        </div>
      )}

      <div
        className={`${styles.cardContainer} ${flipped ? styles.flipped : ''} ${onFlip ? styles.interactive : ''}`}
        style={pdfmeSize ? { aspectRatio: `${pdfmeSize.width} / ${pdfmeSize.height}` } : undefined}
        {...interactiveProps}
      >
        {/* ── FRONT FACE ── */}
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
              onLoad={(e) => {
                e.currentTarget.style.display = '';
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextElementSibling) {
                  // If we wanted to show a placeholder, we could, but hiding is better than broken icon
                }
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
              {frontTextFields.map(renderFrontField)}
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
            <p className={styles.frontBrandText}>{brand}</p>
          )}
        </div>

        {/* ── BACK FACE ── */}
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
            /* Flujo B: AI-generated full card back image */
            <>
              <img
                key={card.back.back_image_url}
                src={card.back.back_image_url}
                alt="AI card back"
                className={styles.frameImage}
                draggable={false}
                onLoad={(e) => {
                  e.currentTarget.style.display = '';
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
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
            /* Standard: PNG frame + text overlay */
            <>
              <img
                src={frameUrl}
                alt="Card frame"
                className={styles.frameImage}
                draggable={false}
                onError={(e) => {
                  if (e.currentTarget.src !== window.location.origin + '/frames/back-frame.png') {
                    e.currentTarget.src = '/frames/back-frame.png';
                  }
                }}
              />
              <div className={backContentClassName}>
                {orderedBackFields.map(renderBackField)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
