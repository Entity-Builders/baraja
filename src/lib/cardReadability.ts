import type { Schema, Template } from '@pdfme/common';

type StyledSchema = Schema & {
  barColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  color?: string;
  fontColor?: string;
  opacity?: number;
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const READABLE_DARK = '#1a0d02';
const READABLE_LIGHT = '#ffffff';
const MIN_BODY_CONTRAST = 4.5;
const MIN_SUPPORTING_CONTRAST = 3;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const sampleCache = new Map<string, Promise<Rgb | null>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getSchemaRect(schema: Schema): Rect {
  return {
    x: schema.position.x,
    y: schema.position.y,
    width: schema.width,
    height: schema.height,
  };
}

function getIntersection(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function parseCssColor(color: string | undefined): Rgb | null {
  if (!color) return null;
  const value = color.trim();

  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('').map(channel => parseInt(channel + channel, 16));
    return { r, g, b, a: 1 };
  }

  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1].split(',').map(part => part.trim());
    const [r, g, b] = parts.slice(0, 3).map(part => clamp(Number.parseFloat(part), 0, 255));
    const a = parts[3] === undefined ? 1 : clamp(Number.parseFloat(parts[3]), 0, 1);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }

  return null;
}

function blend(foreground: Rgb, background: Rgb): Rgb {
  const alpha = foreground.a;
  return {
    r: Math.round((foreground.r * alpha) + (background.r * (1 - alpha))),
    g: Math.round((foreground.g * alpha) + (background.g * (1 - alpha))),
    b: Math.round((foreground.b * alpha) + (background.b * (1 - alpha))),
    a: 1,
  };
}

function relativeLuminance(color: Rgb): number {
  const [r, g, b] = [color.r, color.g, color.b].map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableColor(
  color: string | undefined,
  background: Rgb,
  minContrast = MIN_BODY_CONTRAST,
  opacity = 1,
): string | undefined {
  const parsed = parseCssColor(color);
  if (!parsed) return color;

  const effectiveForeground = blend({ ...parsed, a: parsed.a * opacity }, background);
  if (contrastRatio(effectiveForeground, background) >= minContrast) return color;

  const dark = parseCssColor(READABLE_DARK);
  const light = parseCssColor(READABLE_LIGHT);
  if (!dark || !light) return color;

  return contrastRatio(dark, background) >= contrastRatio(light, background)
    ? READABLE_DARK
    : READABLE_LIGHT;
}

function getSolidSchemaBackground(schema: StyledSchema): Rgb | null {
  const backgroundColor = schema.type === 'rectangle' || schema.type === 'line'
    ? schema.backgroundColor || schema.color
    : schema.backgroundColor;
  const parsed = parseCssColor(backgroundColor);
  if (!parsed || parsed.a <= 0.05) return null;
  return parsed.a < 1 ? blend(parsed, { r: 255, g: 255, b: 255, a: 1 }) : parsed;
}

function getSchemaColor(schema: StyledSchema): string | undefined {
  if (schema.type === 'qrcode') return schema.barColor || schema.fontColor;
  return schema.fontColor || schema.color;
}

function getMinContrast(schema: StyledSchema): number {
  if (schema.type === 'qrcode') return MIN_SUPPORTING_CONTRAST;
  if (schema.name.toLowerCase().includes('brand')) return MIN_SUPPORTING_CONTRAST;
  return MIN_BODY_CONTRAST;
}

function getImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);

  const cached = imageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

