import React, { useState } from 'react';
import { PublicShowcase } from '../../components/cards/PublicShowcase';
import { useDeck } from '../../hooks/useDeck';

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
        body: JSON.stringify({ email, edition: 'cable-a-tierra' }),
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

export default function CableATierraLanding() {
  const { deck, loading, error } = useDeck('cable-a-tierra');

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Cargando...</div>;
  if (error || !deck) return <div style={{ color: 'white', padding: '4rem' }}>Error cargando edición.</div>;

  const themeStyles = {
    '--color-bg': deck.design.background || 'var(--color-bg)',
    '--color-text': deck.design.text_color || 'var(--color-text)',
    '--color-surface': deck.design.surface_color || 'var(--color-surface)',
    '--color-surface-2': deck.design.background || 'var(--color-surface-2)',
    '--color-gold': deck.design.accent_color || 'var(--color-gold)',
    '--color-gold-light': deck.design.accent_color || 'var(--color-gold-light)',
    '--color-border': 'rgba(44, 36, 25, 0.1)',
  } as React.CSSProperties;

  return (
    <div style={themeStyles} className="edition-theme-wrapper">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="navbar" style={{ background: 'rgba(244, 241, 234, 0.85)' }}>
        <a href="https://baraja.cards" className="navbar-back">
          ← Baraja.cards
        </a>
        <a href="#reservar" className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.5rem 1.25rem' }}>
          Quiero mi mazo
        </a>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="cat-hero">
        <div className="hero-bg" />
        <div className="cat-hero-content">
          <p className="hero-eyebrow fade-up">Baraja · Primera Edición</p>
          <h1 className="cat-title fade-up fade-up-delay-1">
            Cable<br /><em>a Tierra</em>
          </h1>
          <p className="cat-hook fade-up fade-up-delay-2">
            30 cartas para los días que se sienten demasiado.
            <br />Una por día. Sin app. Sin rutina.
          </p>
          <div className="hero-cta fade-up fade-up-delay-3">
            <a href="#reservar" className="btn-primary">Quiero mi mazo</a>
            <a href="#las-cartas" className="btn-ghost">Ver las cartas</a>
          </div>
        </div>
      </section>

      {/* ── Las cartas ─────────────────────────────────────── */}
      <section className="section editions" id="las-cartas">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">{deck.card_count} cartas</p>
            <h2 className="section-title">Tocá cualquier carta</h2>
            <div className="divider" />
          </div>
          <PublicShowcase deck={deck as any} maxCards={4} />
          <p className="edition-meta" style={{ textAlign: 'center', marginTop: '2rem' }}>
            + {deck.card_count - 4} cartas más en el mazo completo
          </p>
        </div>
      </section>

      {/* ── Por qué ────────────────────────────────────────── */}
      <section className="section cat-why">
        <div className="container">
          <div className="cat-why-grid">
            <div className="cat-why-item">
              <div className="cat-why-icon">🧲</div>
              <h3>Una carta por día</h3>
              <p>No requiere rutina, app, ni compromiso. Solo agarrás una carta cuando la necesitás.</p>
            </div>
            <div className="cat-why-item">
              <div className="cat-why-icon">💬</div>
              <h3>Frases que no escuchaste mil veces</h3>
              <p>Sin clichés de autoayuda. Sin pastel. Solo recordatorios honestos de lo que ya sabés.</p>
            </div>
            <div className="cat-why-item">
              <div className="cat-why-icon">📦</div>
              <h3>Llega a tu puerta</h3>
              <p>Impreso localmente en Argentina. Papel de calidad. En tus manos en días.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Precio + CTA ───────────────────────────────────── */}
      <section className="section lead-capture" id="reservar">
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow">Edición Lanzada</p>
            <h2 className="section-title">Comprar Mazo</h2>
            <div className="divider" />
            <p className="section-subtitle">
              Dejá tu email para iniciar el proceso de compra.
            </p>
          </div>
          <EmailCapture id="lead-main" />
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section className="section cat-faq">
        <div className="container cat-faq-inner">
          <h2 className="section-title" style={{ marginBottom: '2.5rem' }}>Preguntas frecuentes</h2>
          <div className="cat-faq-list">
            <div className="cat-faq-item">
              <h3>¿Cuándo llega?</h3>
              <p>El mazo se imprime al confirmar tu compra y se envía en menos de una semana cronológica.</p>
            </div>
            <div className="cat-faq-item">
              <h3>¿Puedo regalarlo?</h3>
              <p>Sí. Es uno de los mejores regalos que podés hacer. Podés pedir que se envíe directo a la persona.</p>
            </div>
            <div className="cat-faq-item">
              <h3>¿Es una suscripción?</h3>
              <p>No. Pagás una vez, el mazo es tuyo. Sin renovaciones, sin sorpresas.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand">Cable a Tierra</span>
            <span className="footer-copy">© {new Date().getFullYear()} · <a href="https://baraja.cards">Baraja.cards</a></span>
            <span className="footer-copy muted">Entity Builders</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
