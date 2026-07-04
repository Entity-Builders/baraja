import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MUSIC_BINGO_BAR_EVENT_OFFERING,
  MUSIC_BINGO_CAMPAIGN_LANDING,
  MUSIC_BINGO_CUSTOM_OFFERING,
  MUSIC_BINGO_PREBUILT_OFFERINGS,
  MUSIC_BINGO_PRODUCT,
  type ProductOffering,
} from '@eb-packages/deck-engine';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

const CAMPAIGN_ID = MUSIC_BINGO_CAMPAIGN_LANDING.id;
const PREBUILT_BINGOS = MUSIC_BINGO_PREBUILT_OFFERINGS;
const CREATOR_ROUTE = '/bingo-musical/crear';
const CREATOR_OFFER_ID = `${MUSIC_BINGO_PRODUCT.id}_creator`;
const CREATOR_OFFER_TYPE = 'music_bingo_creator';

function buildOfferingMessage(offer: ProductOffering): string {
  return offer.messageLines.join('\n');
}

function buildCustomMessage(): string {
  return buildOfferingMessage(MUSIC_BINGO_CUSTOM_OFFERING);
}

function buildBarMessage(): string {
  return buildOfferingMessage(MUSIC_BINGO_BAR_EVENT_OFFERING);
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

function trackCreatorPath(source: string) {
  trackCampaignAction(CREATOR_OFFER_ID, CREATOR_OFFER_TYPE, source);
}

function trackInquiry(offerId: string, offerType: string) {
  trackBarajaEvent('baraja_inquiry_started', {
    campaign_id: CAMPAIGN_ID,
    cta_id: `${CAMPAIGN_ID}_${offerId}`,
    cta_kind: 'whatsapp',
    href_type: 'wa_me',
    offer_id: offerId,
    offer_type: offerType,
    source: 'music_bingo_landing',
    surface: 'music_bingo_landing',
  });
}

export default function MusicBingoLanding() {
  useEffect(() => {
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
            Tene tu <span>noche lista</span> para jugar.
          </h1>
          <p className="baraja-lead">
            Pega una playlist de Spotify, elegi cartones y formato desde el
            nuevo creador. Baraja arma un pack imprimible con cartones unicos,
            hoja de control y guia; vos imprimis y pones la musica.
          </p>
          <div className="baraja-actions">
            <Link
              to={CREATOR_ROUTE}
              className="baraja-button baraja-button-primary"
              onClick={() => trackCreatorPath('hero_creator')}
            >
              Armar mi bingo
            </Link>
            <a href="#prearmados" className="baraja-button baraja-button-outline">
              Ver colecciones
            </a>
          </div>
          <div className="baraja-hero-pill-row">
            <span>PDF listo para imprimir</span>
            <span>Cartones unicos</span>
            <span>Guia del anfitrion</span>
            <span>QR opcional</span>
          </div>
        </div>
        <MusicBingoPreview />
      </section>

      <section className="baraja-campaign-section baraja-creator-bridge" aria-labelledby="baraja-creator-bridge-title">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Nuevo creador</p>
          <h2 id="baraja-creator-bridge-title">Del tema al PDF, sin salir del creador.</h2>
          <p>
            Probalo con una coleccion Baraja, pega tu playlist o carga canciones
            a mano. El creador muestra el preview, prepara el imprimible y deja
            el contexto listo si queres pedir ayuda por WhatsApp.
          </p>
        </div>
        <div className="baraja-creator-bridge-grid" aria-label="Pasos rapidos para crear un bingo musical">
          <article>
            <span>1</span>
            <h3>Elegi repertorio</h3>
            <p>Catalogo curado, playlist publica de Spotify o canciones pegadas.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Ajusta cartones</h3>
            <p>Defini cantidad, formato, casillero libre y variantes de juego.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Revisa preview</h3>
            <p>Abris el pack imprimible o pedis ayuda por WhatsApp con el brief armado.</p>
          </article>
        </div>
        <div className="baraja-creator-bridge-actions">
          <Link
            to={CREATOR_ROUTE}
            className="baraja-button baraja-button-primary"
            onClick={() => trackCreatorPath('creator_bridge')}
          >
            Probar creador
          </Link>
          <a href="#prearmados" className="baraja-button baraja-button-outline">
            Mirar colecciones
          </a>
        </div>
      </section>

      <section className="baraja-campaign-section" id="prearmados">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Colecciones armadas</p>
          <h2>Elegis una coleccion o la usas de punto de partida.</h2>
          <p>
            Partimos de repertorios curados para resolver rapido una noche.
            Podes pedirlos directo o usarlos como referencia para armar tu pack
            en el creador. No incluyen musica, impresion fisica ni derechos de
            reproduccion.
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
                  to={CREATOR_ROUTE}
                  className="baraja-button baraja-button-primary"
                  onClick={() => trackCreatorPath(`offer_${offer.id}`)}
                >
                  Armar en creador
                </Link>
                <a
                  href={getBarajaInquiryHref(buildOfferingMessage(offer))}
                  className="baraja-button baraja-button-outline"
                  onClick={() => {
                    trackCampaignAction(offer.id, offer.analyticsOfferType, 'offer_card');
                    trackInquiry(offer.id, offer.analyticsOfferType);
                  }}
                >
                  Pedir por WhatsApp
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="baraja-campaign-section baraja-campaign-paths" id="personalizado">
        <article>
          <p className="baraja-kicker">Personalizado</p>
          <h2>Trae tus canciones o tu tematica.</h2>
          <p>
            Para cumples, casamientos, despedidas, equipos o clases. Lo armamos
            con tu lista, tono y cantidad aproximada de personas.
          </p>
          <div className="baraja-final-points">
            <span>Lista propia o sugerida</span>
            <span>Cartones a medida</span>
            <span>Guia de dinamica</span>
          </div>
          <div className="baraja-campaign-inline-actions">
            <Link
              to={CREATOR_ROUTE}
              className="baraja-button baraja-button-primary"
              onClick={() => trackCreatorPath('custom_section_creator')}
            >
              Crear con mi playlist
            </Link>
            <a
              href={getBarajaInquiryHref(buildCustomMessage())}
              className="baraja-button baraja-button-outline"
              onClick={() => {
                trackCampaignAction(
                  MUSIC_BINGO_CUSTOM_OFFERING.id,
                  MUSIC_BINGO_CUSTOM_OFFERING.analyticsOfferType,
                  'custom_section'
                );
                trackInquiry(MUSIC_BINGO_CUSTOM_OFFERING.id, MUSIC_BINGO_CUSTOM_OFFERING.analyticsOfferType);
              }}
            >
              Pedir personalizado
            </a>
          </div>
        </article>
        <article>
          <p className="baraja-kicker">Bares y eventos</p>
          <h2>Pack para bar, equipo o evento.</h2>
          <p>
            Para bares, peñas, torneos o eventos comerciales lo tratamos como
            consulta. Definimos alcance, uso, dinamica y condiciones antes de
            producir.
          </p>
          <div className="baraja-final-points">
            <span>Alcance consultivo</span>
            <span>Materiales listos</span>
            <span>Musica a cargo del organizador</span>
          </div>
          <a
            href={getBarajaInquiryHref(buildBarMessage())}
            className="baraja-button baraja-button-primary"
            onClick={() => {
              trackCampaignAction(
                MUSIC_BINGO_BAR_EVENT_OFFERING.id,
                MUSIC_BINGO_BAR_EVENT_OFFERING.analyticsOfferType,
                'bar_section'
              );
              trackInquiry(MUSIC_BINGO_BAR_EVENT_OFFERING.id, MUSIC_BINGO_BAR_EVENT_OFFERING.analyticsOfferType);
            }}
          >
            Consultar evento
          </a>
        </article>
      </section>

      <section className="baraja-campaign-section baraja-campaign-steps">
        <div className="baraja-section-header baraja-section-header-centered">
          <p className="baraja-kicker">Como funciona</p>
          <h2>Creas, revisas, imprimis y jugas.</h2>
        </div>
        <div className="baraja-campaign-step-grid">
          <article>
            <span>1</span>
            <h3>Armas el bingo</h3>
            <p>Elegis catalogo, playlist propia o tema personalizado.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Revisas el preview</h3>
            <p>Confirmas canciones, cartones, formato y hoja de control.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Recibis el PDF</h3>
            <p>Imprimis el pack o pedis asistencia con el contexto ya armado.</p>
          </article>
        </div>
      </section>

      <section className="baraja-custom-section baraja-custom-legal-note baraja-music-legal-note">
        <strong>Nota sobre musica e impresion</strong>
        <p>{MUSIC_BINGO_PRODUCT.legal.summary}</p>
      </section>

      <footer className="baraja-footer">
        <Link to="/" className="baraja-brand">Baraja</Link>
        <span>© 2026 Baraja · Bingo musical imprimible</span>
        <div>
          <Link to={CREATOR_ROUTE}>Creador</Link>
          <a href="#prearmados">Colecciones</a>
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
        <a href="#prearmados">Colecciones</a>
        <Link to={CREATOR_ROUTE} onClick={() => trackCreatorPath('nav_creator')}>
          Creador
        </Link>
        <a href="#personalizado">Personalizado</a>
        <a href={getBarajaInquiryHref(buildBarMessage())}>Bares</a>
        <Link
          to={CREATOR_ROUTE}
          className="baraja-nav-cta"
          onClick={() => trackCreatorPath('nav_cta')}
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
          <strong>30 unicos</strong>
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
          <small>30 cartones unicos + guia</small>
        </div>
        <div className="baraja-music-bingo-grid">
          {cells.map((cell) => (
            <span key={cell} className={cell === 'LIBRE' ? 'is-free' : undefined}>
              {cell}
            </span>
          ))}
        </div>
      </div>
      <div className="baraja-music-bingo-guide">
        <span>Guia de dinamica</span>
        <strong>Preparar, cantar, marcar, desempatar.</strong>
        <small>Incluye variantes para equipos, premios y cierre.</small>
      </div>
    </div>
  );
}
