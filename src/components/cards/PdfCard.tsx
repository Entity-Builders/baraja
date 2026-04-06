import React from 'react';
import { Font, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';

// Register fonts needed for the card
let fontsRegistered = false;
export const registerPdfFonts = () => {
  if (fontsRegistered) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuIWeMZhrib2Bg-4.ttf', fontWeight: 500 },
      { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf', fontWeight: 600 },
      { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf', fontWeight: 700 },
    ]
  });
  
  Font.register({
    family: 'Cormorant Garamond',
    fonts: [
      { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYpntKqQ.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYhnpKqQ.ttf', fontWeight: 500 },
      { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYAnpKqQ.ttf', fontWeight: 600 },
      { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYWntKqQ.ttf', fontWeight: 700 },
      { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3amX5slCNuHLi8bLeY9MK7whWMhyjYDqVCq0-N.ttf', fontStyle: 'italic', fontWeight: 400 },
    ]
  });
  fontsRegistered = true;
};

// Ensure fonts are registered immediately
registerPdfFonts();

// Define PDF styles using StyleSheet.create
// React-PDF uses flexbox layout similarly to React Native.
const styles = StyleSheet.create({
  cardFace: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  frontCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0c0b09',
  },
  artImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    objectFit: 'cover',
  },
  artPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#141210',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
  },
  frontHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontFamily: 'Inter',
  },
  backCardInnerBorder: {
    position: 'absolute',
    top: '5%',
    left: '5%',
    right: '5%',
    bottom: '5%',
    borderWidth: 1,
    borderStyle: 'solid',
    opacity: 0.3,
    borderRadius: 2,
  },
  backContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    textAlign: 'center',
    height: '100%',
  },
  whenText: {
    fontFamily: 'Cormorant Garamond',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 10,
    marginBottom: 6,
  },
  phraseText: {
    fontFamily: 'Cormorant Garamond',
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.3,
    marginBottom: 6,
    flexGrow: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionText: {
    fontFamily: 'Inter',
    fontSize: 9,
    lineHeight: 1.4,
    opacity: 0.8,
    marginBottom: 8,
  },
  answerText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 700,
    transform: 'rotate(180deg)',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  funFactText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 6,
    opacity: 0.8,
  },
  brandText: {
    fontFamily: 'Cormorant Garamond',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.4,
    marginTop: 'auto',
  },
  qrPlaceholder: {
    marginTop: 'auto',
    marginBottom: 8,
    width: 30,
    height: 30,
    borderWidth: 1,
    borderStyle: 'solid',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.3,
  }
});

interface PdfCardFaceProps {
  card: Card;
  deck: DeckSchema;
  face: 'front' | 'back';
  previewUrl?: string | null;
  widthMm?: number;
  heightMm?: number;
  bleedMm?: number;
}

export function PdfCardFace({ card, deck, face, previewUrl, widthMm = 88, heightMm = 138, bleedMm = 3 }: PdfCardFaceProps) {
  const design = deck.design;
  const bgColor = design.background || design.primary_color || '#0c0b09';
  const surfaceColor = design.surface_color || '#141210';
  const accentColor = design.accent_color || '#d4af64';
  const textColor = design.text_color || '#f0ebe0';

  const totalWidth = widthMm + bleedMm * 2;
  const totalHeight = heightMm + bleedMm * 2;

  const displayArtUrl = previewUrl || card.front.art_url;

  return (
    <View style={[
      styles.cardFace,
      { width: `${totalWidth}mm`, height: `${totalHeight}mm`, backgroundColor: face === 'front' ? bgColor : surfaceColor }
    ]}>
      {face === 'front' ? (
        <View style={styles.frontCard}>
          {displayArtUrl ? (
            <Image src={displayArtUrl} style={styles.artImage} />
          ) : (
            <View style={styles.artPlaceholder}>
              <Text style={{ fontSize: 18, color: accentColor, marginBottom: 12, fontFamily: 'Inter' }}>
                #{String(card.front.number).padStart(2, '0')}
              </Text>
              <Text style={{ fontSize: 22, color: textColor, fontFamily: 'Cormorant Garamond', textAlign: 'center', paddingHorizontal: 15 }}>
                {card.front.title}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ ...styles.cardFace, backgroundColor: surfaceColor, position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, padding: `${bleedMm + 5}mm` }}>
          <View style={{ ...styles.backCardInnerBorder, borderColor: accentColor }} />
          <View style={styles.backContent}>
            <View>
              <Text style={{ ...styles.whenText, color: accentColor }}>{card.back.when_to_use}</Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ ...styles.phraseText, color: textColor }}>"{card.back.phrase}"</Text>
            </View>
            <Text style={{ ...styles.instructionText, color: textColor }}>{card.back.instruction}</Text>

            {card.back.answer && (
              <Text style={{ ...styles.answerText, color: accentColor }}>Rta: {card.back.answer}</Text>
            )}

            {card.back.fun_fact && (
              <Text style={{ ...styles.funFactText, color: textColor }}>💡 {card.back.fun_fact}</Text>
            )}

            <View style={{ ...styles.qrPlaceholder, borderColor: textColor }}>
              <Text style={{ fontSize: 7, color: textColor }}>QR</Text>
            </View>
            
            <Text style={{ ...styles.brandText, color: textColor }}>Baraja · {deck.name}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
