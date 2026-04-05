import React, { useState } from 'react';
import { DECKS } from '@eb-packages/deck-engine';
import type { Card } from '@eb-packages/deck-engine';

// Grab barometro
const deck = DECKS['barometro'];
const showcaseCards = deck.cards.slice(0, 4);

// ── Interactive card flip ─────────────────────────────────────

function ShowcaseCard({ card, flipped, onClick }: {
  card: Card;
  flipped: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`edition-card-3d ${flipped ? 'flipped' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Carta ${card.front.title} — tocá para ver`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="edition-card-face edition-card-front">
        {/* Generative art injected dynamically */}
        {card.front.art_url && (
          <img src={card.front.art_url} alt={card.front.title} className="ec-art" />
        )}
        <div className="ec-front-overlay">
          <div className="ec-number">
            {String(card.front.number).padStart(2, '0')} / {deck.card_count}
          </div>
          <div className="ec-title">{card.front.title}</div>
          <div className="ec-hint">tocá para ver →</div>
        </div>
      </div>
      <div className="edition-card-face edition-card-back">
        <div className="ec-when">{card.back.when_to_use}</div>
        <div className="ec-phrase">"{card.back.phrase}"</div>
        <div className="ec-instruction">{card.back.instruction}</div>
        {card.tags && card.tags.length > 0 && (
          <div className="ec-tags">
            {card.tags.map((tag) => (
              <span key={tag} className="ec-tag">{tag}</span>
            ))}
          </div>
        )}
        <div className="ec-brand">Barómetro · Baraja</div>
      </div>
    </div>
  );
}

// ── Email capture ─────────────────────────────────────────────

