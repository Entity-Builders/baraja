import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  MUSIC_BINGO_DEMO_BOARD,
  MUSIC_BINGO_DEMO_COMPANION,
  MUSIC_BINGO_DEMO_EDITION,
  MUSIC_BINGO_DEMO_OFFERING,
  MUSIC_BINGO_DEMO_PRINTABLE_PACK,
  MUSIC_BINGO_DEMO_SONGS,
  MUSIC_BINGO_PRODUCT,
  type MusicBingoCell,
} from '@eb-packages/deck-engine';
import { getBarajaInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

const DEMO_CAMPAIGN_ID = 'music_bingo_demo';
const PLAYER_PATH = MUSIC_BINGO_DEMO_COMPANION.route;
const DEMO_EVENT = MUSIC_BINGO_DEMO_EDITION.eventContext;
const DEMO_VENUE_NAME = DEMO_EVENT?.venueName ?? 'Bar demo';
const DEMO_EVENT_NAME = DEMO_EVENT?.eventName ?? MUSIC_BINGO_DEMO_EDITION.title;
const DEMO_VENUE_ID = DEMO_EVENT?.venueId ?? MUSIC_BINGO_DEMO_EDITION.id;
const DEMO_GUIDE_STEPS = MUSIC_BINGO_DEMO_EDITION.content?.musicBingo?.guideSteps ?? [];
const DEMO_DELIVERABLES = [
  ...MUSIC_BINGO_DEMO_PRINTABLE_PACK.assets.map((asset) => asset.title),
  MUSIC_BINGO_DEMO_COMPANION.title,
];

function getPlayerUrl(): string {
  return `${window.location.origin}${PLAYER_PATH}`;
}

function trackDemoView(route: string, surface: string) {
  trackBarajaEvent('baraja_campaign_landing_viewed', {
    campaign_id: DEMO_CAMPAIGN_ID,
    offer_id: MUSIC_BINGO_DEMO_OFFERING.id,
    offer_type: 'music_bingo_demo',
    route,
    surface,
    venue_id: DEMO_VENUE_ID,
  });
}

function buildVenueInquiryMessage(): string {
  return MUSIC_BINGO_DEMO_OFFERING.messageLines.join('\n');
}

function getMarkedCount(markedCells: Set<string>): number {
  return markedCells.size;
}

function hasPossibleBingo(markedCells: Set<string>): boolean {
  const lines = [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  return lines.some((line) => line.every((index) => {
    const cell = MUSIC_BINGO_DEMO_BOARD[index];
    return cell ? markedCells.has(cell.id) : false;
  }));
}

export default function MusicBingoDemo() {
  const playerUrl = useMemo(() => getPlayerUrl(), []);

  useEffect(() => {
    trackDemoView('/bingo-musical/demo-bar', 'music_bingo_demo_venue');
  }, []);

  return (
    <main className="baraja-landing baraja-campaign">
      <DemoNav />
      <section className="baraja-demo-hero">
        <div className="baraja-demo-hero-copy">
          <p className="baraja-kicker">Muestra real</p>
          <h1>{DEMO_EVENT_NAME} para {DEMO_VENUE_NAME}.</h1>
          <p className="baraja-lead">{MUSIC_BINGO_DEMO_EDITION.summary}</p>
          <div className="baraja-actions">
            <Link to={PLAYER_PATH} className="baraja-button baraja-button-primary">
              Abrir carton digital
            </Link>
            <a
              href={getBarajaInquiryHref(buildVenueInquiryMessage())}
              className="baraja-button baraja-button-outline"
              onClick={() => {
                trackBarajaEvent('baraja_offer_cta_clicked', {
                  campaign_id: DEMO_CAMPAIGN_ID,
                  cta_id: 'demo_bar_inquiry',
                  offer_id: MUSIC_BINGO_DEMO_OFFERING.id,
                  offer_type: MUSIC_BINGO_DEMO_OFFERING.analyticsOfferType,
                  source: 'demo_venue_hero',
                  surface: 'music_bingo_demo_venue',
                  venue_id: DEMO_VENUE_ID,
                });
              }}
            >
              Consultar para mi bar
            </a>
          </div>
          <div className="baraja-hero-pill-row">
            <span>{DEMO_EVENT?.duration ?? 'Demo local'}</span>
            <span>{DEMO_EVENT?.audience ?? MUSIC_BINGO_DEMO_EDITION.audience}</span>
            <span>QR digital demo</span>
          </div>
        </div>
        <section className="baraja-demo-qr-panel" aria-label="QR al carton digital demo">
          <div className="baraja-demo-qr">
            <QRCodeSVG value={playerUrl} size={180} level="M" />
          </div>
          <p>Escanea para abrir el carton digital asociado al establecimiento.</p>
          <small>{playerUrl}</small>
        </section>
      </section>

      <section className="baraja-campaign-section baraja-demo-kit">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Kit de muestra</p>
          <h2>Lo que recibiria el establecimiento.</h2>
          <p>
            Esta demo muestra el paquete como experiencia: imprimible para la
            mesa, QR digital y guia para conducir. No hay backend de bares ni
            musica incluida en esta etapa.
          </p>
        </div>
        <div className="baraja-demo-kit-grid">
          <article>
            <h3>Imprimibles</h3>
            <ul>
              {DEMO_DELIVERABLES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article>
            <h3>Guia de dinamica</h3>
            <ol>
              {DEMO_GUIDE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
          <article>
            <h3>Lista sugerida</h3>
            <div className="baraja-demo-song-column">
              {MUSIC_BINGO_DEMO_SONGS.slice(0, 10).map((song) => (
                <span key={song.id}>{song.title} · {song.artist}</span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="baraja-campaign-section baraja-demo-board-preview">
        <div>
          <p className="baraja-kicker">Vista del jugador</p>
          <h2>El QR abre un carton digital simple.</h2>
          <p>
            Para una muestra alcanza con estado local: la persona marca
            canciones en su telefono. Si esto vende, despues se decide si hace
            falta persistencia por mesa, ranking o panel de conductor.
          </p>
        </div>
        <DigitalBingoCard mode="preview" />
      </section>

      <section className="baraja-custom-section baraja-custom-legal-note">
        <div>
          <p className="baraja-kicker">Limite del demo</p>
          <h2>{MUSIC_BINGO_PRODUCT.legal.summary}</h2>
        </div>
        <p>
          La asociacion con establecimiento en esta muestra es estatica. No
          promete dashboard de bares, estado compartido entre jugadores, hosting
          en vivo ni reproduccion automatica de musica.
        </p>
      </section>
    </main>
  );
}

export function MusicBingoPlayerDemo() {
  const [markedCells, setMarkedCells] = useState(() => new Set(['cell-free']));
  const markedCount = getMarkedCount(markedCells);
  const hasBingo = hasPossibleBingo(markedCells);

  useEffect(() => {
    trackDemoView(PLAYER_PATH, 'music_bingo_demo_player');
  }, []);

  function toggleCell(cell: MusicBingoCell) {
    if (cell.free) {
      return;
    }

    setMarkedCells((current) => {
      const next = new Set(current);

      if (next.has(cell.id)) {
        next.delete(cell.id);
      } else {
        next.add(cell.id);
      }

      trackBarajaEvent('baraja_music_bingo_card_marked', {
        campaign_id: DEMO_CAMPAIGN_ID,
        card_id: cell.id,
        marked_count: next.size,
        offer_id: MUSIC_BINGO_DEMO_OFFERING.id,
        offer_type: 'music_bingo_demo',
        source: 'player_card',
        surface: 'music_bingo_demo_player',
        venue_id: DEMO_VENUE_ID,
      });

      return next;
    });
  }

  return (
    <main className="baraja-landing baraja-player-demo">
      <section className="baraja-player-shell">
        <div className="baraja-player-header">
          <Link to="/bingo-musical/demo-bar" className="baraja-brand">Baraja</Link>
          <div>
            <p className="baraja-kicker">{DEMO_VENUE_NAME}</p>
            <h1>{DEMO_EVENT_NAME}</h1>
            <span>{markedCount}/25 marcados</span>
          </div>
        </div>

        <DigitalBingoCard
          markedCells={markedCells}
          mode="interactive"
          onToggle={toggleCell}
        />

        <div className="baraja-player-status" data-bingo={hasBingo}>
          <strong>{hasBingo ? 'Tenes linea posible.' : 'Marca canciones cuando las reconozcas.'}</strong>
          <p>
            Demo local: no guarda datos personales ni sincroniza mesas. El
            conductor valida el bingo segun la dinamica del evento.
          </p>
          <button
            className="baraja-button baraja-button-outline"
            type="button"
            onClick={() => setMarkedCells(new Set(['cell-free']))}
          >
            Reiniciar carton
          </button>
        </div>
      </section>
    </main>
  );
}

function DemoNav() {
  return (
    <nav className="baraja-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <Link to="/bingo-musical">Bingo musical</Link>
        <Link to={PLAYER_PATH}>Carton digital</Link>
        <Link to="/mazos-personalizados">Juegos a medida</Link>
        <Link to="/" className="baraja-nav-cta">Institucional</Link>
      </div>
    </nav>
  );
}

function DigitalBingoCard({
  markedCells = new Set(['cell-free']),
  mode,
  onToggle,
}: {
  markedCells?: Set<string>;
  mode: 'interactive' | 'preview';
  onToggle?: (cell: MusicBingoCell) => void;
}) {
  return (
    <div className={`baraja-digital-bingo-card baraja-digital-bingo-card--${mode}`}>
      <div className="baraja-digital-bingo-title">
        <span>BINGO</span>
        <strong>{DEMO_VENUE_NAME}</strong>
      </div>
      <div className="baraja-digital-bingo-grid">
        {MUSIC_BINGO_DEMO_BOARD.map((cell) => {
          const isMarked = markedCells.has(cell.id);

          return (
            <button
              aria-label={`${mode === 'interactive' ? 'Marcar' : 'Casillero'} ${cell.label}, ${cell.hint}`}
              aria-pressed={isMarked}
              className={isMarked ? 'baraja-digital-bingo-cell--marked' : ''}
              disabled={mode === 'preview'}
              key={cell.id}
              type="button"
              onClick={() => onToggle?.(cell)}
            >
              <strong>{cell.label}</strong>
              <span>{cell.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
