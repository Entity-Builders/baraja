import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPreviewCards,
  getDeckSessionModes,
  type Card,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import {
  DIGITAL_DECKS,
  FEATURED_DIGITAL_DECK,
  formatDeckCategory,
  formatDeckPrice,
  getDeckPrintableLabel,
  getDeckPrintableVersion,
  getDeckAudienceBadges,
  hasPrintablePdf,
} from '../../lib/digitalDeckCatalog';
import {
  HERO_ROTATION_CONFIG_EVENT,
  getHeroRotationItems,
  type HeroRotationItem,
  type HeroRotationSlot,
} from '../../lib/heroRotationConfig';
import { trackBarajaEvent } from '../../services/analytics';
import { CardCanvas } from '../../components/cards/CardCanvas';

const HERO_ROTATION_INTERVAL_MS = 6800;
const SHOP_URL = 'https://shop.baraja.com';

const CATALOG_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'emotions', label: 'Emociones' },
  { id: 'conversation', label: 'Conversación' },
  { id: 'teams', label: 'Equipos' },
  { id: 'trivia', label: 'Trivia' },
  { id: 'facilitators', label: 'Facilitadores' },
  { id: 'printable', label: 'Imprimibles' },
] as const;

type CatalogFilterId = typeof CATALOG_FILTERS[number]['id'];

const FAQS = [
  {
    question: '¿Tengo que instalar una app?',
    answer:
      'No. Baraja funciona en el navegador y también puede instalarse como PWA en la pantalla de inicio.',
  },
  {
    question: '¿Funciona en iPhone?',
    answer:
      'Sí. Podés usarlo desde Safari y agregarlo a la pantalla de inicio para una experiencia más parecida a una app.',
  },
  {
    question: '¿Qué incluye el PDF imprimible?',
    answer:
      'Incluye una versión descargable preparada para llevar el mazo a la mesa, con guía de corte, material y recomendaciones de impresión. Los formatos finales pueden variar por mazo.',
  },
  {
    question: '¿Puedo probar antes de elegir?',
    answer:
      'Sí. Podés tocar una carta de muestra, ver el frente, revelar el reverso y abrir una sesión de prueba antes de elegir un mazo.',
  },
  {
    question: '¿Puedo usarlo en talleres o con clientes?',
    answer:
      'Sí, pero el uso profesional necesita una licencia adecuada. Para talleres, coaching, terapia, educación o equipos, escribinos y vemos el caso.',
    ctaLabel: 'Consultar uso profesional',
    ctaHref: 'mailto:hola@baraja.cards?subject=Uso%20profesional%20de%20Baraja',
  },
];

export default function DigitalDeckLibrary() {
  const featuredDeck = FEATURED_DIGITAL_DECK;

  useEffect(() => {
    trackBarajaEvent('baraja_deck_library_viewed', {
      deck_count: DIGITAL_DECKS.length,
      surface: 'landing',
    });
  }, []);

  if (!featuredDeck) {
    return (
      <main className="baraja-landing baraja-centered">
        <p className="baraja-kicker">Mazos digitales</p>
        <h1>Baraja</h1>
        <p>Todavía no hay mazos publicados.</p>
      </main>
    );
  }

  return (
    <main className="baraja-landing">
      <LandingNav />
      <Hero decks={DIGITAL_DECKS} featuredDeck={featuredDeck} />
      <DeckCatalogSection decks={DIGITAL_DECKS} featuredDeck={featuredDeck} />
      <DigitalPrintable deck={featuredDeck} />
      <FAQ />
      <FinalCTA deck={featuredDeck} />
      <LandingFooter />
    </main>
  );
}

function LandingNav() {
  return (
    <nav className="baraja-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <a href="#mazos">Colección</a>
        <a href="#pdf">PDF imprimible</a>
        <a href="#faq">FAQ</a>
        <Link to="/app">Abrir app</Link>
        <a href={SHOP_URL}>Tienda</a>
        <a href="#mazos" className="baraja-nav-cta">Ver mazos</a>
      </div>
    </nav>
  );
}

