import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { EbWhatsAppButton } from '@eb-packages/ui-web';
import {
  getPreviewCards,
  type Card,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import {
  DIGITAL_DECKS,
  FEATURED_DIGITAL_DECK,
  getBarajaGeneralInquiryMessage,
  getBarajaInquiryHref,
  getBarajaProfessionalUseInquiryMessage,
  getDeckPrintableLabel,
  getDeckPrintableVersion,
} from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';
import { FullscreenCardPreview } from '../../components/decks/FullscreenCardPreview';
import {
  getCatalogFilterSummaries,
  getDecksByCatalogFilter,
  getCatalogFilterFromSearch,
  type CatalogFilterId,
} from '../../lib/catalogFilters';
import {
  DeckCatalogFilterBar,
  DeckCatalogGrid,
  MarketplaceBand,
  type DeckCardPreviewSelection,
} from './components/DigitalDeckCatalog';
import { DigitalDeckHero } from './components/DigitalDeckHero';

const GENERAL_INQUIRY_URL = getBarajaInquiryHref(getBarajaGeneralInquiryMessage());
const PROFESSIONAL_USE_INQUIRY_URL = getBarajaInquiryHref(
  getBarajaProfessionalUseInquiryMessage()
);

function trackInquiryStart(source: string, ctaId: string, surface = 'landing') {
  trackBarajaEvent('baraja_inquiry_started', {
    cta_id: ctaId,
    cta_kind: 'whatsapp',
    href_type: 'wa_me',
    source,
    surface,
  });
}

function trackPrintableInterest(source: string, surface = 'landing') {
  trackBarajaEvent('baraja_printable_pdf_interest', {
    source,
    surface,
  });
}

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
    ctaHref: PROFESSIONAL_USE_INQUIRY_URL,
  },
  {
    question: '¿Pueden crear un mazo personalizado?',
    answer:
      'Sí. Estamos probando un servicio acompañado para convertir una intención, método, marca, comunidad, historia o dinámica de evento en un juego imprimible o mazo listo para imprimir, con superficie digital opcional.',
  },
  {
    question: '¿Pueden armar un bingo musical?',
    answer:
      'Sí. Podemos preparar cartones imprimibles, reglas, lista de canciones sugeridas y guía de dinámica. No vendemos música, audio ni derechos de reproducción; el organizador usa la plataforma y licencias que correspondan a su evento.',
  },
  {
    question: '¿Baraja imprime y envía los mazos?',
    answer:
      'No en este piloto. Entregamos archivos preparados para imprimir y una guía clara; la impresión física queda a cargo del cliente o su imprenta.',
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
      <DigitalDeckHero
        decks={DIGITAL_DECKS}
        featuredDeck={featuredDeck}
        inquiryUrl={GENERAL_INQUIRY_URL}
        onInquiryClick={() => trackInquiryStart('hero_consulta', 'hero_consulta')}
      />
      <DeckCatalogSection decks={DIGITAL_DECKS} featuredDeck={featuredDeck} />
      <DigitalPrintable deck={featuredDeck} />
      <FAQ />
      <FinalCTA />
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
        <a href="#pdf" onClick={() => trackPrintableInterest('nav_pdf')}>PDF imprimible</a>
        <a href="#faq">FAQ</a>
        <Link to="/app">Abrir app</Link>
        <Link to="/bingo-musical">Bingo musical</Link>
        <Link to="/mazos-personalizados">Crear juego</Link>
        <EbWhatsAppButton
          className="baraja-link-button"
          href={GENERAL_INQUIRY_URL}
          showIcon={false}
          onClick={() => trackInquiryStart('nav_consulta', 'nav_consulta')}
        >
          Consulta
        </EbWhatsAppButton>
        <a href="#mazos" className="baraja-nav-cta">Ver mazos</a>
      </div>
    </nav>
  );
}

