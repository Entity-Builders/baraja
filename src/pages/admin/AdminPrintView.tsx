import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDeck } from '../../hooks/useDeck';
import { generatePrintPdf } from '../../lib/PrintEngine';
import { getTemplateForDeck } from '../../lib/pdfmeConfig';

// ── Standard card size presets (mirrors DeckDesignerRunner) ───────────────────
const CARD_SIZE_PRESETS = [
  { label: '⭐ 6×9', w: 60,   h: 90,   cost: '🆓' },
  { label: 'Poker',  w: 63,   h: 88,   cost: '💲' },
  { label: 'Bridge', w: 57,   h: 89,   cost: '💲' },
  { label: 'TCG',    w: 63.5, h: 88.9, cost: '💲' },
  { label: 'Tarot',  w: 70,   h: 120,  cost: '💲💲' },
  { label: 'Mini',   w: 44,   h: 67,   cost: '💲💲' },
  { label: 'Square', w: 70,   h: 70,   cost: '💲💲💲' },
  { label: 'Jumbo',  w: 89,   h: 127,  cost: '💲💲💲' },
];

const SHEET_SIZES = {
  A3: { label: 'A3', w: 420, h: 297, desc: '420 × 297 mm' },
  A4: { label: 'A4', w: 297, h: 210, desc: '297 × 210 mm' },
  SRA3: { label: 'SRA3', w: 450, h: 320, desc: '450 × 320 mm' },
} as const;

type SheetSizeKey = keyof typeof SHEET_SIZES;

function calcGrid(cardW: number, cardH: number, bleed: number, sheetW: number, sheetH: number) {
  const totalW = cardW + bleed * 2;
  const totalH = cardH + bleed * 2;
  const cols = Math.floor(sheetW / totalW);
  const rows = Math.floor(sheetH / totalH);
  const cardsPerSheet = cols * rows;
  const wastePercent = Math.round((1 - (cols * totalW * rows * totalH) / (sheetW * sheetH)) * 100);
  return { cols, rows, cardsPerSheet, totalW, totalH, wastePercent };
}

