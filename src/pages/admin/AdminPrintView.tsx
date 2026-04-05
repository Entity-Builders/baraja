import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DECKS } from '@eb-packages/deck-engine';
import type { Card } from '@eb-packages/deck-engine';

export default function AdminPrintView() {
  const { deckId } = useParams();
  const deck = deckId ? DECKS[deckId as keyof typeof DECKS] : null;

  useEffect(() => {
    // Add print styles dynamically when this component mounts
    const style = document.createElement('style');
    // We assume deck.print_specs dimensions. E.g. 88x138mm + 3mm bleed = 94x144mm
    // To be precise, we calculate:
    const width = deck?.print_specs.dimensions.width || 88;
    const height = deck?.print_specs.dimensions.height || 138;
    const bleed = deck?.print_specs.bleed || 3;
    const totalWidth = width + bleed * 2;
    const totalHeight = height + bleed * 2;

    style.innerHTML = `
      @media print {
        @page {
          size: ${totalWidth}mm ${totalHeight}mm;
          margin: 0;
        }
        body, html {
          margin: 0 !important;
          padding: 0 !important;
          background: #000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #root {
          margin: 0 !important;
          padding: 0 !important;
        }
        .no-print {
          display: none !important;
        }
        .print-page {
          width: ${totalWidth}mm;
          height: ${totalHeight}mm;
          page-break-after: always;
          position: relative;
          overflow: hidden;
          background: var(--card-bg); /* Fallback */
          box-sizing: border-box;
        }
      }
      
      /* Screen preview styles */
      .print-preview-grid {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        align-items: center;
        padding-bottom: 4rem;
        background: #111;
      }
      .print-page-screen {
        width: ${(totalWidth) * 3}px;
        height: ${(totalHeight) * 3}px;
        background: var(--card-bg);
        position: relative;
        overflow: hidden;
        border: 1px dashed rgba(255,255,255,0.3);
      }
      .cut-guide {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0; left: 0;
        border: ${bleed * 3}px solid rgba(255,0,0,0.1);
        pointer-events: none;
        box-sizing: border-box;
        z-index: 100;
      }

      /* Crop Marks */
      .crop-mark-h {
        position: absolute;
        width: ${bleed}mm;
        height: 0;
        border-top: 0.25pt solid #000;
        z-index: 1000;
      }
      .crop-mark-v {
        position: absolute;
        width: 0;
        height: ${bleed}mm;
        border-left: 0.25pt solid #000;
        z-index: 1000;
      }

      .crop-tl-h { top: ${bleed}mm; left: 0; }
      .crop-tl-v { top: 0; left: ${bleed}mm; }

      .crop-tr-h { top: ${bleed}mm; right: 0; }
      .crop-tr-v { top: 0; right: ${bleed}mm; }

      .crop-bl-h { bottom: ${bleed}mm; left: 0; }
      .crop-bl-v { bottom: 0; left: ${bleed}mm; }

      .crop-br-h { bottom: ${bleed}mm; right: 0; }
      .crop-br-v { bottom: 0; right: ${bleed}mm; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [deck]);

  if (!deck) return <div style={{ color: 'white', padding: '2rem' }}>Deck not found.</div>;

  const cardStyle = {
    '--card-bg': deck.design.background || deck.design.primary_color || '#0c0b09',
    '--card-surface': deck.design.surface_color || '#141210',
    '--card-accent': deck.design.accent_color || '#d4af64',
    '--card-text': deck.design.text_color || '#f0ebe0',
    '--card-font-head': `'${deck.design.font_heading || 'Cormorant Garamond'}', serif`,
    '--card-font-body': `'${deck.design.font_body || 'Inter'}', sans-serif`,
  } as React.CSSProperties;

  const bleedSpacing = deck.print_specs.bleed || 3;
  // Make sure back safe padding accounts for bleed + extra inner safe margin (5mm)
  const safePadding = `${bleedSpacing + 5}mm`;

  const CropMarks = () => (
    <>
      <div className="crop-mark-h crop-tl-h"></div>
      <div className="crop-mark-v crop-tl-v"></div>
      <div className="crop-mark-h crop-tr-h"></div>
      <div className="crop-mark-v crop-tr-v"></div>
      <div className="crop-mark-h crop-bl-h"></div>
      <div className="crop-mark-v crop-bl-v"></div>
      <div className="crop-mark-h crop-br-h"></div>
      <div className="crop-mark-v crop-br-v"></div>
    </>
  );

  const PageContent = ({ card, face }: { card: Card, face: 'front' | 'back' }) => {
    if (face === 'front') {
      return (
        <div className="admin-print-face admin-print-front" style={{ position: 'absolute', inset: 0, borderRadius: 0, boxShadow: 'none' }}>
          {card.front.art_url ? (
            <img src={card.front.art_url} className="admin-print-art" alt="" />
          ) : (
            <div className='admin-print-no-art' style={{ background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '16px', color: 'var(--card-accent)', letterSpacing: '0.1em', marginBottom: '1rem', fontFamily: 'var(--card-font-body)' }}>
                #{String(card.front.number).padStart(2, '0')}
              </div>
              <h1 style={{ fontSize: '30px', fontFamily: 'var(--card-font-head)', margin: 0, color: 'var(--card-text)' }}>
                {card.front.title}
              </h1>
            </div>
          )}
        </div>
      );
    } else {
      const isTrivia = !!card.back.answer;
      return (
        <div className={`admin-print-face admin-print-back ${isTrivia ? 'admin-print-back--trivia' : ''}`} style={{ position: 'absolute', inset: 0, borderRadius: 0, boxShadow: 'none', transform: 'none', padding: safePadding }}>
          <div className={isTrivia ? 'admin-print-back--trivia-inner' : ''} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className='admin-print-when'>
              {card.back.when_to_use}
            </div>
            <div className='admin-print-phrase'>
              "{card.back.phrase}"
            </div>
            <div className='admin-print-instruction'>
              {card.back.instruction}
            </div>
            {card.back.answer && (
              <div className='admin-print-answer'>
                Rta: {card.back.answer}
              </div>
            )}
            {card.back.fun_fact && (
              <div className='admin-print-fun-fact' style={{ fontSize: '0.65rem', marginTop: '0.5rem', fontStyle: 'italic', opacity: 0.8 }}>
                💡 {card.back.fun_fact}
              </div>
            )}
            <div className='admin-print-qr-placeholder' style={{ marginTop: 'auto', alignSelf: 'center', width: '25px', height: '25px', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.4rem' }}>QR</span>
            </div>
            <div className='admin-print-brand'>
              Baraja · {deck.name}
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div>
      <div className="no-print" style={{ padding: '2rem', background: '#1a1a1a', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to={`/admin/${deckId}`} style={{ color: 'var(--color-gold)', textDecoration: 'none' }}>&larr; Back to Editor</Link>
          <h2 style={{ margin: '0.5rem 0 0' }}>PDF Print Generator: {deck.name}</h2>
        </div>
        <button className="btn-primary" onClick={() => window.print()}>
          Guardar PDF (Imprimir)
        </button>
      </div>

      <div className="print-preview-grid" style={{ paddingTop: '2rem' }}>
        <p className="no-print" style={{ color: 'white', opacity: 0.5, marginBottom: '2rem' }}>
          La zona roja es "Demasía" (Bleed). No coloques texto dentro de la demasía. Se cortará en la imprenta.
        </p>

        {deck.cards.map((card) => (
          <React.Fragment key={card.id}>
            {/* Front Page */}
            <div className="print-page print-page-screen" style={cardStyle}>
               <div className="cut-guide no-print"></div>
               <CropMarks />
               <PageContent card={card} face="front" />
            </div>
            
            {/* Back Page */}
            <div className="print-page print-page-screen" style={cardStyle}>
               <div className="cut-guide no-print"></div>
               <CropMarks />
               <PageContent card={card} face="back" />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
