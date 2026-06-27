import { Link, Navigate, useParams } from 'react-router-dom';
import { getPreviewCards } from '@eb-packages/deck-engine';
import {
  findDigitalDeck,
  getDeckInquiryHref,
  getDeckAudienceBadges,
  hasVerifiedDigitalDeckAccess,
} from '../../lib/digitalDeckCatalog';

export default function DigitalAppDeckDetail() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <p className="baraja-kicker">Mazo no encontrado</p>
        <h1>No encontramos esa edición.</h1>
        <Link className="baraja-button baraja-button-primary" to="/app">Volver</Link>
      </main>
    );
  }

  if (hasVerifiedDigitalDeckAccess(deck)) {
    return <Navigate to={`/app/decks/${deck.slug}/session`} replace />;
  }

  const previewCards = getPreviewCards(deck, 4);
  const heroCard = previewCards[0] ?? deck.cards[0];
  const inquiryHref = getDeckInquiryHref(deck);

  return (
    <main className="baraja-mobile-app baraja-app-detail">
      <section className="baraja-mobile-content">
        <Link to="/app/collections" className="baraja-mobile-back">Colecciones</Link>

        <div className="baraja-app-stack-card">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          {heroCard?.front.art_url ? (
            <img src={heroCard.front.art_url} alt="" />
          ) : (
            <strong>{heroCard?.front.title ?? deck.name}</strong>
          )}
        </div>

        <section className="baraja-app-detail-copy baraja-deck-landing-copy">
          <h1>{deck.name}</h1>
          <p>{deck.description}</p>
          <div className="baraja-deck-badges">
            {getDeckAudienceBadges(deck).map((badge) => (
              <small key={badge}>{badge}</small>
            ))}
          </div>
        </section>

        <section className="baraja-deck-preview-strip" aria-label="Cartas incluidas en el preview">
          {previewCards.map((card) => (
            <article key={card.id}>
              {card.front.art_url && <img src={card.front.art_url} alt="" />}
              <span>{card.front.title}</span>
            </article>
          ))}
        </section>

        <section className="baraja-deck-includes">
          <p className="baraja-mobile-section-label">Incluye</p>
          <ul>
            <li>{deck.card_count} cartas digitales completas</li>
            <li>Sesión interactiva con frente y reverso real</li>
            <li>PDF imprimible descargable y guía para imprenta</li>
          </ul>
        </section>

        <div className="baraja-app-detail-actions">
          <a href={inquiryHref}>Consultar acceso</a>
          <Link to={`/app/decks/${deck.slug}/session`}>Probar sesión gratuita</Link>
        </div>
      </section>
    </main>
  );
}
