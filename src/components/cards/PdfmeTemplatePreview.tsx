import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Schema, Template } from '@pdfme/common';
import { resolveReadableSchemaColorOverrides } from '../../lib/cardReadability';
import { getPdfmeTemplateSize } from '../../lib/pdfmeTemplateSize';

type PreviewSchema = Schema & {
  fontSize?: number;
  fontColor?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  fontName?: string;
  fontWeight?: string | number;
  letterSpacing?: number;
  lineHeight?: number;
  barColor?: string;
  dynamicFontSize?: {
    min?: number;
    max?: number;
    fit?: string;
  };
};

const PT_TO_MM = 0.352777778;

function getSchemaContent(schema: PreviewSchema, mockData: Record<string, string>) {
  return mockData[schema.name] !== undefined ? String(mockData[schema.name]) : schema.content ?? '';
}

function getTextFontSizePx(schema: PreviewSchema, content: string, scale: number) {
  const maxPt = schema.dynamicFontSize?.max ?? schema.fontSize ?? 9;
  const minPt = schema.dynamicFontSize?.min ?? Math.max(3, maxPt * 0.5);
  const lineHeight = schema.lineHeight ?? 1.15;
  const boxWidthPx = Math.max(1, schema.width * scale);
  const boxHeightPx = Math.max(1, schema.height * scale);

  let fontPx = maxPt * PT_TO_MM * scale;
  const minPx = minPt * PT_TO_MM * scale;

  if (content.trim().length > 0 && schema.dynamicFontSize?.fit === 'vertical') {
    for (let i = 0; i < 8; i += 1) {
      const averageGlyphWidth = fontPx * 0.48;
      const estimatedLineChars = Math.max(1, Math.floor(boxWidthPx / averageGlyphWidth));
      const estimatedLines = Math.max(1, Math.ceil(content.length / estimatedLineChars));
      const estimatedHeight = estimatedLines * fontPx * lineHeight;
      if (estimatedHeight <= boxHeightPx || fontPx <= minPx) break;
      fontPx = Math.max(minPx, fontPx * Math.sqrt(boxHeightPx / estimatedHeight));
    }
  }

  return fontPx;
}

interface PdfmeTemplatePreviewProps {
  template: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  fallbackWidth: number;
  fallbackHeight: number;
  variant?: 'stage' | 'card';
  respectExplicitColors?: boolean;
}

export function PdfmeTemplatePreview({
  template,
  mockData,
  activeFace,
  fallbackWidth,
  fallbackHeight,
  variant = 'stage',
  respectExplicitColors = true,
}: PdfmeTemplatePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const faceIndex = activeFace === 'front' ? 0 : 1;
  const schemas = useMemo(
    () => (
      activeFace === 'back' && template.schemas.length === 1
        ? template.schemas[0]
        : template.schemas[faceIndex] ?? []
    ) as PreviewSchema[],
    [activeFace, faceIndex, template.schemas],
  );
  const size = getPdfmeTemplateSize(template, fallbackWidth, fallbackHeight);
  const gutter = variant === 'stage' ? 64 : 0;
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void resolveReadableSchemaColorOverrides(schemas, mockData, { respectExplicitColors }).then(overrides => {
      if (cancelled) return;
      setColorOverrides(overrides);
    });

    return () => {
      cancelled = true;
    };
  }, [mockData, respectExplicitColors, schemas]);

  const availableWidth = Math.max(0, viewport.width - gutter);
  const availableHeight = Math.max(0, viewport.height - gutter);
  const fallbackStageWidth = variant === 'stage' ? 520 : size.width;
  const fallbackStageHeight = variant === 'stage' ? 760 : size.height;
  const fitScale = availableWidth > 0 && availableHeight > 0
    ? Math.min(availableWidth / size.width, availableHeight / size.height)
    : Math.min(fallbackStageWidth / size.width, fallbackStageHeight / size.height);
  const scale = Math.max(1, Math.min(5, fitScale));

  return (
    <div
      ref={previewRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: variant === 'stage' ? 'linear-gradient(135deg, #3e3e3e, #585858)' : 'transparent',
        overflow: 'hidden',
        padding: variant === 'stage' ? 'clamp(1rem, 3vw, 2rem)' : 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size.width * scale,
          height: size.height * scale,
          background: '#fff',
          boxShadow: variant === 'stage' ? '0 18px 60px rgba(0,0,0,0.45)' : undefined,
          outline: variant === 'stage' ? '1px solid rgba(255,255,255,0.5)' : undefined,
        }}
      >
        {schemas.map(schema => {
          const content = getSchemaContent(schema, mockData);
          const commonStyle = {
            position: 'absolute' as const,
            left: schema.position.x * scale,
            top: schema.position.y * scale,
            width: schema.width * scale,
            height: schema.height * scale,
            opacity: schema.opacity ?? 1,
            transform: schema.rotate ? `rotate(${schema.rotate}deg)` : undefined,
            transformOrigin: 'center center',
            overflow: 'hidden',
          };

          if (schema.type === 'image' && content) {
            return (
              <img
                key={schema.name}
                src={content}
                alt=""
                draggable={false}
                style={{ ...commonStyle, objectFit: 'cover', display: 'block' }}
              />
            );
          }

          if (schema.type === 'svg' && content) {
            return (
              <div
                key={schema.name}
                style={commonStyle}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            );
          }

          if (schema.type === 'qrcode' && content) {
            return (
              <div key={schema.name} style={commonStyle}>
                <QRCodeSVG
                  value={content}
                  size={256}
                  bgColor="transparent"
                  fgColor={colorOverrides[schema.name] ?? schema.barColor ?? schema.fontColor ?? '#111111'}
                  level="M"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            );
          }

          if (schema.type === 'rectangle' || schema.type === 'line') {
            return (
              <div
                key={schema.name}
                style={{
                  ...commonStyle,
                  background: schema.backgroundColor || schema.color || 'transparent',
                  border: schema.borderWidth ? `${schema.borderWidth * scale}px solid ${schema.borderColor || '#111'}` : undefined,
                }}
              />
            );
          }

          if (schema.type !== 'text') return null;

          const fontPx = getTextFontSizePx(schema, content, scale);
          const lineHeight = schema.lineHeight ?? 1.15;

          return (
            <div
              key={schema.name}
              style={{
                ...commonStyle,
                color: colorOverrides[schema.name] ?? schema.fontColor ?? schema.color ?? '#111',
                background: schema.backgroundColor || 'transparent',
                fontSize: fontPx,
                fontFamily: schema.fontName ? `"${schema.fontName}", Inter, system-ui, sans-serif` : 'Inter, system-ui, sans-serif',
                fontWeight: schema.fontWeight ?? 500,
                lineHeight,
                letterSpacing: schema.letterSpacing ? `${schema.letterSpacing * PT_TO_MM * scale}px` : undefined,
                display: 'flex',
                alignItems: schema.verticalAlignment === 'bottom' ? 'flex-end' : schema.verticalAlignment === 'middle' ? 'center' : 'flex-start',
                justifyContent: schema.alignment === 'center' ? 'center' : schema.alignment === 'right' ? 'flex-end' : 'flex-start',
                textAlign: schema.alignment || 'left',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