export async function sampleImageRegionAverage(
  src: string,
  targetRect: Rect,
  imageRect: Rect,
): Promise<Rgb | null> {
  if (typeof document === 'undefined') return null;

  const cacheKey = [
    src,
    targetRect.x.toFixed(2),
    targetRect.y.toFixed(2),
    targetRect.width.toFixed(2),
    targetRect.height.toFixed(2),
    imageRect.x.toFixed(2),
    imageRect.y.toFixed(2),
    imageRect.width.toFixed(2),
    imageRect.height.toFixed(2),
  ].join('|');
  const cached = sampleCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<Rgb | null> => {
    const image = await getImage(src);
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;

    const intersection = getIntersection(targetRect, imageRect);
    if (!intersection) return null;

    const scale = Math.max(
      imageRect.width / image.naturalWidth,
      imageRect.height / image.naturalHeight,
    );
    const displayedWidth = image.naturalWidth * scale;
    const displayedHeight = image.naturalHeight * scale;
    const cropX = Math.max(0, (displayedWidth - imageRect.width) / 2);
    const cropY = Math.max(0, (displayedHeight - imageRect.height) / 2);

    const localX = intersection.x - imageRect.x;
    const localY = intersection.y - imageRect.y;
    const sx = clamp((localX + cropX) / scale, 0, image.naturalWidth - 1);
    const sy = clamp((localY + cropY) / scale, 0, image.naturalHeight - 1);
    const sw = clamp(intersection.width / scale, 1, image.naturalWidth - sx);
    const sh = clamp(intersection.height / scale, 1, image.naturalHeight - sy);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.min(48, Math.round(sw)));
    canvas.height = Math.max(1, Math.min(48, Math.round(sh)));

    const context = canvas.getContext('2d');
    if (!context) return null;

    try {
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        if (alpha <= 0.05) continue;
        r += pixels[index];
        g += pixels[index + 1];
        b += pixels[index + 2];
        count += 1;
      }

      if (count === 0) return null;
      return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
        a: 1,
      };
    } catch {
      return null;
    }
  })();

  sampleCache.set(cacheKey, promise);
  return promise;
}

async function getBackgroundForSchema(
  schema: StyledSchema,
  index: number,
  schemas: StyledSchema[],
  mockData: Record<string, string>,
): Promise<Rgb | null> {
  const ownBackground = getSolidSchemaBackground(schema);
  if (ownBackground) return ownBackground;

  const targetRect = getSchemaRect(schema);

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = schemas[previousIndex];
    const previousRect = getSchemaRect(previous);
    if (!getIntersection(targetRect, previousRect)) continue;

    if (previous.type === 'image') {
      const src = mockData[previous.name] || String((previous as { content?: unknown }).content ?? '');
      if (!src) continue;
      const sampled = await sampleImageRegionAverage(src, targetRect, previousRect);
      if (sampled) return sampled;
    }

    if (previous.type === 'rectangle') {
      const solid = getSolidSchemaBackground(previous);
      if (solid) return solid;
    }
  }

  return null;
}

export async function resolveReadableSchemaColorOverrides(
  schemas: Schema[],
  mockData: Record<string, string>,
): Promise<Record<string, string>> {
  const styledSchemas = schemas as StyledSchema[];
  const overrides: Record<string, string> = {};

  await Promise.all(styledSchemas.map(async (schema, index) => {
    if (schema.type !== 'text' && schema.type !== 'qrcode') return;

    const currentColor = getSchemaColor(schema);
    if (!currentColor) return;

    const background = await getBackgroundForSchema(schema, index, styledSchemas, mockData);
    if (!background) return;

    const readable = getReadableColor(
      currentColor,
      background,
      getMinContrast(schema),
      typeof schema.opacity === 'number' ? schema.opacity : 1,
    );

    if (readable && readable !== currentColor) {
      overrides[schema.name] = readable;
    }
  }));

  return overrides;
}

export async function applyReadableSchemaColors(
  template: Template,
  mockData: Record<string, string>,
): Promise<Template> {
  const next = JSON.parse(JSON.stringify(template)) as Template;

  next.schemas = await Promise.all(next.schemas.map(async page => {
    const overrides = await resolveReadableSchemaColorOverrides(page, mockData);
    return page.map(schema => {
      const readable = overrides[schema.name];
      if (!readable) return schema;

      if (schema.type === 'qrcode') {
        return { ...schema, barColor: readable } as Schema;
      }

      return { ...schema, fontColor: readable } as Schema;
    });
  }));

  return next;
}
