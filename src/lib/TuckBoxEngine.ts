/**
 * TuckBoxEngine — Editorial-quality tuck box dieline generator.
 *
 * Generates premium packaging dielines with:
 * - Calculated dimensions from card size + count
 * - Rich editorial SVG with gradients, ornaments, decorative borders
 * - Per-edition color palettes and theming
 * - PDF export via @pdfme/pdf-lib
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TuckBoxDimensions {
  boxW: number;     // Interior width (card width + tolerance)
  boxH: number;     // Interior height (card height + tolerance)
  boxD: number;     // Depth (card stack + tolerance)
  bleed: number;    // Bleed margin (mm)
  totalW: number;   // Full dieline width (all panels + tabs + bleed)
  totalH: number;   // Full dieline height (all panels + flaps + bleed)
}

export interface TuckBoxParams {
  cardWidth: number;
  cardHeight: number;
  numCards: number;
  cardThickness?: number;  // mm per card (default: 0.4 for 300g)
  tolerance?: number;      // mm extra (default: 1)
  bleed?: number;          // mm (default: 3)
  tuckFlapH?: number;      // mm tuck-in flap height (default: 15)
  glueFlapW?: number;      // mm glue tab width (default: 10)
  dustFlapH?: number;      // mm dust flap height (default: boxD)
}

export interface TuckBoxColors {
  primary: string;
  secondary: string;
  accent: string;
  textColor: string;
  darkBg: string;
}

export interface TuckBoxContent {
  deckName: string;
  editionLabel: string;
  description: string;
  numCards: number;
  tagline?: string;
}

// ── Edition Color Palettes ───────────────────────────────────────────────────

export const EDITION_COLORS: Record<string, TuckBoxColors> = {
  barometro: {
    primary: '#1B3A4B',
    secondary: '#D4AF64',
    accent: '#4A8B9E',
    textColor: '#f0ebe3',
    darkBg: '#0d1f2a',
  },
  trivia: {
    primary: '#141E61',
    secondary: '#FFD54F',
    accent: '#3B5998',
    textColor: '#f5f5f5',
    darkBg: '#0a0f30',
  },
  juegos: {
    primary: '#BF360C',
    secondary: '#FFE082',
    accent: '#FF8A65',
    textColor: '#fff8e1',
    darkBg: '#4E1500',
  },
  rompelo: {
    primary: '#5B0A3A',
    secondary: '#CE93D8',
    accent: '#F48FB1',
    textColor: '#fce4ec',
    darkBg: '#2A0020',
  },
  custom: {
    primary: '#1a1a1a',
    secondary: '#D4AF64',
    accent: '#555555',
    textColor: '#e0e0e0',
    darkBg: '#0a0a0a',
  },
};

export function getEditionColors(editionId: string): TuckBoxColors {
  if (EDITION_COLORS[editionId]) return EDITION_COLORS[editionId];
  for (const [key, colors] of Object.entries(EDITION_COLORS)) {
    if (editionId.toLowerCase().includes(key)) return colors;
  }
  return EDITION_COLORS.custom;
}

// ── Dimension Calculator ─────────────────────────────────────────────────────

export function calculateTuckBoxDimensions(params: TuckBoxParams): TuckBoxDimensions {
  const {
    cardWidth, cardHeight, numCards,
    cardThickness = 0.4,
    tolerance = 1,
    bleed = 3,
    tuckFlapH = 15,
    glueFlapW = 10,
  } = params;

  const boxW = cardWidth + tolerance;
  const boxH = cardHeight + tolerance;
  const boxD = (numCards * cardThickness) + (tolerance * 2);
  const dustFlapH = params.dustFlapH ?? boxD;

  const totalW = glueFlapW + boxD + boxW + boxD + glueFlapW + (bleed * 2);
  const totalH = tuckFlapH + dustFlapH + boxH + boxD + boxH + boxD + tuckFlapH + (bleed * 2);

  return { boxW, boxH, boxD, bleed, totalW, totalH };
}

export function generateTuckBoxSVG(
  params: TuckBoxParams,
  colors: TuckBoxColors,
  content: TuckBoxContent,
): string {
  const {
    bleed = 3,
    tuckFlapH = 15,
    glueFlapW = 10,
  } = params;

  const dims = calculateTuckBoxDimensions(params);
  const { boxW, boxH, boxD } = dims;
  const dustFlapH = params.dustFlapH ?? boxD;

  const svgW = dims.totalW;
  const svgH = dims.totalH;

  // ── Reference coordinates ────────────────────────────────────────────────
  const b = bleed;

  const xGlueL = b;
  const xSideL = xGlueL + glueFlapW;
  const xFront = xSideL + boxD;
  const xSideR = xFront + boxW;
  const xGlueR = xSideR + boxD;

  const yTuckTop = b;
  const yDustTop = yTuckTop + tuckFlapH;
  const yFront = yDustTop + dustFlapH;
  const yBottom = yFront + boxH;
  const yBack = yBottom + boxD;
  const yTopPanel = yBack + boxH;
  const yTuckBot = yTopPanel + boxD;

  const cutLine = 'stroke:#222;stroke-width:0.35;fill:none';
  const foldLine = 'stroke:#999;stroke-width:0.25;stroke-dasharray:1.5,1;fill:none';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}mm" height="${svgH}mm">`;

  // ── DEFINITIONS ──────────────────────────────────────────────────────────
  svg += `<defs>`;

  // Base gradient — rich multi-stop vertical
  svg += `<linearGradient id="mainGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${colors.primary}"/>
    <stop offset="15%" stop-color="${colors.darkBg}" stop-opacity="0.95"/>
    <stop offset="50%" stop-color="${colors.darkBg}"/>
    <stop offset="85%" stop-color="${colors.darkBg}" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="${colors.primary}"/>
  </linearGradient>`;

  // Radial center glow — subtle light bloom
  svg += `<radialGradient id="centerGlow" cx="0.5" cy="0.42" r="0.55" fx="0.5" fy="0.35">
    <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.12"/>
    <stop offset="40%" stop-color="${colors.primary}" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="${colors.darkBg}" stop-opacity="0"/>
  </radialGradient>`;

  // Diagonal shine — top-left to center subtle highlight
  svg += `<linearGradient id="shineGrad" x1="0" y1="0" x2="0.6" y2="0.7">
    <stop offset="0%" stop-color="${colors.textColor}" stop-opacity="0.06"/>
    <stop offset="35%" stop-color="${colors.textColor}" stop-opacity="0.02"/>
    <stop offset="100%" stop-color="${colors.darkBg}" stop-opacity="0"/>
  </linearGradient>`;

  // Warm vignette — edges darken
  svg += `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.7">
    <stop offset="0%" stop-color="${colors.darkBg}" stop-opacity="0"/>
    <stop offset="70%" stop-color="${colors.darkBg}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${colors.darkBg}" stop-opacity="0.4"/>
  </radialGradient>`;

  // Side gradient
  svg += `<linearGradient id="sideGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.95"/>
    <stop offset="50%" stop-color="${colors.darkBg}"/>
    <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.5"/>
  </linearGradient>`;

  // Tuck flap gradient
  svg += `<linearGradient id="tuckGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${colors.darkBg}"/>
    <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.7"/>
  </linearGradient>`;

  // Grain texture
  svg += `<pattern id="grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
    <rect width="3" height="3" fill="none"/>
    <circle cx="0.8" cy="0.8" r="0.15" fill="${colors.secondary}" opacity="0.03"/>
    <circle cx="2.2" cy="2.2" r="0.12" fill="${colors.textColor}" opacity="0.015"/>
  </pattern>`;

  // Diamond micro-pattern
  const dpSize = Math.min(boxW * 0.04, 4);
  svg += `<pattern id="diamondPat" x="0" y="0" width="${dpSize}" height="${dpSize}" patternUnits="userSpaceOnUse">
    <polygon points="${dpSize / 2},0.3 ${dpSize - 0.3},${dpSize / 2} ${dpSize / 2},${dpSize - 0.3} 0.3,${dpSize / 2}" fill="none" stroke="${colors.secondary}" stroke-width="0.08" opacity="0.1"/>
  </pattern>`;

  // Brandmark: B in diamond
  svg += `<symbol id="brandmark" viewBox="0 0 20 24">
    <polygon points="10,0 20,12 10,24 0,12" fill="none" stroke="${colors.secondary}" stroke-width="0.8"/>
    <polygon points="10,1.5 18.7,12 10,22.5 1.3,12" fill="none" stroke="${colors.secondary}" stroke-width="0.3" opacity="0.5"/>
    <text x="10" y="15.5" text-anchor="middle" font-family="'Cormorant Garamond','Georgia',serif" font-size="12" fill="${colors.secondary}" font-weight="700">B</text>
  </symbol>`;

  svg += `</defs>`;

  // White page
  svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff"/>`;

  // ── PANEL FILLS ─────────────────────────────────────────────────────────

  // Front panel — layered gradient stack
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#mainGrad)"/>`;
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#centerGlow)"/>`;
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#shineGrad)"/>`;
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#vignette)"/>`;
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#grain)"/>`;
  svg += `<rect x="${xFront}" y="${yFront}" width="${boxW}" height="${boxH}" fill="url(#diamondPat)"/>`;

  // Back panel — same layered stack
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#mainGrad)"/>`;
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#centerGlow)"/>`;
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#shineGrad)"/>`;
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#vignette)"/>`;
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#grain)"/>`;
  svg += `<rect x="${xFront}" y="${yBack}" width="${boxW}" height="${boxH}" fill="url(#diamondPat)"/>`;

  // Bottom & top panels
  svg += `<rect x="${xFront}" y="${yBottom}" width="${boxW}" height="${boxD}" fill="${colors.darkBg}"/>`;
  svg += `<rect x="${xFront}" y="${yTopPanel}" width="${boxW}" height="${boxD}" fill="${colors.darkBg}"/>`;

  // Side panels
  for (const [sx, sy] of [[xSideL, yFront], [xSideR, yFront], [xSideL, yBack], [xSideR, yBack]]) {
    svg += `<rect x="${sx}" y="${sy}" width="${boxD}" height="${boxH}" fill="url(#sideGrad)"/>`;
  }
  svg += `<rect x="${xSideL}" y="${yBottom}" width="${boxD}" height="${boxD}" fill="${colors.darkBg}" opacity="0.9"/>`;
  svg += `<rect x="${xSideR}" y="${yBottom}" width="${boxD}" height="${boxD}" fill="${colors.darkBg}" opacity="0.9"/>`;

  // Tuck flaps
  svg += `<rect x="${xFront}" y="${yTuckTop}" width="${boxW}" height="${tuckFlapH}" fill="url(#tuckGrad)"/>`;
  svg += `<rect x="${xFront}" y="${yTuckBot}" width="${boxW}" height="${tuckFlapH}" fill="url(#tuckGrad)"/>`;

  // Dust flaps
  svg += `<rect x="${xSideL}" y="${yDustTop}" width="${boxD}" height="${dustFlapH}" fill="${colors.primary}" opacity="0.3"/>`;
  svg += `<rect x="${xSideR}" y="${yDustTop}" width="${boxD}" height="${dustFlapH}" fill="${colors.primary}" opacity="0.3"/>`;

  // Glue tabs
  svg += `<rect x="${xGlueL}" y="${yFront}" width="${glueFlapW}" height="${boxH}" fill="${colors.primary}" opacity="0.1"/>`;
  svg += `<rect x="${xGlueR}" y="${yFront}" width="${glueFlapW}" height="${boxH}" fill="${colors.primary}" opacity="0.1"/>`;
  svg += `<rect x="${xGlueL}" y="${yBottom}" width="${glueFlapW}" height="${boxD}" fill="${colors.primary}" opacity="0.06"/>`;
  svg += `<rect x="${xGlueR}" y="${yBottom}" width="${glueFlapW}" height="${boxD}" fill="${colors.primary}" opacity="0.06"/>`;

  // ── FRONT PANEL — EDITORIAL DESIGN ───────────────────────────────────────

  const fCx = xFront + boxW / 2;
  const fCy = yFront + boxH / 2;
  const margin = Math.min(boxW, boxH) * 0.06;

  // Double decorative border
  const bx = xFront + margin;
  const by = yFront + margin;
  const bw = boxW - margin * 2;
  const bh = boxH - margin * 2;
  svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="0.5" fill="none" stroke="${colors.secondary}" stroke-width="0.25" opacity="0.45"/>`;
  svg += `<rect x="${bx + 1.5}" y="${by + 1.5}" width="${bw - 3}" height="${bh - 3}" rx="0.3" fill="none" stroke="${colors.secondary}" stroke-width="0.12" opacity="0.25"/>`;

  // Corner ornaments — cross detail
  const cL = Math.min(boxW, boxH) * 0.07;
  const cO = margin - 0.5;
  const corners = [
    [xFront + cO, yFront + cO, 1, 1],
    [xFront + boxW - cO, yFront + cO, -1, 1],
    [xFront + cO, yFront + boxH - cO, 1, -1],
    [xFront + boxW - cO, yFront + boxH - cO, -1, -1],
  ] as const;
  for (const [cx, cy, dx, dy] of corners) {
    svg += `<line x1="${cx}" y1="${cy}" x2="${cx + cL * dx}" y2="${cy}" stroke="${colors.secondary}" stroke-width="0.4" opacity="0.6"/>`;
    svg += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + cL * dy}" stroke="${colors.secondary}" stroke-width="0.4" opacity="0.6"/>`;
    // Small diamond at corner intersection
    const dOff = 1.8;
    svg += `<polygon points="${cx + dOff * dx},${cy} ${cx},${cy + dOff * dy} ${cx - dOff * dx * 0.3},${cy} ${cx},${cy - dOff * dy * 0.3}" fill="${colors.secondary}" opacity="0.2"/>`;
  }

  // ── Brandmark (centered, upper area)
  const bmSize = Math.min(boxW * 0.2, 16);
  const bmY = fCy - boxH * 0.3;
  svg += `<use href="#brandmark" x="${fCx - bmSize / 2}" y="${bmY - bmSize * 0.5}" width="${bmSize}" height="${bmSize * 1.2}"/>`;

  // ── Filigree separator (ornamental rule)
  const sepY = fCy - boxH * 0.1;
  const sepW = boxW * 0.4;
  svg += `<line x1="${fCx - sepW / 2}" y1="${sepY}" x2="${fCx - 2}" y2="${sepY}" stroke="${colors.secondary}" stroke-width="0.2" opacity="0.5"/>`;
  svg += `<line x1="${fCx + 2}" y1="${sepY}" x2="${fCx + sepW / 2}" y2="${sepY}" stroke="${colors.secondary}" stroke-width="0.2" opacity="0.5"/>`;
  // Center diamond
  svg += `<polygon points="${fCx},${sepY - 1.2} ${fCx + 1.2},${sepY} ${fCx},${sepY + 1.2} ${fCx - 1.2},${sepY}" fill="${colors.secondary}" opacity="0.45"/>`;
  // End diamonds
  svg += `<polygon points="${fCx - sepW / 2},${sepY} ${fCx - sepW / 2 + 0.6},${sepY - 0.6} ${fCx - sepW / 2 + 1.2},${sepY} ${fCx - sepW / 2 + 0.6},${sepY + 0.6}" fill="${colors.secondary}" opacity="0.25"/>`;
  svg += `<polygon points="${fCx + sepW / 2},${sepY} ${fCx + sepW / 2 - 0.6},${sepY - 0.6} ${fCx + sepW / 2 - 1.2},${sepY} ${fCx + sepW / 2 - 0.6},${sepY + 0.6}" fill="${colors.secondary}" opacity="0.25"/>`;

  // ── Typography — EDITION NAME is the HERO ──
  const heroSize = Math.min(boxW * 0.16, 15);
  const brandTagSize = Math.min(boxW * 0.04, 3.8);

  // Edition name — large serif hero
  svg += `<text x="${fCx}" y="${fCy + 2}" text-anchor="middle" font-family="'Cormorant Garamond','Georgia',serif" font-size="${heroSize}" fill="${colors.secondary}" font-weight="700" letter-spacing="${heroSize * 0.2}">${escapeXml(content.editionLabel.toUpperCase())}</text>`;

  // Separator under edition name
  const sep2Y = fCy + heroSize * 0.4;
  const sep2W = boxW * 0.2;
  svg += `<line x1="${fCx - sep2W / 2}" y1="${sep2Y}" x2="${fCx + sep2W / 2}" y2="${sep2Y}" stroke="${colors.secondary}" stroke-width="0.15" opacity="0.35"/>`;

  // Description
  if (content.description) {
    const dSize = Math.min(boxW * 0.04, 4);
    const dMaxW = boxW * 0.62;
    const dLines = wrapText(content.description, Math.floor(dMaxW / (dSize * 0.45)));
    const dStartY = fCy + boxH * 0.14;
    dLines.forEach((line, i) => {
      svg += `<text x="${fCx}" y="${dStartY + i * (dSize * 1.6)}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${dSize}" fill="${colors.textColor}" opacity="0.5" font-style="italic">${escapeXml(line)}</text>`;
    });
  }

  // Card count
  const countY = yFront + boxH - margin - 10;
  const countSize = Math.min(boxW * 0.04, 3.5);
  svg += `<polygon points="${fCx - boxW * 0.1},${countY - countSize * 0.3} ${fCx - boxW * 0.1 + 0.7},${countY - countSize * 0.3 - 0.7} ${fCx - boxW * 0.1 + 1.4},${countY - countSize * 0.3} ${fCx - boxW * 0.1 + 0.7},${countY - countSize * 0.3 + 0.7}" fill="${colors.secondary}" opacity="0.3"/>`;
  svg += `<polygon points="${fCx + boxW * 0.1},${countY - countSize * 0.3} ${fCx + boxW * 0.1 - 0.7},${countY - countSize * 0.3 - 0.7} ${fCx + boxW * 0.1 - 1.4},${countY - countSize * 0.3} ${fCx + boxW * 0.1 - 0.7},${countY - countSize * 0.3 + 0.7}" fill="${colors.secondary}" opacity="0.3"/>`;
  svg += `<text x="${fCx}" y="${countY}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${countSize}" fill="${colors.secondary}" opacity="0.6" letter-spacing="${countSize * 0.25}">${content.numCards} CARTAS</text>`;

  // BARAJA — small brand tag at very bottom
  const brandY = yFront + boxH - margin - 3;
  svg += `<text x="${fCx}" y="${brandY}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${brandTagSize}" fill="${colors.textColor}" opacity="0.3" letter-spacing="${brandTagSize * 0.4}">BARAJA</text>`;

  // ── TUCK FLAPS — brandmark on each ──────────────────────────────────────
  const tuckBmSize = Math.min(tuckFlapH * 0.7, boxW * 0.1, 8);
  // Top tuck
  svg += `<use href="#brandmark" x="${fCx - tuckBmSize / 2}" y="${yTuckTop + (tuckFlapH - tuckBmSize * 1.2) / 2}" width="${tuckBmSize}" height="${tuckBmSize * 1.2}" opacity="0.5"/>`;
  // Bottom tuck
  svg += `<use href="#brandmark" x="${fCx - tuckBmSize / 2}" y="${yTuckBot + (tuckFlapH - tuckBmSize * 1.2) / 2}" width="${tuckBmSize}" height="${tuckBmSize * 1.2}" opacity="0.5"/>`;

  // ── BACK PANEL — EDITORIAL ──────────────────────────────────────────────

  const bCx = xFront + boxW / 2;
  const bCy = yBack + boxH / 2;

  // Border
  svg += `<rect x="${xFront + margin}" y="${yBack + margin}" width="${boxW - margin * 2}" height="${boxH - margin * 2}" rx="0.5" fill="none" stroke="${colors.secondary}" stroke-width="0.18" opacity="0.3"/>`;

  // Back content rotated 180° (for when folded)
  svg += `<g transform="rotate(180 ${bCx} ${bCy})">`;

  // Brandmark (back, smaller)
  const backBmSize = bmSize * 0.5;
  svg += `<use href="#brandmark" x="${bCx - backBmSize / 2}" y="${bCy - boxH * 0.3}" width="${backBmSize}" height="${backBmSize * 1.2}" opacity="0.35"/>`;

  // Edition name — hero on back too
  const backHeroSize = heroSize * 0.6;
  svg += `<text x="${bCx}" y="${bCy - boxH * 0.05}" text-anchor="middle" font-family="'Cormorant Garamond',serif" font-size="${backHeroSize}" fill="${colors.secondary}" font-weight="700" letter-spacing="${backHeroSize * 0.15}">${escapeXml(content.editionLabel.toUpperCase())}</text>`;

  // Tagline
  const tag = content.tagline || content.description;
  if (tag) {
    const tSize = Math.min(boxW * 0.035, 3.3);
    const tLines = wrapText(tag, Math.floor((boxW * 0.55) / (tSize * 0.45)));
    tLines.slice(0, 3).forEach((line, i) => {
      svg += `<text x="${bCx}" y="${bCy + backHeroSize * 0.5 + i * (tSize * 1.5)}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${tSize}" fill="${colors.textColor}" opacity="0.4" font-style="italic">${escapeXml(line)}</text>`;
    });
  }

  // BARAJA brand + URL at bottom of back
  const backBrandSize = Math.min(boxW * 0.035, 3);
  svg += `<text x="${bCx}" y="${bCy + boxH * 0.25}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${backBrandSize}" fill="${colors.textColor}" opacity="0.25" letter-spacing="${backBrandSize * 0.35}">BARAJA</text>`;
  const urlSize = Math.min(boxW * 0.032, 2.8);
  svg += `<text x="${bCx}" y="${bCy + boxH * 0.3}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${urlSize}" fill="${colors.secondary}" opacity="0.4" letter-spacing="${urlSize * 0.2}">baraja.cards</text>`;

  svg += `</g>`;

  // ── SIDE PANELS — spine ─────────────────────────────────────────────────

  const sSize = Math.min(boxD * 0.4, 4);

  // Front sides
  const sides: [number, number, number][] = [
    [xSideL + boxD / 2, yFront + boxH / 2, -90],
    [xSideR + boxD / 2, yFront + boxH / 2, 90],
  ];
  for (const [sx, sy, rot] of sides) {
    svg += `<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="central" font-family="'Inter',sans-serif" font-size="${sSize}" fill="${colors.textColor}" opacity="0.6" letter-spacing="${sSize * 0.2}" transform="rotate(${rot} ${sx} ${sy})">${escapeXml(content.deckName.toUpperCase())}</text>`;
  }

  // Back sides — edition
  const backSides: [number, number, number][] = [
    [xSideL + boxD / 2, yBack + boxH / 2, -90],
    [xSideR + boxD / 2, yBack + boxH / 2, 90],
  ];
  for (const [sx, sy, rot] of backSides) {
    svg += `<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="central" font-family="'Cormorant Garamond',serif" font-size="${sSize * 0.8}" fill="${colors.secondary}" opacity="0.45" transform="rotate(${rot} ${sx} ${sy})">${escapeXml(content.editionLabel)}</text>`;
  }

  // ── BOTTOM / TOP PANELS ─────────────────────────────────────────────────
  const panelSize = Math.min(boxD * 0.3, 2.5);
  // Bottom — brandmark
  const botBmS = Math.min(boxD * 0.55, 5);
  svg += `<use href="#brandmark" x="${xFront + boxW / 2 - botBmS / 2}" y="${yBottom + (boxD - botBmS * 1.2) / 2}" width="${botBmS}" height="${botBmS * 1.2}" opacity="0.35"/>`;
  // Top
  svg += `<text x="${xFront + boxW / 2}" y="${yTopPanel + boxD / 2 + panelSize * 0.35}" text-anchor="middle" font-family="'Inter',sans-serif" font-size="${panelSize}" fill="${colors.secondary}" opacity="0.4" letter-spacing="${panelSize * 0.3}">BARAJA</text>`;

  // ── CUT OUTLINE ──────────────────────────────────────────────────────────

  const r = 1.5;
  const outline = [
    `M ${xFront + r} ${yTuckTop}`,
    `L ${xFront + boxW - r} ${yTuckTop}`,
    `Q ${xFront + boxW} ${yTuckTop} ${xFront + boxW} ${yTuckTop + r}`,
    `L ${xFront + boxW} ${yDustTop}`,
    `L ${xSideR + boxD} ${yDustTop}`,
    `L ${xSideR + boxD} ${yFront}`,
    `L ${xGlueR + glueFlapW} ${yFront}`,
    `L ${xGlueR + glueFlapW} ${yFront + boxH}`,
    `L ${xSideR + boxD} ${yFront + boxH}`,
    `L ${xSideR + boxD} ${yBottom + boxD}`,
    `L ${xSideR + boxD} ${yBack + boxH}`,
    `L ${xFront + boxW} ${yBack + boxH}`,
    `L ${xFront + boxW} ${yTopPanel + boxD}`,
    `L ${xFront + boxW} ${yTuckBot + tuckFlapH - r}`,
    `Q ${xFront + boxW} ${yTuckBot + tuckFlapH} ${xFront + boxW - r} ${yTuckBot + tuckFlapH}`,
    `L ${xFront + r} ${yTuckBot + tuckFlapH}`,
    `Q ${xFront} ${yTuckBot + tuckFlapH} ${xFront} ${yTuckBot + tuckFlapH - r}`,
    `L ${xFront} ${yTopPanel + boxD}`,
    `L ${xFront} ${yBack + boxH}`,
    `L ${xSideL} ${yBack + boxH}`,
    `L ${xSideL} ${yBottom + boxD}`,
    `L ${xSideL} ${yFront + boxH}`,
    `L ${xGlueL} ${yFront + boxH}`,
    `L ${xGlueL} ${yFront}`,
    `L ${xSideL} ${yFront}`,
    `L ${xSideL} ${yDustTop}`,
    `L ${xFront} ${yDustTop}`,
    `L ${xFront} ${yTuckTop + r}`,
    `Q ${xFront} ${yTuckTop} ${xFront + r} ${yTuckTop}`,
    'Z',
  ].join(' ');

  svg += `<path d="${outline}" style="${cutLine}"/>`;

  // ── FOLD LINES ───────────────────────────────────────────────────────────

  const hFolds = [
    { y: yDustTop, x1: xFront, x2: xFront + boxW },
    { y: yDustTop, x1: xSideL, x2: xSideL + boxD },
    { y: yDustTop, x1: xSideR, x2: xSideR + boxD },
    { y: yFront, x1: xGlueL, x2: xGlueR + glueFlapW },
    { y: yBottom, x1: xSideL, x2: xSideR + boxD },
    { y: yBack, x1: xSideL, x2: xSideR + boxD },
    { y: yTopPanel, x1: xFront, x2: xFront + boxW },
    { y: yTuckBot, x1: xFront, x2: xFront + boxW },
  ];

  const vFolds = [
    { x: xSideL, y1: yDustTop, y2: yBack + boxH },
    { x: xFront, y1: yTuckTop, y2: yTuckBot + tuckFlapH },
    { x: xFront + boxW, y1: yTuckTop, y2: yTuckBot + tuckFlapH },
    { x: xSideR, y1: yDustTop, y2: yBack + boxH },
  ];

  for (const f of hFolds) {
    svg += `<line x1="${f.x1}" y1="${f.y}" x2="${f.x2}" y2="${f.y}" style="${foldLine}"/>`;
  }
  for (const f of vFolds) {
    svg += `<line x1="${f.x}" y1="${f.y1}" x2="${f.x}" y2="${f.y2}" style="${foldLine}"/>`;
  }

  // ── DIMENSION ANNOTATIONS ────────────────────────────────────────────────
  const aColor = '#999';
  const aSize = 2.5;
  const aOff = 3;

  svg += `<text x="${xFront + boxW / 2}" y="${yTuckTop - aOff}" text-anchor="middle" font-family="sans-serif" font-size="${aSize}" fill="${aColor}">${boxW.toFixed(1)}mm</text>`;
  svg += `<text x="${xGlueR + glueFlapW + aOff + 1}" y="${yFront + boxH / 2}" text-anchor="start" font-family="sans-serif" font-size="${aSize}" fill="${aColor}" transform="rotate(90 ${xGlueR + glueFlapW + aOff + 1} ${yFront + boxH / 2})">${boxH.toFixed(1)}mm</text>`;
  svg += `<text x="${xFront + boxW / 2}" y="${yBottom + boxD / 2 + 0.8}" text-anchor="middle" font-family="sans-serif" font-size="${aSize}" fill="${aColor}" opacity="0.6">D: ${boxD.toFixed(1)}mm</text>`;

  svg += '</svg>';
  return svg;
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export async function generateTuckBoxPdf(
  params: TuckBoxParams,
  colors: TuckBoxColors,
  content: TuckBoxContent,
): Promise<Blob> {
  const { PDFDocument } = await import('@pdfme/pdf-lib');

  const svgString = generateTuckBoxSVG(params, colors, content);
  const dims = calculateTuckBoxDimensions(params);

  const pngDataUrl = await svgToPng(svgString, dims.totalW, dims.totalH, 300);

  const pdfDoc = await PDFDocument.create();
  const mmToPt = 2.83465;
  const pageW = dims.totalW * mmToPt;
  const pageH = dims.totalH * mmToPt;

  const page = pdfDoc.addPage([pageW, pageH]);

  const pngBytes = await fetch(pngDataUrl).then(r => r.arrayBuffer());
  const pngImage = await pdfDoc.embedPng(pngBytes);

  page.drawImage(pngImage, { x: 0, y: 0, width: pageW, height: pageH });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function svgToPng(svgString: string, widthMm: number, heightMm: number, dpi: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const scale = dpi / 25.4;
    const canvasW = Math.ceil(widthMm * scale);
    const canvasH = Math.ceil(heightMm * scale);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('No 2D context')); return; }

    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG render failed'));
    };
    img.src = url;
  });
}

function wrapText(text: string, charsPerLine: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > charsPerLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
