import type { GeneratedFrame } from '../../frameGeneratorTypes';
import { getAdaptiveFontSizePx, isTypoZone } from '../../frameGeneratorTypes';

interface FrameCanvasProps {
  activePreview: GeneratedFrame | null;
  cardContent: Record<string, unknown>;
  loading: boolean;
  previewHeight: number;
  previewWidth: number;
  showCardContext: boolean;
  showSafeZone: boolean;
}

export function FrameCanvas({
  activePreview,
  cardContent,
  loading,
  previewHeight,
  previewWidth,
  showCardContext,
  showSafeZone,
}: FrameCanvasProps) {
  return (
    <div style={{
      position: 'relative',
      width: `${previewWidth}px`,
      height: `${previewHeight}px`,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      background: '#111',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          zIndex: 10,
          gap: '0.75rem',
        }}>
          <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⏳</div>
          <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>Generando frame...</p>
        </div>
      )}

      {activePreview ? (
        <img
          src={activePreview.dataUrl}
          alt="Generated frame"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.3,
          gap: '0.5rem',
        }}>
          <div style={{ fontSize: '3rem' }}>🖼️</div>
          <p style={{ margin: 0, fontSize: '0.8rem' }}>El frame generado aparecerá aquí</p>
        </div>
      )}

      {showSafeZone && <SafeZoneOverlay />}
      {activePreview?.typography && showCardContext && (
        <TypographyOverlay
          activePreview={activePreview}
          cardContent={cardContent}
          previewHeight={previewHeight}
        />
      )}
    </div>
  );
}

function SafeZoneOverlay() {
  return (
    <>
      <div style={{
        position: 'absolute',
        inset: '3%',
        border: '1px dashed rgba(255,80,80,0.5)',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 10,
      }} />
      <div style={{
        position: 'absolute',
        inset: '10%',
        border: '1px dashed rgba(80,200,255,0.5)',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 10,
      }} />
      <div style={{ position: 'absolute', zIndex: 10, top: '3%', left: '3.5%', fontSize: '0.5rem', color: 'rgba(255,80,80,0.7)' }}>
        BLEED
      </div>
      <div style={{ position: 'absolute', zIndex: 10, top: '10%', left: '10.5%', fontSize: '0.5rem', color: 'rgba(80,200,255,0.7)' }}>
        SAFE AREA
      </div>
    </>
  );
}

interface TypographyOverlayProps {
  activePreview: GeneratedFrame;
  cardContent: Record<string, unknown>;
  previewHeight: number;
}

function TypographyOverlay({ activePreview, cardContent, previewHeight }: TypographyOverlayProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {activePreview.typography?.ttfUrls && Object.entries(activePreview.typography.ttfUrls).map(([family, url]) => (
        <style key={family}>{`
          @font-face {
            font-family: '${family}';
            src: url('${url}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
        `}</style>
      ))}

      {Object.keys(cardContent).map(key => {
        if (['back_image_url', 'back_image_versions', 'qr_url'].includes(key)) return null;
        const text = cardContent[key];
        if (!text || typeof text !== 'string') return null;
        const zone = activePreview.typography?.[key];
        if (!isTypoZone(zone) || !zone.leftPct) return null;

        return (
          <div key={key} style={{
            position: 'absolute',
            left: `${zone.leftPct}%`,
            width: `${zone.widthPct}%`,
            top: `${zone.topPct}%`,
            height: `${zone.heightPct}%`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: `"${zone.fontFamily}", sans-serif`,
            fontSize: `${getAdaptiveFontSizePx(text, zone.fontSize || 12, Math.max(zone.fontSize || 12, 12), activePreview.heightMm, previewHeight)}px`,
            color: zone.color,
            letterSpacing: zone.letterSpacing ? `${zone.letterSpacing}px` : 'normal',
            lineHeight: zone.lineHeight || 1.15,
            textAlign: 'center',
            fontWeight: zone.fontWeight || 'normal',
          }}>
            {zone.containerSvg && (
              <div
                dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">${zone.containerSvg}</svg>` }}
                style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', height: '100%' }}
              />
            )}
            <span style={{ display: 'block', width: '100%', zIndex: 1, position: 'relative' }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}
