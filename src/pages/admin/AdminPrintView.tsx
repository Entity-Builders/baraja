import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDeck } from '../../hooks/useDeck';
import { generatePrintPdf } from '../../lib/PrintEngine';

export default function AdminPrintView() {
  const { deckId } = useParams();
  const { deck, loading, error } = useDeck(deckId);
  
  const [sheetSize, setSheetSize] = useState<'A3' | 'A4'>('A3');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (!deck) return;

    let isActive = true;

    async function build() {
      if (!deck) return;
      setIsGenerating(true);
      try {
        const uint8Array = await generatePrintPdf(deck, { sheetSize });
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
  }, [deck, sheetSize]); // Re-run if deck or sheetSize changes

  if (loading) {
    return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Cargando deck...</div>;
  }

  if (error || !deck) {
    return <div style={{ color: 'white', padding: '2rem' }}>Deck not found. {error}</div>;
  }

  if (genError) {
    return <div style={{ color: 'red', padding: '2rem', whiteSpace: 'pre-wrap' }}>{genError}</div>;
  }

  const widthMm = deck.print_specs?.dimensions?.width || 88;
  const heightMm = deck.print_specs?.dimensions?.height || 63;
  const bleedMm = deck.print_specs?.bleed || 3;
  const totalWidthMm = widthMm + bleedMm * 2;
  const totalHeightMm = heightMm + bleedMm * 2;

  const sheetWidthMm = sheetSize === 'A3' ? 420 : 297;
  const sheetHeightMm = sheetSize === 'A3' ? 297 : 210;

  const cols = Math.floor(sheetWidthMm / totalWidthMm);
  const rows = Math.floor(sheetHeightMm / totalHeightMm);
  const cardsPerSheet = cols * rows;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111' }}>
      <div style={{ padding: '1rem 2rem', background: '#1a1a1a', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to={`/admin/${deckId}`} style={{ color: 'var(--color-gold)', textDecoration: 'none' }}>&larr; Back to Editor</Link>
          <h2 style={{ margin: '0.5rem 0 0', color: 'white' }}>Imposición PDF: {deck.name}</h2>
          <div style={{ marginTop: '0.2rem', fontSize: '14px', opacity: 0.7, color: 'white' }}>
            {deck.cards.length} cartas totales • {cardsPerSheet} cartas por pliego ({cols}x{rows})
          </div>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#222', borderRadius: '8px', borderLeft: '4px solid #d4af64', maxWidth: '600px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#d4af64', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📌 Instructivo para Imprenta</h4>
            <ul style={{ margin: '0', paddingLeft: '1.2rem', fontSize: '13px', color: 'white', opacity: 0.9, lineHeight: '1.5' }}>
              <li><strong>Medida de cada carta:</strong> {widthMm} × {heightMm} mm {widthMm > heightMm ? '(horizontal / landscape)' : '(vertical / portrait)'}</li>
              <li><strong>Sangría (bleed):</strong> {bleedMm} mm por lado → Medida total: {totalWidthMm} × {totalHeightMm} mm</li>
              <li><strong>Marcas de corte:</strong> Incluidas en todas las esquinas de cada carta.</li>
              <li>El PDF tiene imposición doble faz 1:1, voltear horizontalmente al imprimir.</li>
            </ul>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            value={sheetSize} 
            onChange={e => setSheetSize(e.target.value as 'A3' | 'A4')}
            style={{ padding: '0.75rem', background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', fontSize: '14px' }}
          >
            <option value="A3">Hoja A3 (420x297mm)</option>
            <option value="A4">Hoja A4 (297x210mm)</option>
          </select>

          {pdfUrl && (
            <a 
              href={pdfUrl}
              download={`Impresion_${deck.name}_${sheetSize}.pdf`}
              className="btn-primary" 
              style={{ padding: '0.75rem 1.5rem', fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}
            >
              Descargar Archivo PDF
            </a>
          )}
          {isGenerating && (
            <span style={{ color: '#d4af64', fontSize: '13px' }}>Generando PDF Alta Calidad...</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {pdfUrl ? (
          <iframe 
            src={pdfUrl} 
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#333' }}
            title="PDF Preview"
          />
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            {isGenerating ? 'Generando PDF Viewer...' : 'Preparando entorno...'}
          </div>
        )}
      </div>
    </div>
  );
}
