import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { Document, Page, View, PDFViewer, PDFDownloadLink, StyleSheet } from '@react-pdf/renderer';
import { PdfCardFace } from '../../components/cards/PdfCard';
import { useDeck } from '../../hooks/useDeck';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
  },
  cardWrapper: {
    position: 'relative',
    boxSizing: 'border-box',
  },
  cropMarkView: {
    position: 'absolute',
  }
});

const getCropMarkStyles = (bleedStr: string) => StyleSheet.create({
  tlH: { top: bleedStr, left: 0, width: bleedStr, height: 0, borderTopWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  tlV: { top: 0, left: bleedStr, width: 0, height: bleedStr, borderLeftWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  trH: { top: bleedStr, right: 0, width: bleedStr, height: 0, borderTopWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  trV: { top: 0, right: bleedStr, width: 0, height: bleedStr, borderRightWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  blH: { bottom: bleedStr, left: 0, width: bleedStr, height: 0, borderBottomWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  blV: { bottom: 0, left: bleedStr, width: 0, height: bleedStr, borderLeftWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  brH: { bottom: bleedStr, right: 0, width: bleedStr, height: 0, borderBottomWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
  brV: { bottom: 0, right: bleedStr, width: 0, height: bleedStr, borderRightWidth: 0.5, borderStyle: 'solid', borderColor: 'black' },
});

const PdfCropMarks = ({ bleedMm }: { bleedMm: number }) => {
  const bleed = `${bleedMm}mm`;
  const cm = getCropMarkStyles(bleed);
  return (
    <>
      <View style={[styles.cropMarkView, cm.tlH]} />
      <View style={[styles.cropMarkView, cm.tlV]} />
      <View style={[styles.cropMarkView, cm.trH]} />
      <View style={[styles.cropMarkView, cm.trV]} />
      <View style={[styles.cropMarkView, cm.blH]} />
      <View style={[styles.cropMarkView, cm.blV]} />
      <View style={[styles.cropMarkView, cm.brH]} />
      <View style={[styles.cropMarkView, cm.brV]} />
    </>
  );
};

const CardsPdfDocument = ({ deck, sheetSize }: { deck: DeckSchema, sheetSize: 'A3' | 'A4' }) => {
  const widthMm = deck.print_specs.dimensions.width || 88;
  const heightMm = deck.print_specs.dimensions.height || 138;
  const bleedMm = deck.print_specs.bleed || 3;
  const totalWidthMm = widthMm + bleedMm * 2;
  const totalHeightMm = heightMm + bleedMm * 2;

  const sheetWidthMm = sheetSize === 'A3' ? 420 : 297;
  const sheetHeightMm = sheetSize === 'A3' ? 297 : 210;

  const cols = Math.floor(sheetWidthMm / totalWidthMm);
  const rows = Math.floor(sheetHeightMm / totalHeightMm);
  const cardsPerSheet = cols * rows;

  const sheets: Card[][] = [];
  for (let i = 0; i < deck.cards.length; i += cardsPerSheet) {
    sheets.push(deck.cards.slice(i, i + cardsPerSheet));
  }
  
  return (
    <Document title={`Impresion_${deck.name}_${sheetSize}`} author="Baraja by Entity Builders">
      {sheets.map((sheetCards, sheetIndex) => {
        const frontRows: (Card | null)[][] = [];
        const backRows: (Card | null)[][] = [];
        
        for (let r = 0; r < rows; r++) {
          const rowStart = r * cols;
          const rowCards = sheetCards.slice(rowStart, rowStart + cols);
          
          if (rowCards.length === 0) continue;
          
          const paddedRow: (Card | null)[] = [...rowCards];
          while (paddedRow.length < cols) {
            paddedRow.push(null);
          }
          
          frontRows.push([...paddedRow]);
          backRows.push([...paddedRow].reverse());
        }

        return (
          <React.Fragment key={sheetIndex}>
            {/* Front Page */}
            <Page size={sheetSize} orientation="landscape" style={styles.page}>
              <View style={[styles.grid, { width: `${cols * totalWidthMm}mm`, height: `${rows * totalHeightMm}mm` }]}>
                {frontRows.map((row, rI) => (
                  <View key={`front-row-${rI}`} style={styles.row}>
                    {row.map((card, cI) => (
                      <View key={`front-card-${rI}-${cI}`} style={[styles.cardWrapper, { width: `${totalWidthMm}mm`, height: `${totalHeightMm}mm` }]}>
                        {card ? (
                          <>
                             <PdfCropMarks bleedMm={bleedMm} />
                             <PdfCardFace card={card} deck={deck} face="front" />
                          </>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </Page>

            {/* Back Page */}
            <Page size={sheetSize} orientation="landscape" style={styles.page}>
              <View style={[styles.grid, { width: `${cols * totalWidthMm}mm`, height: `${rows * totalHeightMm}mm` }]}>
                {backRows.map((row, rI) => (
                  <View key={`back-row-${rI}`} style={styles.row}>
                    {row.map((card, cI) => (
                      <View key={`back-card-${rI}-${cI}`} style={[styles.cardWrapper, { width: `${totalWidthMm}mm`, height: `${totalHeightMm}mm` }]}>
                        {card ? (
                          <>
                             <PdfCropMarks bleedMm={bleedMm} />
                             <PdfCardFace card={card} deck={deck} face="back" />
                          </>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </Page>
          </React.Fragment>
        );
      })}
    </Document>
  );
};

export default function AdminPrintView() {
  const { deckId } = useParams();
  const { deck, loading, error } = useDeck(deckId);
  const [sheetSize, setSheetSize] = useState<'A3' | 'A4'>('A3');

  if (loading) {
    return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Cargando deck...</div>;
  }

  if (error || !deck) {
    return <div style={{ color: 'white', padding: '2rem' }}>Deck not found. {error}</div>;
  }

  const widthMm = deck.print_specs.dimensions.width || 88;
  const heightMm = deck.print_specs.dimensions.height || 138;
  const bleedMm = deck.print_specs.bleed || 3;
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
              <li><strong>Sangría (bleed):</strong> {bleedMm} mm por lado → Medida total con sangría: {totalWidthMm} × {totalHeightMm} mm</li>
              <li><strong>Papel:</strong> Papel Ilustración de 300g (o 310g/330g calidad casino "black core" si es posible).</li>
              <li><strong>Acabado:</strong> Laminado o plastificado (brillante/mate) de ambos lados.</li>
              <li><strong>Corte:</strong> Puntas redondeadas (radio de corte estándar entre 3mm y 5mm).</li>
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

          <PDFDownloadLink 
            document={<CardsPdfDocument deck={deck} sheetSize={sheetSize} />} 
            fileName={`Impresion_${deck.name}_${sheetSize}.pdf`}
            style={{ textDecoration: 'none' }}
          >
            {({ loading }) => (
              <button 
                className="btn-primary" 
                disabled={loading}
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  fontSize: '14px', 
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1 
                }}
              >
                {loading ? 'Generando Alta Calidad...' : 'Descargar Archivo PDF'}
              </button>
            )}
          </PDFDownloadLink>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <PDFViewer style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#333' }}>
          <CardsPdfDocument deck={deck} sheetSize={sheetSize} />
        </PDFViewer>
      </div>
    </div>
  );
}
