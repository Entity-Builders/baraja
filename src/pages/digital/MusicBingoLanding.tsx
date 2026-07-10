import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MUSIC_BINGO_BAR_EVENT_OFFERING,
  MUSIC_BINGO_CAMPAIGN_LANDING,
  MUSIC_BINGO_PREBUILT_OFFERINGS,
  MUSIC_BINGO_PRODUCT,
  getMusicBingoSelfServePriceQuote,
  type ProductOffering,
} from '@eb-packages/deck-engine';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

const CAMPAIGN_ID = MUSIC_BINGO_CAMPAIGN_LANDING.id;
const PREBUILT_BINGOS = MUSIC_BINGO_PREBUILT_OFFERINGS;
const CREATOR_ROUTE = '/bingo-musical/crear';
const CATALOG_ROUTE = '/bingo-musical/catalogo';
const CREATOR_OFFER_ID = `${MUSIC_BINGO_PRODUCT.id}_creator`;
const CREATOR_OFFER_TYPE = 'music_bingo_creator';
const LANDING_TITLE = 'Bingo musical imprimible para fiestas | Baraja';
const LANDING_DESCRIPTION =
  'Creá un bingo musical imprimible con playlist de Spotify, cartones únicos, hoja de control y guía para conducir la dinámica.';
const LANDING_URL = 'https://baraja.cards/bingo-musical';
const OFFER_COLLECTION_IDS: Record<string, string> = {
  'rock-argentino-prebuilt': 'rock-argentino-esenciales',
  'cumbia-retro-prebuilt': 'cumbia-cuarteto-argentina',
  'hits-2000-prebuilt': 'pop-latino-2000s',
};
const PREBUILT_STARTING_PRICE = getMusicBingoSelfServePriceQuote(15, 'prebuilt');
const PLAYLIST_STARTING_PRICE = getMusicBingoSelfServePriceQuote(15, 'playlist_own');

function applyMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  if (typeof document === 'undefined') return;

  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }

  tag.setAttribute('content', content);
}

function applyCanonicalUrl(href: string) {
  if (typeof document === 'undefined') return;

  let tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', 'canonical');
    document.head.appendChild(tag);
  }

  tag.setAttribute('href', href);
}

function buildOfferingMessage(offer: ProductOffering): string {
  return offer.messageLines.join('\n');
}

function getCreatorRouteForOffering(offer: ProductOffering): string {
  const collectionId = OFFER_COLLECTION_IDS[offer.id];
  return collectionId
    ? `${CREATOR_ROUTE}?catalogCollectionId=${encodeURIComponent(collectionId)}`
    : CREATOR_ROUTE;
}

function trackCampaignAction(offerId: string, offerType: string, source: string) {
  trackBarajaEvent('baraja_offer_cta_clicked', {
    campaign_id: CAMPAIGN_ID,
    cta_id: `${CAMPAIGN_ID}_${offerId}`,
    offer_id: offerId,
    offer_type: offerType,
    source,
    surface: 'music_bingo_landing',
  });
}

function trackCreatorPath(
  source: string,
  offerId = CREATOR_OFFER_ID,
  offerType = CREATOR_OFFER_TYPE
) {
  trackCampaignAction(offerId, offerType, source);
}

function trackInquiry(offerId: string, offerType: string, source: string) {
  trackBarajaEvent('baraja_inquiry_started', {
    campaign_id: CAMPAIGN_ID,
    cta_id: `${CAMPAIGN_ID}_${offerId}`,
    cta_kind: 'whatsapp',
    href_type: 'wa_me',
    offer_id: offerId,
    offer_type: offerType,
    source,
    surface: 'music_bingo_landing',
  });
}