function EmailCapture({ id }: { id: string }) {
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
        body: JSON.stringify({ email, edition: 'barometro' }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p className="cat-thanks">
        Anotado. 🧲 Te escribimos el día del lanzamiento.
      </p>
    );
  }

  return (
    <form className="lead-form" onSubmit={handleSubmit} id={id}>
      <input
        className="lead-input"
        type="email"
        placeholder="tu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-label="Tu email"
      />
      <button className="btn-primary" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? '...' : 'Comprar / Quiero mi mazo'}
      </button>
      {status === 'error' && (
        <p className="cat-error">Algo salió mal. Intentá de nuevo.</p>
      )}
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function BarometroLanding() {
  const [flippedCard, setFlippedCard] = useState<string | null>(null);

  const themeStyles = {
    '--color-bg': deck.design.background || 'var(--color-bg)',
    '--color-text': deck.design.text_color || 'var(--color-text)',
    '--color-surface': deck.design.surface_color || 'var(--color-surface)',
    '--color-surface-2': deck.design.background || 'var(--color-surface-2)',
    '--color-gold': deck.design.accent_color || 'var(--color-gold)',
    '--color-gold-light': deck.design.accent_color || 'var(--color-gold-light)',
    '--color-border': 'rgba(255, 255, 255, 0.1)',
  } as React.CSSProperties;

  return (
    <div style={themeStyles} className="edition-theme-wrapper">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="navbar" style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(10px)' }}>
        <a href="https://baraja.cards" className="navbar-back" style={{ color: 'var(--color-text)' }}>
          ← Baraja.cards
        </a>
        <a href="#reservar" className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.5rem 1.25rem' }}>
          Quiero mi mazo
        </a>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="cat-hero">
        {/* Inject dark aesthetic or full image background logic if needed */}
        <div className="hero-bg" style={{ opacity: 0.1, backgroundImage: 'linear-gradient(to bottom, #111, var(--color-bg))' }} />
        <div className="cat-hero-content">
          <p className="hero-eyebrow fade-up">Herramienta de Regulación</p>
          <h1 className="cat-title fade-up fade-up-delay-1" style={{ letterSpacing: '-0.02em' }}>
            Barómetro
          </h1>
          <p className="cat-hook fade-up fade-up-delay-2" style={{ maxWidth: '600px', margin: '0 auto 2rem' }}>
            {deck.description}
          </p>
          <div className="hero-cta fade-up fade-up-delay-3" style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <a href="#reservar" className="btn-primary">Quiero mi mazo</a>
            <a href="#las-cartas" className="btn-ghost" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>Ver las cartas</a>
          </div>
        </div>
      </section>

      {/* ── Las cartas ─────────────────────────────────────── */}
      <section className="section editions" id="las-cartas" style={{ padding: '6rem 0' }}>
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow" style={{ color: 'var(--color-text)', opacity: 0.7 }}>{deck.card_count} instrucciones de anclaje</p>
            <h2 className="section-title">El arte del anclaje</h2>
            <div className="divider" style={{ background: 'var(--color-border)' }} />
            <p style={{ marginTop: '1rem', color: 'var(--color-text)', opacity: 0.8, maxWidth: '500px', margin: '1rem auto' }}>
              Volteá una carta para ver instrucciones tácticas de regulación (DBT/Grounding).
            </p>
          </div>
          <div className="ec-grid">
            {showcaseCards.map((card) => (
              <ShowcaseCard
                key={card.id}
                card={card}
                flipped={flippedCard === card.id}
                onClick={() => setFlippedCard(flippedCard === card.id ? null : card.id)}
              />
            ))}
          </div>
          <p className="edition-meta" style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--color-text)', opacity: 0.5 }}>
            + {deck.card_count - showcaseCards.length} cartas más para desactivar el bucle mental.
          </p>
        </div>
      </section>

      {/* ── Por qué ────────────────────────────────────────── */}
      <section className="section cat-why" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>
        <div className="container">
          <div className="cat-why-grid">
            <div className="cat-why-item" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <div className="cat-why-icon">⚓</div>
              <h3 style={{ color: 'var(--color-text)' }}>Grounding táctico</h3>
              <p style={{ color: 'var(--color-text)', opacity: 0.7 }}>Ejercicios físicos comprobados para frenar espirales de trauma, pánico y disociación.</p>
            </div>
            <div className="cat-why-item" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <div className="cat-why-icon">🫀</div>
              <h3 style={{ color: 'var(--color-text)' }}>Arte abstracto</h3>
              <p style={{ color: 'var(--color-text)', opacity: 0.7 }}>Imágenes generativas diseñadas por IA para representar el estrés y la resolución visualmente.</p>
            </div>
            <div className="cat-why-item" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <div className="cat-why-icon">🧠</div>
              <h3 style={{ color: 'var(--color-text)' }}>Respaldado en DBT</h3>
              <p style={{ color: 'var(--color-text)', opacity: 0.7 }}>Apropiado para el abordaje Dialéctico Conductual en tolerar el malestar y check the facts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Precio + CTA ───────────────────────────────────── */}
      <section className="section lead-capture" id="reservar" style={{ padding: '8rem 0' }}>
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow" style={{ color: 'var(--color-text)', opacity: 0.7 }}>Tolerancia al malestar</p>
            <h2 className="section-title">Comprar Barómetro</h2>
            <div className="divider" style={{ background: 'var(--color-border)' }} />
            <p className="section-subtitle" style={{ color: 'var(--color-text)', opacity: 0.8 }}>
              Dejá tu mail para ser el primero en recibir el formato impreso premium.
            </p>
          </div>
          <EmailCapture id="lead-main" />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="footer" style={{ borderTop: '1px solid var(--color-border)', marginTop: '4rem' }}>
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand" style={{ color: 'var(--color-text)' }}>Barómetro</span>
            <span className="footer-copy" style={{ color: 'var(--color-text)', opacity: 0.6 }}>© {new Date().getFullYear()} · <a href="https://baraja.cards" style={{ color: 'var(--color-text)' }}>Baraja.cards</a></span>
            <span className="footer-copy muted" style={{ opacity: 0.4 }}>Entity Builders</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
