import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MUSIC_BINGO_BAR_EVENT_OFFERING,
  MUSIC_BINGO_CAMPAIGN_LANDING,
  MUSIC_BINGO_MVP_THEMES,
  MUSIC_BINGO_PRODUCT,
  getMusicBingoSelfServePriceQuote,
  type ProductOffering,
} from '@eb-packages/deck-engine';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';
import {
  fetchSyncedMusicBingoCatalog,
  type SyncedMusicBingoCatalogCollection,
} from './musicBingoCatalogApi';

const CAMPAIGN_ID = MUSIC_BINGO_CAMPAIGN_LANDING.id;
const CREATOR_ROUTE = '/bingo-musical/crear';
const PLAYLIST_CREATOR_ROUTE = `${CREATOR_ROUTE}?entry=playlist`;
const CATALOG_ROUTE = '/bingo-musical/catalogo';
const CREATOR_OFFER_ID = `${MUSIC_BINGO_PRODUCT.id}_creator`;
const CREATOR_OFFER_TYPE = 'music_bingo_creator';
const LANDING_TITLE = 'Bingo musical para imprimir en tu fiesta | Baraja';
const LANDING_DESCRIPTION =
  'Elegí un tema o usá tu playlist y recibí un bingo musical listo para imprimir y jugar.';
const LANDING_URL = 'https://baraja.cards/bingo-musical';
const PLAYLIST_STARTING_PRICE = getMusicBingoSelfServePriceQuote(15, 'playlist_own');

interface HeroCollection {
  id: string;
  title: string;
  categoryLabel: string;
  songCount: number;
  coverImageUrl: string | null;
  creatorUrl: string;
}

const FALLBACK_HERO_COLLECTIONS: HeroCollection[] = MUSIC_BINGO_MVP_THEMES.map((theme) => ({
  id: theme.id,
  title: theme.title,
  categoryLabel: theme.catalog.categoryLabel,
  songCount: theme.songs.length,
  coverImageUrl: theme.playlist?.coverImageUrl ?? theme.songs[0]?.artworkUrl ?? null,
  creatorUrl: `${CREATOR_ROUTE}?entry=collection&tema=${encodeURIComponent(theme.id)}`,
}));

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

function syncedCollectionToHeroCollection(
  collection: SyncedMusicBingoCatalogCollection
): HeroCollection {
  return {
    id: collection.id,
    title: collection.title,
    categoryLabel: collection.categoryLabel,
    songCount: collection.songCount,
    coverImageUrl: collection.coverImageUrl ?? collection.tracks[0]?.imageUrl ?? null,
    creatorUrl: `${CREATOR_ROUTE}?entry=collection&catalogCollectionId=${encodeURIComponent(collection.id)}`,
  };
}

