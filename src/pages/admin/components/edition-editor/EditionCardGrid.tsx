import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { CardCanvas } from '../../../../components/cards/CardCanvas';
import type { CardViewMode } from './editionEditorTypes';

interface EditionCardGridProps {
  cards: Card[];
  deck: DeckSchema;
  generatingArt: Record<string, boolean>;
  generatingBack: Record<string, boolean>;
  viewMode: Exclude<CardViewMode, 'gallery'>;
  onEditCard: (card: Card) => void;
  onGenerateArt: (cardId: string) => void;
  onGenerateCardBack: (cardId: string) => void;
}

export function EditionCardGrid({
  cards,
  deck,
  generatingArt,
  generatingBack,
  viewMode,
  onEditCard,
  onGenerateArt,
  onGenerateCardBack,
}: EditionCardGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'original' ? 'repeat(auto-fill, minmax(280px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2rem' }}>
      {cards.map(card => (
        <div key={card.id} style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', zIndex: 50, top: 10, right: 10, display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onEditCard(card)}
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
            >
              Edit
            </button>
            <button
              onClick={() => onGenerateArt(card.id)}
              disabled={!!generatingArt[card.id]}
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid #4ade80', padding: '0.2rem 0.5rem', color: '#4ade80', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', opacity: generatingArt[card.id] ? 0.5 : 1 }}
            >
              {generatingArt[card.id] ? '...' : 'Art'}
            </button>
            <button
              onClick={() => onGenerateCardBack(card.id)}
              disabled={!!generatingBack[card.id]}
              style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${card.back.back_image_url ? '#a78bfa' : 'rgba(167,139,250,0.4)'}`, padding: '0.2rem 0.5rem', color: '#a78bfa', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', opacity: generatingBack[card.id] ? 0.5 : 1 }}
              title={card.back.back_image_url ? 'Regenerate AI card back' : 'Generate AI card back'}
            >
              {generatingBack[card.id] ? '...' : card.back.back_image_url ? '🎴✓' : '🎴'}
            </button>
          </div>
          <CardCanvas
            card={card}
            deck={deck}
            forceOriginalMode={viewMode === 'original'}
          />
        </div>
      ))}
    </div>
  );
}