export default function AdminPrintView() {
  const { deckId } = useParams();
  const { deck, loading, error } = useDeck(deckId);
  
  const [sheetSize, setSheetSize] = useState<SheetSizeKey>('A3');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (!deck) return;

    let isActive = true;

    async function build() {
      if (!deck) return;
      setIsGenerating(true);
      setPdfUrl(null);
      setGenError(null);
      try {
        // SRA3 gets sent as A3 to the engine (same grid, just more margin)
        const engineSize = sheetSize === 'SRA3' ? 'A3' : sheetSize;
        const uint8Array = await generatePrintPdf(deck, { sheetSize: engineSize as 'A3' | 'A4' });
        if (!isActive) return;
        
        const blob = new Blob([new Uint8Array(uint8Array)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (err: unknown) {
        console.error('Failed to generate PDF', err);
        const errorMessage = err instanceof Error ? err.stack || err.message : String(err);
        if (isActive) setGenError(errorMessage);
      } finally {
        if (isActive) setIsGenerating(false);
      }
    }

    build();

    return () => {
      isActive = false;
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, sheetSize]);

  if (loading) {
    return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Cargando deck...</div>;
  }

  if (error || !deck) {
    return <div style={{ color: 'white', padding: '2rem' }}>Deck not found. {error}</div>;
  }

  if (genError) {
    return <div style={{ color: 'red', padding: '2rem', whiteSpace: 'pre-wrap' }}>{genError}</div>;
  }

  // ── Card dimensions ─────────────────────────────────────────────────────────
  // Use getTemplateForDeck() — the EXACT same function PrintEngine uses (line 119).
  // This guarantees the info panel matches the generated PDF grid.
  const cardTemplate = getTemplateForDeck(deck);
  const widthMm = (typeof cardTemplate.basePdf === 'object' && 'width' in cardTemplate.basePdf)
    ? cardTemplate.basePdf.width
    : (deck.print_specs?.dimensions?.width || 70);
  const heightMm = (typeof cardTemplate.basePdf === 'object' && 'height' in cardTemplate.basePdf)
    ? cardTemplate.basePdf.height
    : (deck.print_specs?.dimensions?.height || 120);
  const bleedMm = deck.print_specs?.bleed || 3;
  const totalCardW = widthMm + bleedMm * 2;
  const totalCardH = heightMm + bleedMm * 2;
  const isHorizontal = widthMm > heightMm;
  const totalCards = deck.cards.length;

  // Match preset name
  const matchedPreset = CARD_SIZE_PRESETS.find(p => p.w === widthMm && p.h === heightMm);
  const sizeLabel = matchedPreset ? `${matchedPreset.label} (${matchedPreset.cost})` : 'Personalizado';

  // ── Grid calculations for ALL sheet sizes ─────────────────────────────────
  const activeSheet = SHEET_SIZES[sheetSize];
  const activeGrid = calcGrid(widthMm, heightMm, bleedMm, activeSheet.w, activeSheet.h);
  const totalSheets = Math.ceil(totalCards / activeGrid.cardsPerSheet);
  const totalPages = totalSheets * 2; // front + back
  const lastSheetCards = totalCards % activeGrid.cardsPerSheet || activeGrid.cardsPerSheet;

  // Debug: log exactly what dimensions are being used
  console.log('[AdminPrintView] Card dimensions:', { widthMm, heightMm, bleedMm, totalCardW, totalCardH });
  console.log('[AdminPrintView] Grid:', { cols: activeGrid.cols, rows: activeGrid.rows, cardsPerSheet: activeGrid.cardsPerSheet });
  console.log('[AdminPrintView] Sheet:', { totalCards, totalSheets, lastSheetCards, totalPages });
  console.log('[AdminPrintView] basePdf source:', cardTemplate.basePdf);

  // Compare all sheet sizes
  const sheetComparison = (Object.keys(SHEET_SIZES) as SheetSizeKey[]).map(key => {
    const s = SHEET_SIZES[key];
    const grid = calcGrid(widthMm, heightMm, bleedMm, s.w, s.h);
    const sheets = Math.ceil(totalCards / grid.cardsPerSheet);
    return { key, ...s, ...grid, sheets };
  });

  // ── Styles ─────────────────────────────────────────────────────────────────
  const statBoxStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.8rem 1rem',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
    minWidth: '80px',
  };
  const statValueStyle: React.CSSProperties = { fontSize: '1.4rem', fontWeight: 700, color: '#d4af64' };
  const statLabelStyle: React.CSSProperties = { fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0a0a10' }}>
      
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{ padding: '1rem 2rem', background: '#111', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        
        {/* Back + Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Link to={`/admin/${deckId}`} style={{ color: '#d4af64', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Back to Editor</Link>
            <h2 style={{ margin: '0.4rem 0 0', color: 'white', fontFamily: 'var(--font-serif)', fontSize: '1.3rem' }}>
              🖨️ Imposición PDF: {deck.name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            {pdfUrl && (
              <a 
                href={pdfUrl}
                download={`Impresion_${deck.name}_${sheetSize}.pdf`}
                style={{ 
                  padding: '0.6rem 1.2rem', fontSize: '0.85rem', textDecoration: 'none',
                  background: '#d4af64', color: '#000', borderRadius: '6px', fontWeight: 600,
                }}
              >
                📥 Descargar PDF
              </a>
            )}
            {isGenerating && (
              <span style={{ color: '#d4af64', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Generando...
              </span>
            )}
          </div>
        </div>

        {/* ── Stats Row ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          
          {/* Card Format */}
          <div style={statBoxStyle}>
            <span style={{ ...statValueStyle, fontSize: '1rem' }}>{sizeLabel}</span>
            <span style={statLabelStyle}>Formato</span>
          </div>

          {/* Card Dimensions */}
          <div style={statBoxStyle}>
            <span style={statValueStyle}>{widthMm}×{heightMm}</span>
            <span style={statLabelStyle}>mm {isHorizontal ? '↔ horizontal' : '↕ vertical'}</span>
          </div>

          {/* Total with bleed */}
          <div style={statBoxStyle}>
            <span style={{ ...statValueStyle, color: '#e88' }}>{totalCardW}×{totalCardH}</span>
            <span style={statLabelStyle}>Con sangría ({bleedMm}mm)</span>
          </div>

          {/* Divider */}
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' }} />

          {/* Cards per sheet */}
          <div style={statBoxStyle}>
            <span style={statValueStyle}>{activeGrid.cardsPerSheet}</span>
            <span style={statLabelStyle}>Max / pliego</span>
          </div>

          {/* Last sheet */}
          {totalSheets > 1 && (
            <div style={statBoxStyle}>
              <span style={{ ...statValueStyle, color: '#f0ad4e', fontSize: '1.1rem' }}>{lastSheetCards}</span>
              <span style={statLabelStyle}>Último pliego</span>
            </div>
          )}

          {/* Grid */}
          <div style={statBoxStyle}>
            <span style={{ ...statValueStyle, fontSize: '1.1rem' }}>{activeGrid.cols} × {activeGrid.rows}</span>
            <span style={statLabelStyle}>Cols × filas</span>
          </div>

          {/* Total cards */}
          <div style={statBoxStyle}>
            <span style={statValueStyle}>{totalCards}</span>
            <span style={statLabelStyle}>Cartas totales</span>
          </div>

          {/* Total sheets */}
          <div style={statBoxStyle}>
            <span style={statValueStyle}>{totalSheets}</span>
            <span style={statLabelStyle}>Pliegos {sheetSize}</span>
          </div>

          {/* Total pages */}
          <div style={statBoxStyle}>
            <span style={{ ...statValueStyle, color: '#8be' }}>{totalPages}</span>
            <span style={statLabelStyle}>Páginas PDF</span>
          </div>
        </div>

        {/* ── Sheet Size Comparison Table ──────────────────────────── */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', alignItems: 'flex-start' }}>
          
          {/* Comparison cards */}
          <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
            {sheetComparison.map(s => {
              const isActive = s.key === sheetSize;
              return (
                <button
                  key={s.key}
                  onClick={() => setSheetSize(s.key)}
                  style={{
                    flex: 1, cursor: 'pointer', textAlign: 'left',
                    background: isActive ? 'rgba(212,175,100,0.1)' : 'rgba(255,255,255,0.02)',
                    border: isActive ? '1px solid rgba(212,175,100,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px', padding: '0.8rem 1rem', color: 'white',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: isActive ? '#d4af64' : 'white' }}>{s.label}</span>
                    {isActive && <span style={{ fontSize: '0.6rem', background: '#d4af64', color: '#000', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>ACTIVO</span>}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem' }}>{s.desc}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span>
                      <strong style={{ color: isActive ? '#d4af64' : '#8be' }}>{s.cardsPerSheet}</strong>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}> cartas</span>
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>{s.cols}×{s.rows}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.3rem' }}>
                    {s.sheets} pliego{s.sheets !== 1 ? 's' : ''} • {s.wastePercent}% desperdicio
                  </div>
                </button>
              );
            })}
          </div>

          {/* Print Instructions */}
          <div style={{ 
            width: '300px', padding: '0.8rem 1rem', background: 'rgba(212,175,100,0.06)', 
            borderRadius: '8px', borderLeft: '3px solid #d4af64', fontSize: '0.75rem', lineHeight: '1.6',
          }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#d4af64', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📌 Instructivo Imprenta
            </h4>
            <div style={{ color: 'rgba(255,255,255,0.7)' }}>
              <div>• <strong>Carta:</strong> {widthMm}×{heightMm}mm ({isHorizontal ? 'landscape' : 'portrait'})</div>
              <div>• <strong>Sangría:</strong> {bleedMm}mm → Total: {totalCardW}×{totalCardH}mm</div>
              <div>• <strong>Marcas de corte:</strong> Incluidas</div>
              <div>• <strong>Imposición:</strong> Doble faz 1:1</div>
              <div>• <strong>Volteo:</strong> Horizontal al imprimir</div>
              <div style={{ marginTop: '0.4rem', padding: '0.3rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                Papel recomendado: Cartulina 300g+ mates o plastificado
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PDF PREVIEW ────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {pdfUrl ? (
          <iframe 
            src={pdfUrl} 
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#1a1a1a' }}
            title="PDF Preview"
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
            {isGenerating ? 'Generando PDF...' : 'Preparando entorno...'}
          </div>
        )}
      </div>
    </div>
  );
}
