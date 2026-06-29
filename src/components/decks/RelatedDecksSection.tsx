import { Link } from 'react-router-dom';
import type { DeckSchema } from '@eb-packages/deck-engine';
import {
  getDeckCatalogFacet,
  getDeckAudienceBadges,
  getDeckHeroImage,
  getRelatedDigitalDecks,
} from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

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
          const catalogFacet = getDeckCatalogFacet(deck);

          return (
            <Link
              className="related-deck-card"
              to={getDeckHref(deck)}
              key={deck.id}
              onClick={() => {
                trackBarajaEvent('baraja_related_deck_clicked', {
                  source: 'related_decks',
                  source_deck_id: currentDeck.id,
                  source_deck_slug: currentDeck.slug,
                  surface: 'deck_detail',
                  target_deck_id: deck.id,
                  target_deck_slug: deck.slug,
                });
              }}
            >
              <div className="related-deck-art">
                {heroImage ? <img src={heroImage} alt="" /> : <strong>{deck.name}</strong>}
              </div>
              <div className="related-deck-copy">
                <div className="related-deck-meta">
                  <span>{catalogFacet.familyLabel}</span>
                  <strong>{catalogFacet.subcategory}</strong>
                </div>
                <h3>{deck.name}</h3>
                <p>{catalogFacet.summary}</p>
                <div className="related-deck-badges">
                  {getDeckAudienceBadges(deck).slice(0, 3).map((badge) => (
                    <small key={badge}>{badge}</small>
                  ))}
                </div>
                <span className="related-deck-cta">Ver mazo</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
