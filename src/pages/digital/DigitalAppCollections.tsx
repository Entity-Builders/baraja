import { Link } from 'react-router-dom';
import { getPreviewCards } from '@eb-packages/deck-engine';
import {
  DIGITAL_DECKS,
  formatDeckCategory,
  getDeckAudienceBadges,
  hasVerifiedDigitalDeckAccess,
} from '../../lib/digitalDeckCatalog';

export default function DigitalAppCollections() {
  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content baraja-collections-page">
        <header className="baraja-mobile-header">
          <div>
            <p className="baraja-mobile-section-label">Colecciones</p>
            <h1>Explorar mazos</h1>
          </div>
          <Link className="baraja-avatar-button" to="/app/access">
            <span className="sr-only">Mi acceso</span>
          </Link>
        </header>

        <div className="baraja-collection-grid">
          {DIGITAL_DECKS.map((deck) => {
            const previewCard = getPreviewCards(deck, 1)[0] ?? deck.cards[0];
            const owned = hasVerifiedDigitalDeckAccess(deck);
            const href = owned
              ? `/app/decks/${deck.slug}/session`
              : `/app/decks/${deck.slug}`;

            return (
              <Link className="baraja-collection-card" to={href} key={deck.id}>
                <div className="baraja-collection-art">
                  {previewCard?.front.art_url ? (
                    <img src={previewCard.front.art_url} alt="" />
                  ) : (
                    <strong>{deck.name}</strong>
                  )}
                </div>
                <div className="baraja-collection-copy">
                  <div>
                    <p>{formatDeckCategory(deck)}</p>
                    <h2>{deck.name}</h2>
                  </div>
                  <span>{deck.description}</span>
                  <div className="baraja-deck-badges">
                    {getDeckAudienceBadges(deck).map((badge) => (
                      <small key={badge}>{badge}</small>
                    ))}
                  </div>
                  <strong>{owned ? 'Abrir sesión' : 'Consultar acceso'}</strong>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
