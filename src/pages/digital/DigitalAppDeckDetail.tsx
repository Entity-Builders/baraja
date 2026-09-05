import { Link, Navigate, useParams } from 'react-router-dom';
import { EbWhatsAppButton } from '@entity-builders/ui-web';
import { getPreviewCards } from '@entity-builders/deck-engine';
import {
  findDigitalDeck,
  getDeckInquiryHref,
  getDeckAudienceBadges,
  hasVerifiedDigitalDeckAccess,
} from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

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
  const trackInquiry = () => {
    trackBarajaEvent('baraja_inquiry_started', {
      cta_id: 'pwa_deck_detail_access',
      cta_kind: 'whatsapp',
      deck_id: deck.id,
      deck_slug: deck.slug,
      href_type: 'wa_me',
      source: 'pwa_deck_detail',
      surface: 'pwa_deck_detail',
    });
  };

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

        <section className="baraja-deck-includes" aria-labelledby="baraja-deck-includes-title">
          <h2 id="baraja-deck-includes-title" className="baraja-mobile-section-label">
            Incluye
          </h2>
          <ul>
            <li>
              <span aria-hidden="true">✓</span>
              <div>
                <strong>{deck.card_count} cartas digitales</strong>
                <small>Frente y reverso completos para jugar desde el teléfono.</small>
              </div>
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Sesión interactiva</strong>
                <small>Navegación carta por carta, galería rápida y guardadas.</small>
              </div>
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              <div>
                <strong>PDF imprimible</strong>
                <small>Descarga preparada con guía para llevarlo a imprenta.</small>
              </div>
            </li>
          </ul>
        </section>

        <div className="baraja-app-detail-actions">
          <EbWhatsAppButton href={inquiryHref} onClick={trackInquiry}>
            Consultar acceso
          </EbWhatsAppButton>
          <Link to={`/app/decks/${deck.slug}/session`}>Probar sesión gratuita</Link>
        </div>
      </section>
    </main>
  );
}