export default function MusicBingoLanding() {
  const [heroCollections, setHeroCollections] = useState<HeroCollection[]>(FALLBACK_HERO_COLLECTIONS);
  const collectionCarouselRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const controller = new AbortController();

    void fetchSyncedMusicBingoCatalog(controller.signal)
      .then((collections) => {
        if (!controller.signal.aborted && collections.length > 0) {
          setHeroCollections(collections.map(syncedCollectionToHeroCollection));
        }
      })
      .catch(() => {
        // Keep the built-in playlists available if the catalog cannot be reached.
      });

    return () => controller.abort();
  }, []);

  function scrollCollections(direction: -1 | 1) {
    collectionCarouselRef.current?.scrollBy({
      left: direction * 292,
      behavior: 'smooth',
    });
  }

  return (
    <main className="baraja-landing baraja-campaign">
      <MusicBingoNav />
      <section className="baraja-campaign-hero">
        <div className="baraja-campaign-hero-copy">
          <p className="baraja-kicker">Bingo musical</p>
          <h1>
            Elegí una colección <span>o usá tu playlist.</span>
          </h1>
          <p className="baraja-lead">
            Las playlists Baraja se acomodan a la cantidad de cartones que elijas para que el
            juego sea fluido, rápido y quede listo para usar.
          </p>

          <section className="baraja-hero-collections" id="colecciones" aria-label="Colecciones Baraja">
            <div className="baraja-hero-collections-heading">
              <div className="baraja-hero-collections-controls" aria-label="Mover colecciones">
                <button
                  type="button"
                  aria-label="Ver colecciones anteriores"
                  title="Ver colecciones anteriores"
                  onClick={() => scrollCollections(-1)}
                >
                  &larr;
                </button>
                <button
                  type="button"
                  aria-label="Ver más colecciones"
                  title="Ver más colecciones"
                  onClick={() => scrollCollections(1)}
                >
                  &rarr;
                </button>
              </div>
            </div>
            <div className="baraja-hero-collections-track" ref={collectionCarouselRef}>
              {heroCollections.map((collection) => (
                <Link
                  key={collection.id}
                  to={collection.creatorUrl}
                  className="baraja-hero-collection-card"
                  onClick={() =>
                    trackCreatorPath(
                      'hero_collection_carousel',
                      collection.id,
                      'curated_music_bingo_collection'
                    )
                  }
                >
                  <div className="baraja-hero-collection-image">
                    {collection.coverImageUrl ? (
                      <img src={collection.coverImageUrl} alt="" />
                    ) : null}
                    <span>{collection.categoryLabel}</span>
                  </div>
                  <div>
                    <strong>{collection.title}</strong>
                    <small>{collection.songCount} canciones</small>
                    <b>Elegir esta colección</b>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="baraja-campaign-hero-playlist-path">
            <p>¿Ya tenés una playlist?</p>
            <Link
              to={PLAYLIST_CREATOR_ROUTE}
              className="baraja-button baraja-button-outline"
              onClick={() => trackCreatorPath('hero_playlist')}
            >
              Crear con mi playlist
            </Link>
          </div>
        </div>
        <MusicBingoPreview />
      </section>

      <section className="baraja-campaign-section baraja-campaign-steps" id="como-funciona">
        <div className="baraja-section-header baraja-section-header-centered">
          <p className="baraja-kicker">Cómo funciona</p>
          <h2>Un juego listo para imprimir.</h2>
        </div>
        <div className="baraja-campaign-step-grid" aria-label="Pasos para jugar al bingo musical">
          <article>
            <span>1</span>
            <h3>Elegí la música</h3>
            <p>Elegí una colección Baraja o usá tu playlist.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Mirá tu bingo</h3>
            <p>Antes de pagar, ves cómo queda el PDF con tus cartones.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Pagá e imprimí</h3>
            <p>Con el pago confirmado recibís el juego listo para conducir la ronda.</p>
          </article>
        </div>
      </section>

      <section className="baraja-campaign-section baraja-campaign-paths" id="playlist">
        <article>
          <p className="baraja-kicker">Con tu música</p>
          <h2>Tu playlist, una ronda lista.</h2>
          <p>
            Usá una playlist pública y accesible de Spotify para preparar el juego.
          </p>
          <div className="baraja-final-points">
            <span>Elegís cuántos cartones</span>
            <span>Ves cómo queda antes de pagar</span>
            <span>Desde {PLAYLIST_STARTING_PRICE?.label ?? 'consultar'} por 15 cartones</span>
          </div>
          <div className="baraja-campaign-inline-actions">
            <Link
              to={PLAYLIST_CREATOR_ROUTE}
              className="baraja-button baraja-button-primary"
              onClick={() => trackCreatorPath('playlist_section')}
            >
              Usar mi playlist
            </Link>
          </div>
        </article>
        <article>
          <p className="baraja-kicker">Qué recibís</p>
          <h2>Un juego listo para imprimir.</h2>
          <p>
            Cartones únicos, control de canciones, reglas y una guía breve para conducir la ronda.
          </p>
          <div className="baraja-final-points">
            <span>PDF listo para imprimir</span>
            <span>Control de canciones</span>
            <span>Reglas y guía de juego</span>
          </div>
        </article>
      </section>

      <section className="baraja-campaign-section baraja-campaign-faq" id="preguntas">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Antes de comprar</p>
          <h2>Lo que necesitás saber.</h2>
        </div>
        <div className="baraja-campaign-faq-list">
          <details open>
            <summary>¿Qué incluye el pack?</summary>
            <p>
              Cartones únicos en PDF, control de canciones, reglas y una guía para la ronda.
            </p>
          </details>
          <details>
            <summary>¿Puedo usar mi playlist?</summary>
            <p>
              Sí. Usá una playlist pública y accesible de Spotify. Las colecciones ya están listas.
            </p>
          </details>
          <details>
            <summary>¿La música y la impresión están incluidas?</summary>
            <p>
              No. La música, la impresión y los permisos que correspondan los resolvés vos; Baraja
              te entrega el juego y sus materiales.
            </p>
          </details>
          <details>
            <summary>¿Es para un bar, equipo o evento comercial?</summary>
            <p>Escribinos antes de comprar para ver el alcance de la ronda.</p>
          </details>
        </div>
      </section>

      <section className="baraja-campaign-section baraja-campaign-support" aria-labelledby="baraja-support-title">
        <div>
          <p className="baraja-kicker">Para grupos grandes y eventos</p>
          <h2 id="baraja-support-title">¿Es para un evento, bar o equipo?</h2>
          <p>Contanos cuánta gente participa y qué tipo de ronda querés armar.</p>
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
          Armar mi bingo
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
          <span>Tu bingo</span>
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
