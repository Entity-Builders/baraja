import { Link } from 'react-router-dom';
import { trackBarajaEvent } from '../../../services/analytics';

const BINGO_CELLS = [
  'De música ligera', 'Claridad', 'Persiana americana', 'Ruta 40', 'Los chicos',
  'La puerta', 'Ji ji ji', 'Mil horas', 'Signos', 'Cruces',
  'Tratame suavemente', 'Luna', 'Libre', 'Corazón delator', 'Hasta que ponga el sol',
  'Yo caníbal', 'Betty boop', 'La excepción', 'Durazno sangrando', 'En la ciudad',
  'La rubia tarada', 'Barro tal vez', 'Tren al sur', 'Fue amor', 'Mariposa',
];

const HERO_PROOFS = [
  {
    icon: 'file',
    title: 'PDF listo para imprimir',
    text: 'Descarga e imprimí en casa',
  },
  {
    icon: 'people',
    title: 'Para todas las ocasiones',
    text: 'Reuniones, aulas, eventos y más',
  },
  {
    icon: 'shield',
    title: 'Reglas claras y guía',
    text: 'Todo lo que necesitás para jugar',
  },
] as const;

export function DigitalDeckHero() {
  return (
    <section className="baraja-hero">
      <div className="baraja-hero-copy">
        <p className="baraja-kicker baraja-hero-kicker">Editorial de imprimibles jugables</p>
        <h1>Juegos para imprimir y jugar hoy</h1>
        <p className="baraja-lead">
          Cartas, bingos musicales y juegos a medida con PDF listo,
          reglas claras y guía para llevar a la mesa.
        </p>
        <div className="baraja-actions baraja-hero-actions">
          <a href="#imprimibles" className="baraja-button baraja-button-primary">Ver catálogo</a>
          <Link
            to="/mazos-personalizados"
            className="baraja-button baraja-button-outline"
            onClick={() => trackBarajaEvent('baraja_offer_cta_clicked', {
              campaign_id: 'custom_games',
              cta_id: 'hero_custom_game',
              offer_id: 'custom_games',
              offer_type: 'custom_printable_game',
              source: 'home_hero',
              surface: 'landing',
            })}
          >
            Armar mi juego
          </Link>
        </div>
        <div className="baraja-hero-proof-row" aria-label="Beneficios principales">
          {HERO_PROOFS.map((proof) => (
            <div className="baraja-hero-proof" key={proof.title}>
              <span className={`baraja-line-icon baraja-line-icon--${proof.icon}`} aria-hidden="true" />
              <div>
                <strong>{proof.title}</strong>
                <small>{proof.text}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <HeroProductPreview />
    </section>
  );
}

function HeroProductPreview() {
  return (
    <div
      className="baraja-hero-product-preview"
      aria-label="Bingo musical, guía de juego y cartas imprimibles de Baraja"
    >
      <div className="baraja-hero-folder" aria-hidden="true" />
      <div className="baraja-hero-bingo-document" aria-hidden="true">
        <div className="baraja-hero-bingo-head">
          <span className="baraja-hero-bingo-wave" />
          <div>
            <strong>Bingo musical</strong>
            <small>Rock nacional 90s</small>
          </div>
        </div>
        <div className="baraja-hero-bingo-grid">
          {BINGO_CELLS.map((cell) => (
            <span className={cell === 'Libre' ? 'is-free' : ''} key={cell}>
              {cell === 'Libre' ? <i aria-hidden="true" /> : cell}
            </span>
          ))}
        </div>
        <em>www.baraja.cards</em>
      </div>
      <div className="baraja-hero-tablet" aria-hidden="true">
        <div className="baraja-hero-tablet-bar">
          <span>Bingo Musical - Guía.pdf</span>
          <small>100%</small>
        </div>
        <div className="baraja-hero-guide-page">
          <strong>Guía para jugar</strong>
          <span>Preparación</span>
          <p>Tenés todo listo para imprimir, explicar la dinámica y empezar.</p>
          <span>Cómo se juega</span>
          <ol>
            <li>Elegir un anfitrión.</li>
            <li>Escuchar la playlist.</li>
            <li>Marcar las canciones.</li>
          </ol>
          <span>Premios</span>
          <p>Una variante simple para reuniones, aulas y eventos.</p>
        </div>
        <div className="baraja-hero-tablet-footer">
          <strong>Baraja</strong>
          <small>Editorial de imprimibles jugables</small>
        </div>
      </div>
      <div className="baraja-hero-red-deck" aria-hidden="true">
        <span>Baraja</span>
      </div>
      <div className="baraja-hero-question-card" aria-hidden="true">
        <span>Nombrá algo que siempre te da energía cuando más lo necesitás.</span>
        <small>Conecta</small>
        <strong>Baraja</strong>
      </div>
    </div>
  );
}
