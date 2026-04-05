import React, { useState } from 'react';
import { DECKS } from '@eb-packages/deck-engine';

// ── Data ─────────────────────────────────────────────────────────

const deck = DECKS['cable-a-tierra'];

const EDITIONS = [
  {
    emoji: '🧲',
    name: 'Cable a Tierra',
    slug: 'cable-a-tierra',
    badge: 'Primera Edición',
    desc: deck.description,
    cards: deck.card_count,
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
    title: 'Elegís tu edición',
    desc: 'Cada mazo es una experiencia distinta. Afirmaciones, trivia, conexión — identidad propia en cada uno.',
  },
  {
    n: 'II',
    title: 'Lo imprimimos localmente',
    desc: 'Tu pedido va directo a una imprenta local. Papel 350g, laminado mate, esquinas redondeadas.',
  },
  {
    n: 'III',
    title: 'Lo recibís en días',
    desc: 'Sin aduanas, sin esperas. Impresión local, envío rápido. En tus manos antes de lo que imaginás.',
  },
];

// Grab 3 sample cards from the real deck
const SAMPLE_CARDS = deck.cards.slice(0, 3);

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
        <li><a href="#notificarme">Notificarme</a></li>
      </ul>
    </nav>
  );
}

function CardPreview({ card, index }: { card: typeof SAMPLE_CARDS[0]; index: number }) {
  return (
    <div className="card-3d" style={{ animationDelay: `${index * 0.15}s` }}>
      <div className="card-face card-front">
        <div className="card-face-label">
          {String(card.front.number).padStart(2, '0')} / {deck.card_count}
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
  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <p className="hero-eyebrow fade-up">La Fábrica de Cartas · Baraja.cards</p>
        <h1 className="fade-up fade-up-delay-1">
          Sabiduría que<br /><em>podés sostener</em>
        </h1>
        <p className="hero-tagline fade-up fade-up-delay-2">
          Mazos de cartas sin stock, impresos localmente bajo demanda.
          Cada edición con su propia identidad, su propio mundo.
        </p>
        <div className="hero-cta fade-up fade-up-delay-3">
          <a href="#ediciones" className="btn-primary">Ver ediciones</a>
          <a href="#como-funciona" className="btn-ghost">Cómo funciona</a>
        </div>
        <div className="card-deck fade-up fade-up-delay-4">
          {SAMPLE_CARDS.map((card, i) => (
            <CardPreview key={card.id} card={card} index={i} />
          ))}
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
                  Ver edición →
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
            Sin stock. Sin océanos de por medio. Cada mazo se imprime cuando lo pedís.
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

function LeadCapture() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, edition: 'baraja' }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="section lead-capture" id="notificarme">
      <div className="container">
        <div className="section-header">
          <p className="section-eyebrow">Lanzamiento</p>
          <h2 className="section-title">Sé el primero en saberlo</h2>
          <div className="divider" />
          <p className="section-subtitle">
            Cable a Tierra ya está casi lista. Dejá tu email y te avisamos el día del lanzamiento.
          </p>
        </div>
        {status === 'done' ? (
          <p style={{ textAlign: 'center', color: 'var(--color-gold)', fontFamily: 'var(--font-serif)', fontSize: '1.2rem' }}>
            ¡Perfecto! Te avisamos cuando esté lista. 🎴
          </p>
        ) : (
          <form className="lead-form" onSubmit={handleSubmit}>
            <input
              id="lead-email-main"
              className="lead-input"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn-primary" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? '...' : 'Notificarme'}
            </button>
          </form>
        )}
        {status === 'error' && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
            Algo salió mal. Intentá de nuevo.
          </p>
        )}
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
      <LeadCapture />
      <Footer />
    </>
  );
}
