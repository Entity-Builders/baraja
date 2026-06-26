import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  flipCardFace,
  getDeckSessionModes,
  getPreviewCards,
  type Card,
  type CardFace,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import {
  formatDeckPrice,
  getDeckHeroImage,
  getDeckPrintableVersion,
} from '../../lib/digitalDeckCatalog';
import { RelatedDecksSection } from '../../components/decks/RelatedDecksSection';
import { trackBarajaEvent } from '../../services/analytics';
import { usePwaStatus } from '../../hooks/usePwaStatus';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { useDeck } from '../../hooks/useDeck';

export default function DigitalDeckDetail() {
  const { slug } = useParams();
  const { deck, loading } = useDeck(slug);
  const { isStandalone } = usePwaStatus();
  const [flippedCards, setFlippedCards] = useState<Record<string, CardFace>>({});
  const previewCards = deck ? getPreviewCards(deck, 3) : [];
  const lockedCount = deck ? Math.max(0, deck.card_count - previewCards.length) : 0;

  useEffect(() => {
    if (!deck) {
      return;
    }

    trackBarajaEvent('baraja_deck_detail_viewed', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      card_count: deck.card_count,
      preview_card_count: previewCards.length,
      printable_enabled: true,
      surface: 'deck_detail',
    });
    trackBarajaEvent('baraja_paywall_viewed', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      locked_count: lockedCount,
      surface: 'deck_detail',
    });
  }, [deck, lockedCount, previewCards.length]);

  if (loading && !deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Cargando mazo</p>
        <h1>Preparando las cartas.</h1>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Mazo no encontrado</p>
        <h1>No encontramos esa edición.</h1>
        <Link className="btn-primary" to="/">Volver a la biblioteca</Link>
      </main>
    );
  }

  function toggleCard(cardId: string) {
    setFlippedCards((current) => ({
      ...current,
      [cardId]: flipCardFace(current[cardId] ?? 'front'),
    }));
  }

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to="/" className="digital-brand">Baraja.cards</Link>
        <div className="digital-nav-links">
          <Link to={`/decks/${deck.slug}/session`}>Sesión</Link>
          <Link to={`/install?deck=${deck.slug}`}>
            {isStandalone ? 'App lista' : 'Instalar'}
          </Link>
          <Link to={`/decks/${deck.slug}/print-guide`}>PDF imprimible</Link>
        </div>
      </nav>

      <section className="digital-detail-hero">
        <div className="digital-detail-copy">
          <p className="digital-kicker">{deck.digital?.category}</p>
          <h1>{deck.name}</h1>
          <p className="digital-lead">{deck.description}</p>
          <div className="digital-meta-row digital-meta-row-large">
            <span>{deck.card_count} cartas</span>
            <span>{getDeckSessionModes(deck).join(' / ')}</span>
            <span>{getDeckPrintableVersion(deck)}</span>
          </div>
          <div className="digital-actions">
            <Link to={`/decks/${deck.slug}/session`} className="btn-primary">
              Comenzar
            </Link>
            <Link
              to={`/decks/${deck.slug}/access`}
              className="btn-ghost"
              onClick={() => trackBarajaEvent('baraja_checkout_started', {
                deck_id: deck.id,
                deck_slug: deck.slug,
                surface: 'deck_detail',
              })}
            >
              Comprar acceso {formatDeckPrice(deck)}
            </Link>
            <Link to={`/install?deck=${deck.slug}`} className="digital-inline-link">
              {isStandalone ? 'Abrir como app instalada' : 'Instalar Baraja'}
            </Link>
          </div>
        </div>
        <div className="digital-detail-media">
          {getDeckHeroImage(deck) && <img src={getDeckHeroImage(deck)} alt="" />}
        </div>
      </section>

      <section className="digital-section">
        <div className="digital-section-header">
          <p className="digital-kicker">Preview</p>
          <h2>Tres cartas abiertas</h2>
        </div>
        <div className="digital-preview-grid">
          {previewCards.map((card) => (
            <PreviewCard
              key={card.id}
              card={card}
              deck={deck}
              face={flippedCards[card.id] ?? 'front'}
              onFlip={() => toggleCard(card.id)}
            />
          ))}
        </div>
      </section>

      <section className="digital-band">
        <div>
          <p className="digital-kicker">Acceso completo</p>
          <h2>{lockedCount} cartas quedan desbloqueadas al comprar.</h2>
          <p>
            El acceso pago suma sesión completa, favoritos locales y el paquete
            imprimible descargable incluido.
          </p>
        </div>
        <Link
          to={`/decks/${deck.slug}/access`}
          className="btn-primary"
          onClick={() => trackBarajaEvent('baraja_checkout_started', {
            deck_id: deck.id,
            deck_slug: deck.slug,
            surface: 'locked_band',
          })}
        >
          Ver acceso
        </Link>
      </section>

      <RelatedDecksSection currentDeck={deck} />
    </main>
  );
}

function PreviewCard({
  card,
  deck,
  face,
  onFlip,
}: {
  card: Card;
  deck: DeckSchema;
  face: CardFace;
  onFlip: () => void;
}) {
  return (
    <button
      className="digital-preview-card digital-preview-card-canvas"
      onClick={onFlip}
      type="button"
      aria-label={`Ver ${face === 'front' ? 'reverso' : 'frente'} de ${card.front.title}`}
    >
      <CardCanvas
        card={card}
        deck={deck}
        flipped={face === 'back'}
        showInfoRow={false}
        showQr={false}
      />
      <span className="sr-only">
        {face === 'front' ? 'Frente' : 'Reverso'} de {card.front.title}
      </span>
    </button>
  );
}
