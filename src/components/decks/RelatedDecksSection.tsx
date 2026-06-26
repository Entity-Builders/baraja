import { Link } from 'react-router-dom';
import type { DeckSchema } from '@eb-packages/deck-engine';
import {
  formatDeckCategory,
  formatDeckPrice,
  getDeckAudienceBadges,
  getDeckHeroImage,
  getRelatedDigitalDecks,
} from '../../lib/digitalDeckCatalog';

interface RelatedDecksSectionProps {
  currentDeck: DeckSchema;
  title?: string;
  eyebrow?: string;
  intro?: string;
  maxItems?: number;
  getDeckHref?: (deck: DeckSchema) => string;
}

export function RelatedDecksSection({
  currentDeck,
  title = 'Te podría interesar',
  eyebrow = 'Mazos relacionados',
  intro = 'Otras barajas para seguir explorando según el tipo de juego, contexto y uso.',
  maxItems = 3,
  getDeckHref = (deck) => `/decks/${deck.slug}`,
}: RelatedDecksSectionProps) {
  const relatedDecks = getRelatedDigitalDecks(currentDeck, maxItems);

  if (relatedDecks.length === 0) {
    return null;
  }

  return (
    <section className="related-decks" aria-labelledby="related-decks-title">
      <div className="related-decks-header">
        <div>
          <p className="related-decks-eyebrow">{eyebrow}</p>
          <h2 className="related-decks-title" id="related-decks-title">
            {title}
          </h2>
        </div>
        <p>{intro}</p>
      </div>

      <div className="related-deck-rail" aria-label="Mazos relacionados">
        {relatedDecks.map((deck) => {
          const heroImage = getDeckHeroImage(deck);

          return (
            <Link className="related-deck-card" to={getDeckHref(deck)} key={deck.id}>
              <div className="related-deck-art">
                {heroImage ? <img src={heroImage} alt="" /> : <strong>{deck.name}</strong>}
              </div>
              <div className="related-deck-copy">
                <div className="related-deck-meta">
                  <span>{formatDeckCategory(deck)}</span>
                  <strong>{deck.card_count} cartas</strong>
                </div>
                <h3>{deck.name}</h3>
                <p>{deck.description}</p>
                <div className="related-deck-badges">
                  {getDeckAudienceBadges(deck).slice(0, 3).map((badge) => (
                    <small key={badge}>{badge}</small>
                  ))}
                </div>
                <span className="related-deck-cta">Ver mazo · {formatDeckPrice(deck)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
