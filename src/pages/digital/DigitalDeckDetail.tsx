import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  flipCardFace,
  getPreviewCards,
  type Card,
  type CardFace,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import {
  getDeckCatalogBreadcrumb,
  getDeckCatalogFacet,
  getDeckInquiryHref,
  getDeckHeroImage,
  hasPrintablePdf,
} from '../../lib/digitalDeckCatalog';
import { RelatedDecksSection } from '../../components/decks/RelatedDecksSection';
import { trackBarajaEvent } from '../../services/analytics';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { useDeck } from '../../hooks/useDeck';

export default function DigitalDeckDetail() {
  const { slug } = useParams();
  const { deck, loading } = useDeck(slug);
  const [flippedCards, setFlippedCards] = useState<Record<string, CardFace>>({});
  const previewCards = deck ? getPreviewCards(deck, 3) : [];
  const printableEnabled = deck ? hasPrintablePdf(deck) : false;

  useEffect(() => {
    if (!deck) {
      return;
    }

    trackBarajaEvent('baraja_deck_detail_viewed', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      card_count: deck.card_count,
      preview_card_count: previewCards.length,
      printable_enabled: printableEnabled,
      surface: 'deck_detail',
    });
  }, [deck, previewCards.length, printableEnabled]);

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

  const activeDeck = deck;

  function trackDeckInquiry(source: string, ctaId: string) {
    trackBarajaEvent('baraja_inquiry_started', {
      cta_id: ctaId,
      cta_kind: 'mailto',
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      href_type: 'mailto',
      source,
      surface: 'deck_detail',
    });
  }

  function toggleCard(card: Card) {
    const currentFace = flippedCards[card.id] ?? 'front';
    const nextFace = flipCardFace(currentFace);

    trackBarajaEvent('baraja_preview_opened', {
      card_id: card.id,
      card_number: card.front.number,
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      face: nextFace,
      source: 'deck_detail_preview',
      surface: 'deck_detail',
    });

    setFlippedCards((current) => ({
      ...current,
      [card.id]: nextFace,
    }));
  }

  const catalogFacet = getDeckCatalogFacet(activeDeck);
  const breadcrumb = getDeckCatalogBreadcrumb(activeDeck);
  const catalogSearch = `?catalog=${catalogFacet.collectionId}`;
  const landingCopy = activeDeck.digital?.landing;
  const heroImage = getDeckHeroImage(activeDeck);
  const inquiryHref = getDeckInquiryHref(activeDeck);

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to="/" className="digital-brand">Baraja.cards</Link>
        <div className="digital-nav-links">
          <Link to={{ pathname: '/', search: catalogSearch, hash: '#mazos' }}>
            {catalogFacet.collectionLabel}
          </Link>
          <a
            href={inquiryHref}
            onClick={() => trackDeckInquiry('deck_detail_nav', 'deck_detail_nav')}
          >
            Consultar
          </a>
        </div>
      </nav>

      <section className="digital-detail-hero">
        <div className="digital-detail-copy">
          <nav className="digital-breadcrumb" aria-label="Ubicación del mazo">
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              const prefix = item.kind === 'collection'
                ? 'Colección:'
                : item.kind === 'category' ? 'Categoría:' : '';
              const label = (
                <>
                  {prefix && <span>{prefix}</span>}
                  {item.label}
                </>
              );

              return (
                <span className="digital-breadcrumb-item" key={`${item.kind}-${item.id}`}>
                  {isLast ? (
                    <strong aria-current="page">{label}</strong>
                  ) : (
                    <Link to={{ pathname: '/', search: catalogSearch, hash: '#mazos' }}>
                      {label}
                    </Link>
                  )}
                  {!isLast && <small aria-hidden="true">/</small>}
                </span>
              );
            })}
          </nav>
          <h1>{deck.name}</h1>
          <p className="digital-lead">{landingCopy?.hero_promise ?? deck.description}</p>
          <p className="digital-detail-summary">
            {landingCopy?.hero_supporting_copy ?? catalogFacet.summary}
          </p>
          <div className="digital-actions">
            <a
              href={inquiryHref}
              className="btn-primary"
              onClick={() => trackDeckInquiry('deck_detail_hero', 'deck_detail_hero')}
            >
              Consultar por este mazo
            </a>
            <Link to={`/decks/${deck.slug}/access`} className="btn-ghost">
              Ver acceso
            </Link>
          </div>
        </div>
        <div className="digital-detail-media">
          {heroImage && <img src={heroImage} alt="" />}
        </div>
      </section>

      <section className="digital-section" id="preview">
        <div className="digital-section-header">
          <p className="digital-kicker">Muestra</p>
          <h2>Una muestra del tono</h2>
          <p className="digital-section-intro">
            {landingCopy?.preview_intro ??
              'Algunas cartas alcanzan para entender la experiencia sin revelar el mazo completo.'}
          </p>
        </div>
        <div className="digital-preview-grid">
          {previewCards.map((card) => (
            <PreviewCard
              key={card.id}
              card={card}
              deck={deck}
              face={flippedCards[card.id] ?? 'front'}
              onFlip={() => toggleCard(card)}
            />
          ))}
        </div>
      </section>

      <section className="digital-band">
        <div>
          <p className="digital-kicker">Acceso completo</p>
          <h2>Para usar el mazo completo, consultanos.</h2>
          <p>
            {landingCopy?.unlock_summary ??
              'El mazo completo suma sesión guiada, favoritos locales y el paquete imprimible cuando la edición lo incluye.'}
          </p>
        </div>
        <a
          href={inquiryHref}
          className="btn-primary"
          onClick={() => trackDeckInquiry('deck_detail_access_band', 'deck_detail_access_band')}
        >
          Consultar acceso
        </a>
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
