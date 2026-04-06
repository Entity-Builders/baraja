import React, { useState } from 'react';
import type { Card } from '@eb-packages/deck-engine';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { CardCanvas } from './CardCanvas';

interface PublicShowcaseProps {
  deck: DeckSchema;
  maxCards?: number;
}

export function PublicShowcase({ deck, maxCards }: PublicShowcaseProps) {
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);

  // If maxCards is provided, slice the cards array
  const showcaseCards = maxCards ? deck.cards.slice(0, maxCards) : deck.cards;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '2rem' }}>
      {showcaseCards.map((card) => (
        <CardCanvas
          key={card.id}
          card={card as Card}
          deck={deck}
          flipped={flippedCardId === card.id}
          onFlip={() => setFlippedCardId(flippedCardId === card.id ? null : card.id)}
          // Grids look tighter and better framed with the literal printed aspect ratio
          forceOriginalMode={true} 
        />
      ))}
    </div>
  );
}
