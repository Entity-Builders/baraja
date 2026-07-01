import { EbWhatsAppButton } from '@eb-packages/ui-web';
import { useAllDecks } from '../hooks/useAllDecks';
import {
  getBarajaGeneralInquiryMessage,
  getBarajaInquiryHref,
} from '../lib/digitalDeckCatalog';

// ── Static Data (not from DB) ───────────────────────────────

const EDITIONS = [
  {
    emoji: '🧲',
    name: 'Cable a Tierra',
    slug: 'cable-a-tierra',
    badge: 'Primera Edición',
    desc: '30 cartas para los días que se sienten demasiado. Una por día. Sin app. Sin rutina.',
    cards: 30,
    available: true,
  },
  {
    emoji: '🎲',
    name: 'Trivia Night',
    slug: 'trivia-night',
    badge: 'Próximamente',
    desc: 'El mazo definitivo para las noches en grupo. 60 preguntas de cultura general, historia y curiosidades.',
    cards: 60,
    available: false,
  },
  {
    emoji: '💬',
    name: 'Entre Dos',
    slug: 'entre-dos',
    badge: 'Próximamente',
    desc: 'Preguntas para conversaciones reales. Para conocerse de verdad, más allá de la superficie.',
    cards: 52,
    available: false,
  },
];

const STEPS = [
  {
    n: 'I',
    title: 'Explorás la edición',
    desc: 'Cada mazo es una experiencia distinta. Regulación, trivia, conexión: identidad propia en cada uno.',
  },
  {
    n: 'II',
    title: 'Probás cartas digitales',
    desc: 'Mirás una muestra, entendés el tono y evaluás si la dinámica encaja con tu contexto.',
  },
  {
    n: 'III',
    title: 'Consultás acceso',
    desc: 'Si te sirve, nos escribís y coordinamos la mejor forma de usar esa baraja.',
  },
];

// ── Components ────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        Baraja<span>.cards</span>
      </div>
      <ul className="navbar-links">
        <li><a href="#ediciones">Ediciones</a></li>
        <li><a href="#como-funciona">Cómo funciona</a></li>
        <li><a href="#contacto">Contacto</a></li>
      </ul>
    </nav>
  );
}

function CardPreview({ card, index, totalCards }: { card: { id: string; front: { number: number; title: string }; back: { when_to_use: string; phrase: string; instruction: string }; tags?: string[] }; index: number; totalCards: number }) {
  return (
    <div className="card-3d" style={{ animationDelay: `${index * 0.15}s` }}>
      <div className="card-face card-front">
        <div className="card-face-label">
          {String(card.front.number).padStart(2, '0')} / {totalCards}
        </div>
        <div>
          <div className="card-face-title">{card.front.title}</div>
        </div>
      </div>
      <div className="card-face card-back">
        <div className="card-face-action">{card.back.when_to_use}</div>
        <div className="card-face-quote">"{card.back.phrase}"</div>
        <div className="card-face-exercise">{card.back.instruction}</div>
        {card.tags && card.tags.length > 0 && (
          <div className="ec-tags">
            {card.tags.map((tag) => (
              <span key={tag} className="ec-tag">{tag}</span>
            ))}
          </div>
        )}
        <div className="card-face-author">Cable a Tierra · Baraja</div>
      </div>
    </div>
  );
}

function Hero() {
  const { decks, loading } = useAllDecks();
  const cableATierra = decks.find(d => d.id === 'cable-a-tierra');
  const sampleCards = cableATierra ? cableATierra.deck.cards.slice(0, 3) : [];
  const totalCards = cableATierra ? cableATierra.deck.card_count : 30;

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <p className="hero-eyebrow fade-up">La Fábrica de Cartas · Baraja.cards</p>
        <h1 className="fade-up fade-up-delay-1">
          Sabiduría que<br /><em>podés sostener</em>
        </h1>
        <p className="hero-tagline fade-up fade-up-delay-2">
          Mazos digitales con PDF imprimible opcional.
          Cada edición con su propia identidad, su propio mundo.
        </p>
        <div className="hero-cta fade-up fade-up-delay-3">
          <a href="#ediciones" className="btn-primary">Ver ediciones</a>
          <a href="#como-funciona" className="btn-ghost">Cómo funciona</a>
        </div>
        <div className="card-deck fade-up fade-up-delay-4">
          {loading ? (
            <p style={{ opacity: 0.5 }}>Cargando cartas...</p>
          ) : (
            sampleCards.map((card, i) => (
              <CardPreview key={card.id} card={card} index={i} totalCards={totalCards} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Editions() {
  return (
    <section className="section editions" id="ediciones">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">Catálogo</p>
          <h2 className="section-title">Nuestras ediciones</h2>
          <div className="divider" />
          <p className="section-subtitle">
            Cada edición es un mundo propio. Mismo nivel de producción, estética diferente.
          </p>
        </div>
        <div className="editions-grid">
          {EDITIONS.map((ed) => (
            <div key={ed.slug} className={`edition-card ${!ed.available ? 'coming-soon' : ''}`}>
              <span className="edition-badge">{ed.badge}</span>
              <span className="edition-emoji">{ed.emoji}</span>
              <h3 className="edition-name">{ed.name}</h3>
              <p className="edition-desc">{ed.desc}</p>
              <p className="edition-meta">{ed.cards} cartas · Papel 350g · Laminado Mate</p>
              {ed.available && (
                <a
                  href={`https://${ed.slug}.baraja.cards`}
                  className="btn-primary"
                  style={{ marginTop: '1.5rem', display: 'inline-flex' }}
                >
                  Consultar edición →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="section" id="como-funciona">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">El proceso</p>
          <h2 className="section-title">Local-first, on demand</h2>
          <div className="divider" />
          <p className="section-subtitle">
            Mirás una muestra, probás la experiencia y consultás si la baraja te sirve.
          </p>
        </div>
        <div className="steps">
          {STEPS.map((step) => (
            <div key={step.n} className="step">
              <div className="step-number">{step.n}</div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactCTA() {
  const message = getBarajaGeneralInquiryMessage();

  return (
    <section className="section lead-capture" id="contacto">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">Contacto</p>
          <h2 className="section-title">Consultá por WhatsApp</h2>
          <div className="divider" />
          <p className="section-subtitle">
            Escribinos y vemos qué mazo encaja mejor con tu contexto.
          </p>
        </div>
        <div className="lead-form">
          <EbWhatsAppButton
            aria-label="Hablar por WhatsApp sobre Baraja"
            className="btn-primary"
            fullWidth
            href={getBarajaInquiryHref(message)}
          >
            Hablar por WhatsApp
          </EbWhatsAppButton>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <span className="footer-brand">Baraja</span>
          <span className="footer-copy">© {new Date().getFullYear()} Baraja.cards · Entity Builders</span>
          <span className="footer-copy muted">baraja.cards</span>
        </div>
      </div>
    </footer>
  );
}

export default function BarajaLanding() {
  return (
    <>
      <Navbar />
      <Hero />
      <Editions />
      <HowItWorks />
      <ContactCTA />
      <Footer />
    </>
  );
}