function Hero({
  decks,
  featuredDeck,
}: {
  decks: DeckSchema[];
  featuredDeck: DeckSchema;
}) {
  const [heroItems, setHeroItems] = useState(() => getHeroRotationItems(decks));
  const [selectedSlotId, setSelectedSlotId] = useState(heroItems[0]?.slot.id ?? featuredDeck.id);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const selectedItem = heroItems.find((item) => item.slot.id === selectedSlotId) ?? heroItems[0];
  const selectedDeck = selectedItem?.deck ?? featuredDeck;
  const selectedCard = selectedItem?.card ?? getPreviewCards(selectedDeck, 1)[0] ?? selectedDeck.cards[0] ?? null;
  const selectedGenre = selectedItem?.slot ?? {
    label: 'Baraja',
    claim: 'elegir una carta y dejar que haga su trabajo',
    tone: 'conversation',
  };

  useEffect(() => {
    function refreshHeroItems() {
      setHeroItems(getHeroRotationItems(decks));
    }

    refreshHeroItems();
    window.addEventListener('storage', refreshHeroItems);
    window.addEventListener(HERO_ROTATION_CONFIG_EVENT, refreshHeroItems);

    return () => {
      window.removeEventListener('storage', refreshHeroItems);
      window.removeEventListener(HERO_ROTATION_CONFIG_EVENT, refreshHeroItems);
    };
  }, [decks]);

  useEffect(() => {
    if (heroItems.length > 0 && !heroItems.some((item) => item.slot.id === selectedSlotId)) {
      const nextSlotId = heroItems[0].slot.id;
      const frame = window.requestAnimationFrame(() => {
        setSelectedSlotId(nextSlotId);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    return undefined;
  }, [heroItems, selectedSlotId]);

  const visibleHeroItems: HeroRotationItem[] = useMemo(() => (
    heroItems.length > 0
      ? heroItems
      : selectedCard ? [{
        slot: {
          id: selectedSlotId,
          label: selectedGenre.label,
          claim: selectedGenre.claim,
          tone: selectedGenre.tone as HeroRotationSlot['tone'],
          deckSlug: selectedDeck.slug,
          enabled: true,
        },
        deck: selectedDeck,
        card: selectedCard,
      }] : []
  ), [heroItems, selectedCard, selectedDeck, selectedGenre.claim, selectedGenre.label, selectedGenre.tone, selectedSlotId]);

  const selectedIndex = Math.max(
    0,
    visibleHeroItems.findIndex((item) => item.slot.id === selectedSlotId)
  );

  const selectSlot = useCallback((slotId: string) => {
    setSelectedSlotId(slotId);
  }, []);

  const selectRelativeSlot = useCallback((direction: -1 | 1) => {
    const nextIndex = (selectedIndex + direction + visibleHeroItems.length) % visibleHeroItems.length;
    const nextSlotId = visibleHeroItems[nextIndex]?.slot.id;

    if (nextSlotId) {
      selectSlot(nextSlotId);
    }
  }, [selectedIndex, selectSlot, visibleHeroItems]);

  useEffect(() => {
    if (isAutoPaused || visibleHeroItems.length < 2) {
      return undefined;
    }

    if (window.matchMedia('(max-width: 680px), (prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      selectRelativeSlot(1);
    }, HERO_ROTATION_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [isAutoPaused, selectRelativeSlot, visibleHeroItems.length]);

  if (!selectedCard) {
    return null;
  }

  return (
    <section className="baraja-hero">
      <div className="baraja-hero-bloom" aria-hidden="true" />
      <div className="baraja-hero-copy">
        <p className="baraja-kicker baraja-hero-kicker">Online + PDF imprimible</p>
        <h1>Mazos digitales en español</h1>
        <HeroCategoryTabs
          activeSlotId={selectedSlotId}
          items={visibleHeroItems}
          onSelect={selectSlot}
        />
        <p className="baraja-hero-mobile-summary" key={`mobile-${selectedSlotId}`}>
          Para {selectedGenre.claim}
        </p>
        <p className="baraja-lead baraja-lead-dynamic">
          <span className="baraja-lead-static baraja-lead-static--intro">Cartas listas para</span>
          <span className="baraja-lead-claim" key={selectedSlotId}>{selectedGenre.claim}</span>
          <span className="baraja-lead-static baraja-lead-static--details">
            Jugá online. Bajá el PDF cuando quieras llevarlas a la mesa.
          </span>
        </p>
        <div className="baraja-actions baraja-hero-actions">
          <a href="#probar-carta" className="baraja-button baraja-button-primary">Probar una carta</a>
          <a href="#mazos" className="baraja-button baraja-button-outline">Ver barajas</a>
        </div>
      </div>

      <HeroCardCarousel
        activeSlotId={selectedSlotId}
        isAutoPaused={isAutoPaused}
        items={visibleHeroItems}
        onInteractionEnd={() => setIsAutoPaused(false)}
        onInteractionStart={() => setIsAutoPaused(true)}
        onNext={() => selectRelativeSlot(1)}
        onPrevious={() => selectRelativeSlot(-1)}
      />
    </section>
  );
}

function HeroCategoryTabs({
  activeSlotId,
  items,
  onSelect,
}: {
  activeSlotId: string;
  items: HeroRotationItem[];
  onSelect: (slotId: string) => void;
}) {
  if (items.length < 2) {
    return null;
  }

  return (
    <div className="baraja-hero-category-tabs" aria-label="Categorías de mazos">
      {items.map((item) => {
        const isActive = item.slot.id === activeSlotId;

        return (
          <button
            aria-pressed={isActive}
            className={`baraja-hero-deck-tab baraja-hero-deck-tab--${item.slot.tone}${
              isActive ? ' baraja-hero-deck-tab--active' : ''
            }`}
            key={item.slot.id}
            type="button"
            onClick={() => onSelect(item.slot.id)}
          >
            {item.slot.label}
          </button>
        );
      })}
    </div>
  );
}

function HeroCardCarousel({
  activeSlotId,
  isAutoPaused,
  items,
  onInteractionEnd,
  onInteractionStart,
  onNext,
  onPrevious,
}: {
  activeSlotId: string;
  isAutoPaused: boolean;
  items: HeroRotationItem[];
  onInteractionEnd: () => void;
  onInteractionStart: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.slot.id === activeSlotId));
  const activeItem = items[activeIndex] ?? items[0];

  if (!activeItem) {
    return null;
  }

  return (
    <div
      className={`baraja-hero-carousel${isAutoPaused ? ' baraja-hero-carousel--paused' : ''}`}
      aria-label="Carrusel de categorías"
      onBlur={onInteractionEnd}
      onFocus={onInteractionStart}
      onPointerDown={onInteractionStart}
      onPointerEnter={onInteractionStart}
      onPointerLeave={onInteractionEnd}
    >
      <div className="baraja-hero-carousel-stage" key={activeItem.slot.id}>
        <HeroCardPreview
          selectedCard={activeItem.card}
          selectedDeck={activeItem.deck}
        />
      </div>
      {items.length > 1 && (
        <div className="baraja-hero-carousel-controls">
          <button
            aria-label="Categoría anterior"
            className="baraja-hero-carousel-arrow"
            type="button"
            onClick={onPrevious}
          >
            ‹
          </button>
          <div className="baraja-hero-carousel-dots" aria-hidden="true">
            {items.map((item, index) => (
              <span
                className={`baraja-hero-carousel-dot${
                  index === activeIndex ? ' baraja-hero-carousel-dot--active' : ''
                }`}
                key={item.slot.id}
              />
            ))}
          </div>
          <button
            aria-label="Siguiente categoría"
            className="baraja-hero-carousel-arrow"
            type="button"
            onClick={onNext}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function HeroCardPreview({
  selectedCard,
  selectedDeck,
}: {
  selectedCard: Card;
  selectedDeck: DeckSchema;
}) {
  return (
    <div
      className="baraja-hero-card-demo baraja-hero-card-demo--clean"
      id="probar-carta"
      aria-label={`Frente y reverso de ${selectedCard.front.title}`}
    >
      <div className="baraja-hero-card-spread">
        <figure className="baraja-hero-card-face baraja-hero-card-face--front">
          <CardCanvas
            card={selectedCard}
            deck={selectedDeck}
            flipped={false}
            showInfoRow={false}
            showQr={false}
          />
          <figcaption>Frente</figcaption>
        </figure>
        <figure className="baraja-hero-card-face baraja-hero-card-face--back">
          <CardCanvas
            card={selectedCard}
            deck={selectedDeck}
            flipped
            showInfoRow={false}
            showQr={false}
          />
          <figcaption>Reverso</figcaption>
        </figure>
      </div>
    </div>
  );
}

function DeckCatalogSection({
  decks,
  featuredDeck,
}: {
  decks: DeckSchema[];
  featuredDeck: DeckSchema;
}) {
  const [activeFilter, setActiveFilter] = useState<CatalogFilterId>('all');
  const filteredDecks = useMemo(
    () => decks.filter((deck) => deckMatchesCatalogFilter(deck, activeFilter)),
    [activeFilter, decks]
  );

  return (
    <section className="baraja-catalog-section" id="mazos">
      <div className="baraja-section-header baraja-catalog-intro">
        <div>
          <p className="baraja-kicker">Colección</p>
          <h2>Elegí tu próximo mazo.</h2>
        </div>
        <p>
          {decks.length} mazos disponibles. Filtrá por tema, intención o forma
          de juego; probá una carta antes de decidir y seguí al marketplace si
          querés ver todo el catálogo.
        </p>
      </div>
      <div className="baraja-catalog-controls">
        <div className="baraja-filter-row" aria-label="Filtrar mazos">
          {CATALOG_FILTERS.map((filter) => {
            const isActive = filter.id === activeFilter;
            const count = decks.filter((deck) => deckMatchesCatalogFilter(deck, filter.id)).length;

            return (
              <button
                aria-pressed={isActive}
                className={`baraja-filter-chip${isActive ? ' baraja-filter-chip-active' : ''}`}
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
              >
                <span>{filter.label}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
        <a className="baraja-catalog-marketplace" href={SHOP_URL}>
          Ver todos en shop.baraja.com
        </a>
      </div>
      <p className="baraja-catalog-count">
        {filteredDecks.length === decks.length
          ? `${decks.length} mazos publicados`
          : `${filteredDecks.length} de ${decks.length} mazos visibles`}
      </p>
      <div className="baraja-public-deck-grid">
        {filteredDecks.map((deck) => {
          const previewCard = getPreviewCards(deck, 1)[0] ?? deck.cards[0];
          const isFeatured = deck.id === featuredDeck.id;

          return (
            <article
              className={`baraja-public-deck-card${isFeatured ? ' baraja-public-deck-card--featured' : ''}`}
              key={deck.id}
            >
              <div className="baraja-public-deck-art">
                {previewCard?.front.art_url ? (
                  <img src={previewCard.front.art_url} alt="" />
                ) : (
                  <strong>{deck.name}</strong>
                )}
                {isFeatured && (
                  <span className="baraja-public-deck-trial-badge">Muestra disponible</span>
                )}
              </div>
              <div className="baraja-public-deck-copy">
                <div className="baraja-public-deck-meta">
                  <p>{formatDeckCategory(deck)}</p>
                  <span className="baraja-public-deck-count">{deck.card_count} cartas</span>
                </div>
                <h3>
                  <Link to={`/decks/${deck.slug}`}>{deck.name}</Link>
                </h3>
                <span>{deck.description}</span>
                <div className="baraja-deck-badges">
                  {getDeckAudienceBadges(deck).slice(0, 4).map((badge) => (
                    <small key={badge}>{badge}</small>
                ))}
                </div>
                <p className="baraja-public-deck-note">
                  {formatDeckPrice(deck)} · PDF imprimible incluido
                </p>
                <div className="baraja-public-deck-actions">
                  {isFeatured ? (
                    <>
                      <Link to={`/decks/${deck.slug}`}>Explorar mazo</Link>
                      <Link to={`/decks/${deck.slug}/session`}>Probar una carta</Link>
                    </>
                  ) : (
                    <>
                      <Link to={`/decks/${deck.slug}`}>Ver mazo</Link>
                      <Link to={`/decks/${deck.slug}/session`}>Probar una carta</Link>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="baraja-marketplace-band">
        <div>
          <p className="baraja-kicker">Marketplace</p>
          <h3>Más mazos, nuevas categorías y lanzamientos.</h3>
        </div>
        <a className="baraja-button baraja-button-outline" href={SHOP_URL}>
          Ir a shop.baraja.com
        </a>
      </div>
    </section>
  );
}

function DigitalPrintable({ deck }: { deck: DeckSchema }) {
  const printableLabel = getDeckPrintableLabel(deck);
  const printableVersion = getDeckPrintableVersion(deck);
  const previewCards = deck.cards.length > 0
    ? deck.cards.slice(0, 10)
    : getPreviewCards(deck, 10);

  return (
    <section className="baraja-printable" id="pdf">
      <div>
        <p className="baraja-kicker">Digital + imprimible</p>
        <h2>Una versión imprimible para llevar a la mesa.</h2>
        <p>
          Cada mazo incluye un PDF descargable preparado para uso personal.
          El formato final puede variar por baraja y licencia, con guía clara
          para imprimir, cortar y ordenar las cartas.
        </p>
        <div className="baraja-print-list">
          <span>Sesión digital siempre disponible</span>
          <span>{printableLabel}</span>
          <span>Formato preparado según cada mazo</span>
          <span>Guía de corte, material y terminación</span>
        </div>
      </div>
      <div className="baraja-print-visual" aria-label="Vista previa del PDF imprimible">
        <PrintableImpositionSheet
          cards={previewCards}
          deckName={deck.name}
          printableVersion={printableVersion}
          variant="section"
        />
        <div className="baraja-print-info-card">
          <span>{deck.card_count} cartas · PDF incluido</span>
          <strong>Frentes y dorsos listos para imprimir</strong>
          <small>Hojas preparadas con marcas de corte y guía de material.</small>
        </div>
      </div>
    </section>
  );
}

function PrintableImpositionSheet({
  cards,
  deckName,
  printableVersion,
  variant,
}: {
  cards: Card[];
  deckName: string;
  printableVersion: string;
  variant: 'hero' | 'section';
}) {
  const sheetCards = [...cards];

  while (sheetCards.length < 10 && cards.length > 0) {
    sheetCards.push(cards[sheetCards.length % cards.length]);
  }

  return (
    <div className={`baraja-print-sheet-preview baraja-print-sheet-preview--${variant}`}>
      <div className="baraja-print-sheet-meta">
        <span>PDF imprimible</span>
        <strong>{deckName}</strong>
        <small>{printableVersion}</small>
      </div>
      <div className="baraja-print-sheet-cropmarks" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="baraja-print-sheet-grid">
        {sheetCards.map((card, index) => (
          <figure key={`${card.id}-${index}`} className="baraja-print-card-slot">
            {card.front.art_url ? (
              <img src={card.front.art_url} alt="" />
            ) : (
              <span>{card.front.title}</span>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

function FAQ() {
  return (
    <section className="baraja-faq" id="faq">
      <div className="baraja-section-header">
        <p className="baraja-kicker">FAQ</p>
        <h2>Preguntas frecuentes</h2>
      </div>
      <div className="baraja-faq-list">
        {FAQS.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
            {'ctaHref' in faq && (
              <a className="baraja-faq-cta" href={faq.ctaHref}>
                {faq.ctaLabel}
              </a>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCTA({ deck }: { deck: DeckSchema }) {
  return (
    <section className="baraja-final-cta">
      <p className="baraja-kicker">{deck.name} · {deck.card_count} cartas</p>
      <h2>Jugá online o imprimilo</h2>
      <p>Elegí una baraja, probá una carta y seguí al marketplace cuando quieras ver más.</p>
      <div className="baraja-final-actions">
        <a href="#mazos" className="baraja-button baraja-button-primary">Ver colección</a>
        <a href={SHOP_URL} className="baraja-button baraja-button-outline">Ver todos</a>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="baraja-footer">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <span>© 2026 Baraja · Mazos digitales en español</span>
      <div>
        <a href="#mazos">Colección</a>
        <a href={SHOP_URL}>Tienda</a>
        <a href="#pdf">PDF imprimible</a>
        <a href="#faq">FAQ</a>
        <a href="mailto:hola@baraja.cards">Contacto</a>
      </div>
    </footer>
  );
}

function deckMatchesCatalogFilter(deck: DeckSchema, filterId: CatalogFilterId): boolean {
  const category = deck.digital?.category;
  const tags = new Set(deck.digital?.tags ?? []);
  const sessionModes = new Set(getDeckSessionModes(deck));
  const playerCount = deck.metadata.player_count.toLocaleLowerCase('es-AR');
  const searchableText = `${deck.name} ${deck.description} ${category ?? ''} ${Array.from(tags).join(' ')}`.toLocaleLowerCase('es-AR');

  switch (filterId) {
    case 'all':
      return true;
    case 'emotions':
      return category === 'emotional-regulation' || category === 'introspection' || tags.has('introspeccion') || tags.has('emociones');
    case 'conversation':
      return category === 'conversation' || sessionModes.has('pair') || sessionModes.has('group') || searchableText.includes('convers');
    case 'teams':
      return category === 'team-building' || searchableText.includes('equipo') || searchableText.includes('oficina') || playerCount.includes('personas');
    case 'trivia':
      return category === 'trivia' || searchableText.includes('trivia');
    case 'facilitators':
      return sessionModes.has('facilitator') || category === 'coaching' || tags.has('facilitadores') || searchableText.includes('taller');
    case 'printable':
      return hasPrintablePdf(deck);
  }

  return true;
}
