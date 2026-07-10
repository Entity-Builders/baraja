import type { GeneratedMusicBingoCard } from '@eb-packages/deck-engine';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 42;
const CARD_MAX_WIDTH = 440;
const CARD_HEADER_HEIGHT = 72;
const CARD_FOOTER_HEIGHT = 30;

export interface MusicBingoPreviewTextLine {
  text: string;
  size: number;
  role: 'label' | 'hint';
}

export interface MusicBingoPreviewTextLayout {
  lines: MusicBingoPreviewTextLine[];
  height: number;
  truncated: boolean;
}

type TextMeasure = (text: string, size: number) => number;

export async function createMusicBingoPreviewPdfBlob(
  card: GeneratedMusicBingoCard
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('@pdfme/pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.07, 0.1, 0.16);
  const muted = rgb(0.33, 0.37, 0.44);
  const line = rgb(0.11, 0.13, 0.17);
  const softLine = rgb(0.8, 0.8, 0.78);
  const paper = rgb(0.995, 0.992, 0.982);
  const freeFill = rgb(0.95, 0.89, 0.86);
  const accent = rgb(0.72, 0.16, 0.13);
  const accentSoft = rgb(0.97, 0.9, 0.86);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    color: paper,
  });

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 14,
    height: A4_HEIGHT,
    color: accent,
  });

  page.drawText('Bingo musical', {
    x: PAGE_MARGIN,
    y: A4_HEIGHT - PAGE_MARGIN - 20,
    size: 24,
    font: boldFont,
    color: ink,
  });

  const brand = 'Baraja';
  page.drawText(brand, {
    x: A4_WIDTH - PAGE_MARGIN - boldFont.widthOfTextAtSize(brand, 16),
    y: A4_HEIGHT - PAGE_MARGIN - 16,
    size: 16,
    font: boldFont,
    color: ink,
  });

  page.drawText(
    fitSingleLineText(
      card.title,
      A4_WIDTH - PAGE_MARGIN * 2,
      11,
      (text, size) => regularFont.widthOfTextAtSize(text, size)
    ),
    {
      x: PAGE_MARGIN,
      y: A4_HEIGHT - PAGE_MARGIN - 46,
      size: 11,
      font: regularFont,
      color: muted,
    }
  );

  const cardWidth = Math.min(CARD_MAX_WIDTH, A4_WIDTH - PAGE_MARGIN * 2);
  const cardTop = A4_HEIGHT - PAGE_MARGIN - 92;
  const usableCardHeight = cardTop - PAGE_MARGIN - CARD_FOOTER_HEIGHT;
  const cellSize = Math.floor(
    Math.min(
      cardWidth / card.boardSize,
      (usableCardHeight - CARD_HEADER_HEIGHT) / card.boardSize
    ) * 100
  ) / 100;
  const drawnGridWidth = cellSize * card.boardSize;
  const drawnGridHeight = cellSize * card.boardSize;
  const sheetWidth = drawnGridWidth;
  const sheetHeight = CARD_HEADER_HEIGHT + drawnGridHeight;
  const sheetX = (A4_WIDTH - sheetWidth) / 2;
  const sheetY = Math.max(
    PAGE_MARGIN + CARD_FOOTER_HEIGHT,
    A4_HEIGHT - PAGE_MARGIN - 118 - sheetHeight
  );
  const gridX = sheetX;
  const gridY = sheetY;

  page.drawRectangle({
    x: sheetX - 10,
    y: sheetY - 10,
    width: sheetWidth + 20,
    height: sheetHeight + 20,
    color: rgb(1, 1, 1),
    borderColor: softLine,
    borderWidth: 0.7,
  });

  page.drawText('Carton de muestra', {
    x: sheetX,
    y: sheetY + drawnGridHeight + 46,
    size: 10,
    font: regularFont,
    color: muted,
  });

  page.drawText(
    fitSingleLineText(
      `Carton ${card.cardNumber}`,
      drawnGridWidth - 112,
      17,
      (text, size) => boldFont.widthOfTextAtSize(text, size)
    ),
    {
      x: sheetX,
      y: sheetY + drawnGridHeight + 23,
      size: 17,
      font: boldFont,
      color: ink,
    }
  );

  const boardMeta = `${card.boardSize} x ${card.boardSize}`;
  const boardMetaWidth = boldFont.widthOfTextAtSize(boardMeta, 9) + 22;
  page.drawRectangle({
    x: sheetX + drawnGridWidth - boardMetaWidth,
    y: sheetY + drawnGridHeight + 20,
    width: boardMetaWidth,
    height: 19,
    color: accentSoft,
    borderColor: accent,
    borderWidth: 0.5,
  });
  page.drawText(boardMeta, {
    x: sheetX + drawnGridWidth - boardMetaWidth + 11,
    y: sheetY + drawnGridHeight + 26,
    size: 9,
    font: boldFont,
    color: ink,
  });

  page.drawRectangle({
    x: gridX,
    y: gridY,
    width: drawnGridWidth,
    height: drawnGridHeight,
    borderColor: line,
    borderWidth: 1.4,
  });

  card.cells.forEach((cell, index) => {
    const row = Math.floor(index / card.boardSize);
    const column = index % card.boardSize;
    const x = gridX + column * cellSize;
    const y = gridY + drawnGridHeight - (row + 1) * cellSize;

    if (cell.free) {
      page.drawRectangle({
        x,
        y,
        width: cellSize,
        height: cellSize,
        color: freeFill,
      });
    }

    page.drawRectangle({
      x,
      y,
      width: cellSize,
      height: cellSize,
      borderColor: line,
      borderWidth: 0.65,
    });

    const layout = buildCellTextLayout(cell.label, cell.hint, cellSize, {
      labelWidth: (text, size) => boldFont.widthOfTextAtSize(text, size),
      hintWidth: (text, size) => regularFont.widthOfTextAtSize(text, size),
    });
    let cursorY = y + cellSize / 2 + layout.height / 2;

    layout.lines.forEach((lineItem, lineIndex) => {
      const font = lineItem.role === 'label' ? boldFont : regularFont;
      const width = font.widthOfTextAtSize(lineItem.text, lineItem.size);
      const lineHeight = getCellLineHeight(lineItem);
      const previousLine = layout.lines[lineIndex - 1];
      if (previousLine && previousLine.role !== lineItem.role) cursorY -= 2;
      cursorY -= lineHeight;

      page.drawText(lineItem.text, {
        x: x + cellSize / 2 - width / 2,
        y: cursorY + (lineHeight - lineItem.size) / 2,
        size: lineItem.size,
        font,
        color: lineItem.role === 'label' ? ink : muted,
      });
    });
  });

  page.drawText('Vista previa del PDF imprimible. El pack final incluye todos los cartones y guia del anfitrion.', {
    x: PAGE_MARGIN,
    y: 24,
    size: 7.8,
    font: regularFont,
    color: muted,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}

export function buildCellTextLayout(
  label: string,
  hint: string,
  cellSize: number,
  widths: {
    labelWidth: TextMeasure;
    hintWidth: TextMeasure;
  }
): MusicBingoPreviewTextLayout {
  const maxWidth = Math.max(34, cellSize - 16);
  const maxHeight = Math.max(34, cellSize - 16);
  const compact = cellSize < 78;
  const baseLabelSize = compact ? 10.8 : 13.2;
  const baseHintSize = compact ? 6.8 : 8.1;
  const minLabelSize = 6.8;
  const minHintSize = 6;

  for (let step = 0; step <= 14; step += 1) {
    const labelSize = Math.max(minLabelSize, baseLabelSize - step * 0.45);
    const hintSize = Math.max(minHintSize, baseHintSize - step * 0.28);
    const labelLines = wrapContainedText(label, {
      maxWidth,
      size: labelSize,
      measure: widths.labelWidth,
      maxLines: compact ? 3 : 2,
      deferTruncation: true,
    });
    const hintLines = hint
      ? wrapContainedText(hint, {
        maxWidth,
        size: hintSize,
        measure: widths.hintWidth,
        maxLines: 2,
        deferTruncation: true,
      })
      : { lines: [] as string[], truncated: false };
    const lines = [
      ...labelLines.lines.map((text) => ({ text, size: labelSize, role: 'label' as const })),
      ...hintLines.lines.map((text) => ({ text, size: hintSize, role: 'hint' as const })),
    ];
    const height = measureCellTextHeight(lines);
    const fits = lines.every((lineItem) => {
      const measure = lineItem.role === 'label' ? widths.labelWidth : widths.hintWidth;
      return measure(lineItem.text, lineItem.size) <= maxWidth + 0.01;
    });

    if (fits && height <= maxHeight) {
      return {
        lines,
        height,
        truncated: labelLines.truncated || hintLines.truncated,
      };
    }
  }

  const labelSize = minLabelSize;
  const hintSize = minHintSize;
  const labelLines = wrapContainedText(label, {
    maxWidth,
    size: labelSize,
    measure: widths.labelWidth,
    maxLines: 2,
  });
  const labelHeight = labelLines.lines.length * getCellLineHeight({
    size: labelSize,
    role: 'label',
  });
  const remainingHeight = maxHeight - labelHeight - 2;
  const hintLines = hint && remainingHeight >= hintSize * 1.1
    ? wrapContainedText(hint, {
      maxWidth,
      size: hintSize,
      measure: widths.hintWidth,
      maxLines: 1,
    })
    : { lines: [] as string[], truncated: Boolean(hint) };
  const lines = [
    ...labelLines.lines.map((text) => ({ text, size: labelSize, role: 'label' as const })),
    ...hintLines.lines.map((text) => ({ text, size: hintSize, role: 'hint' as const })),
  ];

  return {
    lines,
    height: Math.min(measureCellTextHeight(lines), maxHeight),
    truncated: true,
  };
}

function measureCellTextHeight(lines: MusicBingoPreviewTextLine[]) {
  return lines.reduce((height, line, index) => {
    const previousLine = lines[index - 1];
    const roleGap = previousLine && previousLine.role !== line.role ? 2 : 0;
    return height + roleGap + getCellLineHeight(line);
  }, 0);
}

function getCellLineHeight(line: Pick<MusicBingoPreviewTextLine, 'role' | 'size'>) {
  return line.role === 'label' ? line.size * 1.08 : line.size * 1.12;
}

function fitSingleLineText(
  text: string,
  maxWidth: number,
  size: number,
  measure: TextMeasure
) {
  return truncatePdfText(sanitizePdfText(text), maxWidth, size, measure);
}

function wrapContainedText(
  text: string,
  opts: {
    maxWidth: number;
    size: number;
    measure: TextMeasure;
    maxLines: number;
    deferTruncation?: boolean;
  }
) {
  const safeText = sanitizePdfText(text);
  const lines = opts.deferTruncation
    ? wrapPdfTextForFit(safeText, opts.maxWidth, opts.size, opts.measure)
    : wrapPdfText(safeText, opts.maxWidth, opts.size, opts.measure);
  let truncated = false;
  let contained = lines;

  if (lines.length > opts.maxLines) {
    truncated = true;
    contained = [
      ...lines.slice(0, Math.max(0, opts.maxLines - 1)),
      lines.slice(Math.max(0, opts.maxLines - 1)).join(' '),
    ];
  }

  contained = contained.slice(0, opts.maxLines).map((lineItem) => {
    if (opts.measure(lineItem, opts.size) <= opts.maxWidth) return lineItem;
    truncated = true;
    if (opts.deferTruncation) return lineItem;
    return truncatePdfText(lineItem, opts.maxWidth, opts.size, opts.measure);
  });

  if (truncated && !opts.deferTruncation && contained.length > 0) {
    const lastIndex = contained.length - 1;
    contained[lastIndex] = truncatePdfText(
      contained[lastIndex],
      opts.maxWidth,
      opts.size,
      opts.measure
    );
  }

  return { lines: contained, truncated };
}

function wrapPdfTextForFit(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasure
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (measure(nextLine, fontSize) <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [text];
}

function wrapPdfText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasure
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (measure(nextLine, fontSize) <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    lines.push(truncatePdfText(word, maxWidth, fontSize, measure));
    currentLine = '';
  });

  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [text];
}

function truncatePdfText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasure
): string {
  if (measure(text, fontSize) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 1 && measure(`${truncated}...`, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}...`;
}

function sanitizePdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