export default function MusicBingoLanding() {
  useEffect(() => {
    document.title = LANDING_TITLE;
    applyMeta('description', LANDING_DESCRIPTION);
    applyMeta('og:title', LANDING_TITLE, 'property');
    applyMeta('og:description', LANDING_DESCRIPTION, 'property');
    applyMeta('og:url', LANDING_URL, 'property');
    applyMeta('twitter:card', 'summary');
    applyMeta('twitter:title', LANDING_TITLE);
    applyMeta('twitter:description', LANDING_DESCRIPTION);
    applyCanonicalUrl(LANDING_URL);

    trackBarajaEvent('baraja_campaign_landing_viewed', {
      campaign_id: CAMPAIGN_ID,
      route: MUSIC_BINGO_CAMPAIGN_LANDING.route,
      surface: 'music_bingo_landing',
    });
  }, []);

  return (
    <main className="baraja-landing baraja-campaign">
      <MusicBingoNav />
      <section className="baraja-campaign-hero">
        <div className="baraja-campaign-hero-copy">
          <p className="baraja-kicker">Bingo musical</p>
          <h1>
            Armá un <span>bingo musical</span> listo para imprimir.
          </h1>
          <p className="baraja-lead">
            Elegí una colección Baraja o armalo con tu playlist. Revisás el
            PDF antes de pagar; vos imprimís, ponés la música y jugás.
          </p>
          <div className="baraja-actions">
            <a
              href="#colecciones"
              className="baraja-button baraja-button-primary"
              onClick={() =>
                trackCampaignAction(
                  PREBUILT_BINGOS[0]?.id ?? CREATOR_OFFER_ID,
                  PREBUILT_BINGOS[0]?.analyticsOfferType ?? CREATOR_OFFER_TYPE,
                  'hero_collections'
                )
              }
            >
              Elegir una colección
            </a>
            <Link
              to={CREATOR_ROUTE}
              className="baraja-button baraja-button-outline"
              onClick={() => trackCreatorPath('hero_playlist')}
            >
              Usar mi playlist
            </Link>
          </div>
          <div className="baraja-hero-price-grid" aria-label="Precios desde">
            <article>
              <span>Colección Baraja</span>
              <strong>Desde {PREBUILT_STARTING_PRICE?.label ?? 'consultar'}</strong>
              <small>15 cartones prearmados</small>
            </article>
            <article>
              <span>Tu playlist</span>
              <strong>Desde {PLAYLIST_STARTING_PRICE?.label ?? 'consultar'}</strong>
              <small>15 cartones con tu música</small>
            </article>
          </div>
          <div className="baraja-hero-pill-row" aria-label="Incluye">
            <span>Preview antes de pagar</span>
            <span>PDF imprimible</span>
            <span>Hoja de control y guía</span>
          </div>
        </div>
        <MusicBingoPreview />
      </section>

      <section className="baraja-campaign-section baraja-campaign-steps" id="como-funciona">
        <div className="baraja-section-header baraja-section-header-centered">
          <p className="baraja-kicker">Cómo funciona</p>
          <h2>Del repertorio al PDF en tres pasos.</h2>
        </div>
        <div className="baraja-campaign-step-grid" aria-label="Pasos para crear un bingo musical">
          <article>
            <span>1</span>
            <h3>Elegí la música</h3>
            <p>Partí de una colección Baraja o pegá una playlist pública de Spotify.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Revisá el pack</h3>
            <p>Ajustá cartones y formato, y comprobá que el repertorio alcanza para jugar.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Pagá e imprimí</h3>
            <p>Con el pago confirmado recibís el PDF con cartones, control y guía.</p>
          </article>
        </div>
      </section>

      <section className="baraja-campaign-section" id="colecciones">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Colecciones Baraja</p>
          <h2>Elegí una colección y abrila en el creador.</h2>
          <p>
            Repertorios curados para empezar rápido. Se abren con las canciones
            cargadas para que revises el PDF antes de pagar.
          </p>
        </div>
        <div className="baraja-campaign-offer-grid">
          {PREBUILT_BINGOS.map((offer) => (
            <article className="baraja-campaign-offer" key={offer.id}>
              <div>
                <p>{offer.tags.join(' / ')}</p>
                <h3>{offer.title}</h3>
                <span>{offer.audience}</span>
              </div>
              <p>{offer.description}</p>
              <div className="baraja-campaign-song-list" aria-label={`Ejemplos para ${offer.title}`}>
                {offer.sampleItems.map((song) => (
                  <span key={song}>{song}</span>
                ))}
              </div>
              <div className="baraja-campaign-offer-actions">
                <Link
                  to={getCreatorRouteForOffering(offer)}
                  className="baraja-button baraja-button-primary"
                  onClick={() =>
                    trackCreatorPath(
                      `collection_${offer.id}`,
                      offer.id,
                      offer.analyticsOfferType
                    )
                  }
                >
                  Abrir colección
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="baraja-campaign-section baraja-campaign-paths" id="playlist">
        <article>
          <p className="baraja-kicker">Con tu música</p>
          <h2>Tu playlist, tu fiesta.</h2>
          <p>
            Pegá una playlist pública de Spotify, elegí la cantidad de cartones
            y revisá cómo queda antes de abrir Mercado Pago.
          </p>
          <div className="baraja-final-points">
            <span>Cartones únicos</span>
            <span>Validación del repertorio</span>
            <span>Precio desde {PLAYLIST_STARTING_PRICE?.label ?? 'consultar'}</span>
          </div>
          <div className="baraja-campaign-inline-actions">
            <Link
              to={CREATOR_ROUTE}
              className="baraja-button baraja-button-primary"
              onClick={() => trackCreatorPath('playlist_section')}
            >
              Crear con mi playlist
            </Link>
          </div>
        </article>
        <article>
          <p className="baraja-kicker">El pack</p>
          <h2>Lo necesario para conducir la ronda.</h2>
          <p>
            El PDF deja listos los cartones, la hoja de control y las reglas
            para que puedas concentrarte en la música y en la mesa.
          </p>
          <div className="baraja-final-points">
            <span>PDF para imprimir</span>
            <span>Hoja de control</span>
            <span>Reglas y guía de dinámica</span>
          </div>
        </article>
      </section>

      <section className="baraja-campaign-section baraja-campaign-faq" id="preguntas">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Preguntas prácticas</p>
          <h2>Antes de abrir el creador.</h2>
        </div>
        <div className="baraja-campaign-faq-list">
          <details open>
            <summary>¿Qué incluye el pack?</summary>
            <p>Cartones únicos en PDF, hoja de control, reglas y guía para llevar la dinámica.</p>
          </details>
          <details>
            <summary>¿Necesito una playlist de Spotify?</summary>
            <p>
              Para cobrar online con playlist propia necesitamos una URL pública y recuperable. Las
              colecciones Baraja ya vienen listas para revisar.
            </p>
          </details>
          <details>
            <summary>¿La música y la impresión están incluidas?</summary>
            <p>
              No. Baraja vende el juego y sus materiales; quien organiza aporta la reproducción,
              impresión y permisos que correspondan.
            </p>
          </details>
          <details>
            <summary>¿Es para un bar, equipo o evento comercial?</summary>
            <p>Ese alcance se conversa antes de producir para definir condiciones y dinámica.</p>
          </details>
        </div>
      </section>

      <section className="baraja-campaign-section baraja-campaign-support" aria-labelledby="baraja-support-title">
        <div>
          <p className="baraja-kicker">Fuera de autoservicio</p>
          <h2 id="baraja-support-title">¿Necesitás algo para un equipo, bar o evento?</h2>
          <p>
            Para una dinámica comercial, una cantidad especial de cartones o un formato acompañado,
            definimos el alcance antes de armarlo.
          </p>
        </div>
        <a
          href={getBarajaInquiryHref(buildOfferingMessage(MUSIC_BINGO_BAR_EVENT_OFFERING))}
          className="baraja-button baraja-button-outline"
          onClick={() => {
            trackCampaignAction(
              MUSIC_BINGO_BAR_EVENT_OFFERING.id,
              MUSIC_BINGO_BAR_EVENT_OFFERING.analyticsOfferType,
              'support_commercial_event'
            );
            trackInquiry(
              MUSIC_BINGO_BAR_EVENT_OFFERING.id,
              MUSIC_BINGO_BAR_EVENT_OFFERING.analyticsOfferType,
              'support_commercial_event'
            );
          }}
        >
          Consultar por WhatsApp
        </a>
      </section>

      <section className="baraja-custom-section baraja-custom-legal-note baraja-music-legal-note">
        <strong>Nota sobre música e impresión</strong>
        <p>{MUSIC_BINGO_PRODUCT.legal.summary}</p>
      </section>

      <footer className="baraja-footer">
        <Link to="/" className="baraja-brand">Baraja</Link>
        <span>© 2026 Baraja · Bingo musical imprimible</span>
        <div>
          <Link to={CREATOR_ROUTE}>Creador</Link>
          <Link to={CATALOG_ROUTE}>Colecciones</Link>
          <Link to="/mazos-personalizados">Juegos a medida</Link>
          <Link to="/">Institucional</Link>
        </div>
      </footer>
    </main>
  );
}

function MusicBingoNav() {
  return (
    <nav className="baraja-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#colecciones">Colecciones</a>
        <a href="#playlist">Tu playlist</a>
        <Link
          to={CREATOR_ROUTE}
          className="baraja-nav-cta"
          onClick={() => trackCreatorPath('nav_creator')}
        >
          Crear bingo
        </Link>
      </div>
    </nav>
  );
}

function MusicBingoPreview() {
  const cells = [
    'De musica ligera',
    'Ji ji ji',
    'Persiana americana',
    'Demoliendo hoteles',
    'Mariposa technicolor',
    'Luna de miel',
    'Mil horas',
    'Corazon delator',
    'Cazador',
    'Preso en mi ciudad',
    'Hombres al borde',
    'Siete noches',
    'LIBRE',
    'Fue amor',
    'Tren al sur',
    'Tratame suavemente',
    'Signos',
    'Te para tres',
    'Jugo de tomate',
    'Nada personal',
    'Cementerio club',
    'El idolo',
    'Himno de mi corazon',
    'Lunes por la madrugada',
    'Final sorpresa',
  ];

  return (
    <div className="baraja-music-bingo-preview" aria-label="Vista previa de bingo musical imprimible">
      <div className="baraja-music-creator-mini">
        <div>
          <span>Nombre del juego</span>
          <strong>Noche Rock Argentino</strong>
        </div>
        <div>
          <span>Cartones</span>
          <strong>30 únicos</strong>
        </div>
        <div>
          <span>Playlist</span>
          <strong>Rock nacional</strong>
        </div>
        <div>
          <span>Formato</span>
          <strong>5 x 5</strong>
        </div>
      </div>
      <div className="baraja-music-bingo-sheet">
        <div className="baraja-music-bingo-sheet-head">
          <span>PDF imprimible</span>
          <strong>Bingo Musical</strong>
          <small>30 cartones únicos + guía</small>
        </div>
        <div className="baraja-music-bingo-grid">
          {cells.map((cell) => (
            <span key={cell} className={cell === 'LIBRE' ? 'is-free' : undefined}>
              {cell}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