function DeckCatalogSection({
  decks,
  featuredDeck,
}: {
  decks: DeckSchema[];
  featuredDeck: DeckSchema;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeFilter = useMemo(
    () => getCatalogFilterFromSearch(location.search),
    [location.search]
  );
  const [fullscreenPreview, setFullscreenPreview] = useState<DeckCardPreviewSelection | null>(null);

  const setCatalogFilter = useCallback((filterId: CatalogFilterId) => {
    const params = new URLSearchParams(location.search);
    const nextDecks = getDecksByCatalogFilter(decks, filterId);

    trackBarajaEvent('baraja_catalog_filter_selected', {
      filter_id: filterId,
      result_count: nextDecks.length,
      surface: 'landing_catalog',
    });

    if (filterId === 'all') {
      params.delete('catalog');
    } else {
      params.set('catalog', filterId);
    }

    const search = params.toString();

    navigate({
      pathname: location.pathname,
      search: search ? `?${search}` : '',
      hash: 'mazos',
    }, { replace: true });
  }, [decks, location.pathname, location.search, navigate]);

  const handlePreview = useCallback((selection: DeckCardPreviewSelection) => {
    trackBarajaEvent('baraja_preview_opened', {
      card_id: selection.card.id,
      card_number: selection.card.front.number,
      deck_id: selection.deck.id,
      deck_slug: selection.deck.slug,
      face: selection.initialMode,
      source: 'catalog_card',
      surface: 'landing_catalog',
    });
    setFullscreenPreview(selection);
  }, []);

  const filteredDecks = useMemo(
    () => getDecksByCatalogFilter(decks, activeFilter),
    [activeFilter, decks]
  );
  const filterSummaries = useMemo(
    () => getCatalogFilterSummaries(decks),
    [decks]
  );

  return (
    <section className="baraja-catalog-section" id="mazos">
      <div className="baraja-section-header baraja-catalog-intro">
        <div>
          <p className="baraja-kicker">Colección</p>
          <h2>Mazos por categoría.</h2>
        </div>
        <p>
          Filtrá por familia, mirá una carta y escribinos para consultar por
          una edición.
        </p>
      </div>
      <DeckCatalogFilterBar
        activeFilter={activeFilter}
        filters={filterSummaries}
        inquiryUrl={GENERAL_INQUIRY_URL}
        onFilterChange={setCatalogFilter}
        onInquiryClick={() => trackInquiryStart('catalog_inquiry', 'catalog_inquiry', 'landing_catalog')}
      />
      <p className="baraja-catalog-count">
        {filteredDecks.length === decks.length
          ? `${decks.length} mazos publicados`
          : `${filteredDecks.length} de ${decks.length} mazos visibles`}
      </p>
      <DeckCatalogGrid
        decks={filteredDecks}
        featuredDeckId={featuredDeck.id}
        onPreview={handlePreview}
      />
      <MarketplaceBand
        inquiryUrl={GENERAL_INQUIRY_URL}
        onInquiryClick={() => trackInquiryStart('marketplace_band', 'marketplace_band', 'landing_catalog')}
      />
      {fullscreenPreview && (
        <FullscreenCardPreview
          card={fullscreenPreview.card}
          deck={fullscreenPreview.deck}
          initialMode={fullscreenPreview.initialMode}
          onClose={() => setFullscreenPreview(null)}
        />
      )}
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
              <EbWhatsAppButton
                className="baraja-faq-cta"
                href={faq.ctaHref}
                onClick={() => trackInquiryStart('faq_professional_use', 'faq_professional_use')}
              >
                {faq.ctaLabel}
              </EbWhatsAppButton>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
      <section className="baraja-final-cta">
        <p className="baraja-kicker">Juegos y ediciones a medida</p>
      <h2>Tu idea convertida en un imprimible propio.</h2>
      <p>
        Para bingos musicales, fútbol, bares, facilitadores, equipos, marcas,
        comunidades o historias personales: armamos el juego y entregamos
        archivos listos para imprimir, con guía de dinámica y superficie
        digital opcional.
      </p>
      <div className="baraja-final-points" aria-label="Opciones de personalización">
        <span>Bingo musical</span>
        <span>Brief guiado</span>
        <span>Guía de dinámica</span>
        <span>Textos editados</span>
        <span>PDF print-ready</span>
        <span>Digital opcional</span>
      </div>
      <div className="baraja-final-actions">
        <Link
          to="/bingo-musical"
          className="baraja-button baraja-button-primary"
          onClick={() => trackBarajaEvent('baraja_offer_cta_clicked', {
            campaign_id: 'music_bingo',
            cta_id: 'home_music_bingo_landing',
            offer_id: 'music_bingo',
            offer_type: 'campaign_landing',
            source: 'home_final_cta',
            surface: 'landing',
          })}
        >
          Ver bingo musical
        </Link>
        <Link
          to="/mazos-personalizados"
          className="baraja-button baraja-button-outline"
          onClick={() => trackInquiryStart('custom_edition_landing', 'custom_edition_landing')}
        >
          Armar mi juego
        </Link>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="baraja-footer">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <span>© 2026 Baraja · Barajas digitales, imprimibles y a medida</span>
      <div>
        <a href="#mazos">Colección</a>
        <Link to="/bingo-musical">Bingo musical</Link>
        <Link to="/mazos-personalizados">Crear juego</Link>
        <EbWhatsAppButton
          className="baraja-link-button"
          href={GENERAL_INQUIRY_URL}
          showIcon={false}
          onClick={() => trackInquiryStart('footer_consulta', 'footer_consulta')}
        >
          Consulta
        </EbWhatsAppButton>
        <a href="#pdf" onClick={() => trackPrintableInterest('footer_pdf')}>PDF imprimible</a>
        <a href="#faq">FAQ</a>
        <EbWhatsAppButton
          className="baraja-link-button"
          href={GENERAL_INQUIRY_URL}
          showIcon={false}
          onClick={() => trackInquiryStart('footer_contacto', 'footer_contacto')}
        >
          Contacto
        </EbWhatsAppButton>
      </div>
    </footer>
  );
}
