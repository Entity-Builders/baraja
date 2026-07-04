import type { GeneratedMusicBingoCard } from '@eb-packages/deck-engine';

const A5_LANDSCAPE_WIDTH = 595.28;
const A5_LANDSCAPE_HEIGHT = 419.53;
const PAGE_MARGIN = 34;

interface PdfTextLine {
  text: string;
  size: number;
  bold: boolean;
}

export async function createMusicBingoPreviewPdfBlob(
  card: GeneratedMusicBingoCard
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('@pdfme/pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A5_LANDSCAPE_WIDTH, A5_LANDSCAPE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.07, 0.1, 0.16);
  const muted = rgb(0.33, 0.37, 0.44);
  const line = rgb(0.08, 0.1, 0.14);
  const freeFill = rgb(0.95, 0.89, 0.86);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: A5_LANDSCAPE_WIDTH,
    height: A5_LANDSCAPE_HEIGHT,
    color: rgb(1, 1, 1),
  });

  page.drawText('Music Bingo', {
    x: PAGE_MARGIN,
    y: A5_LANDSCAPE_HEIGHT - PAGE_MARGIN - 18,
    size: 18,
    font: boldFont,
    color: ink,
  });

  const brand = 'Baraja';
  page.drawText(brand, {
    x: A5_LANDSCAPE_WIDTH - PAGE_MARGIN - boldFont.widthOfTextAtSize(brand, 18),
    y: A5_LANDSCAPE_HEIGHT - PAGE_MARGIN - 18,
    size: 18,
    font: boldFont,
    color: ink,
  });

  const gridX = PAGE_MARGIN;
  const gridY = PAGE_MARGIN;
  const gridWidth = A5_LANDSCAPE_WIDTH - PAGE_MARGIN * 2;
  const gridHeight = A5_LANDSCAPE_HEIGHT - PAGE_MARGIN * 2 - 52;
  const cellSize = Math.min(gridWidth / card.boardSize, gridHeight / card.boardSize);
  const drawnGridWidth = cellSize * card.boardSize;
  const drawnGridHeight = cellSize * card.boardSize;
  const centeredGridX = gridX + (gridWidth - drawnGridWidth) / 2;

  page.drawRectangle({
    x: centeredGridX,
    y: gridY,
    width: drawnGridWidth,
    height: drawnGridHeight,
    borderColor: line,
    borderWidth: 1.1,
  });

  card.cells.forEach((cell, index) => {
    const row = Math.floor(index / card.boardSize);
    const column = index % card.boardSize;
    const x = centeredGridX + column * cellSize;
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
      borderWidth: 0.9,
    });

    const lines = buildCellTextLines(cell.label, cell.hint, cellSize, {
      labelWidth: (text, size) => boldFont.widthOfTextAtSize(text, size),
      hintWidth: (text, size) => regularFont.widthOfTextAtSize(text, size),
    });
    const totalTextHeight = lines.reduce((height, current) => height + current.size * 1.18, 0);
    let cursorY = y + cellSize / 2 + totalTextHeight / 2 - lines[0].size;

    lines.forEach((lineItem) => {
      const font = lineItem.bold ? boldFont : regularFont;
      const width = font.widthOfTextAtSize(lineItem.text, lineItem.size);

      page.drawText(lineItem.text, {
        x: x + cellSize / 2 - width / 2,
        y: cursorY,
        size: lineItem.size,
        font,
        color: lineItem.bold ? ink : muted,
      });

      cursorY -= lineItem.size * 1.18;
    });
  });

  const footer = `Carton ${card.cardNumber} - ${card.boardSize} x ${card.boardSize}`;
  page.drawText(footer, {
    x: PAGE_MARGIN,
    y: 14,
    size: 8,
    font: regularFont,
    color: muted,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
}

function buildCellTextLines(
  label: string,
  hint: string,
  cellSize: number,
  widths: {
    labelWidth: (text: string, size: number) => number;
    hintWidth: (text: string, size: number) => number;
  }
): PdfTextLine[] {
  const maxWidth = cellSize - 18;
  const labelSize = cellSize < 95 ? 13 : 16;
  const hintSize = cellSize < 95 ? 8.5 : 10.5;
  const labelLines = wrapPdfText(label, maxWidth, labelSize, widths.labelWidth).slice(0, 2);
  const hintLines = wrapPdfText(hint, maxWidth, hintSize, widths.hintWidth).slice(0, 2);

  return [
    ...labelLines.map((text) => ({ text, size: labelSize, bold: true })),
    ...hintLines.map((text) => ({ text, size: hintSize, bold: false })),
  ];
}

function wrapPdfText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: (text: string, size: number) => number
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
  measure: (text: string, size: number) => number
): string {
  if (measure(text, fontSize) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 1 && measure(`${truncated}...`, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated}...`;
}
