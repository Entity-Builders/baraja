import { EbWhatsAppButton } from '@entity-builders/ui-web';
import type { CSSProperties } from 'react';
import { PublicShowcase } from '../components/cards/PublicShowcase';
import { RelatedDecksSection } from '../components/decks/RelatedDecksSection';
import { useDeck } from '../hooks/useDeck';
import {
  getBarajaInquiryHref,
  getDeckInquiryMessage,
} from '../lib/digitalDeckCatalog';

// ── WhatsApp inquiry ──────────────────────────────────────────

function WhatsAppInquiry({ id, message }: { id: string; message: string }) {
  return (
    <div className="lead-form" id={id}>
      <EbWhatsAppButton
        aria-label="Consultar este mazo por WhatsApp"
        className="btn-primary"
        fullWidth
        href={getBarajaInquiryHref(message)}
      >
        Consultar por WhatsApp
      </EbWhatsAppButton>
    </div>
  );
}

function hasPurchaseLanguage(value: unknown): value is string {
  return typeof value === 'string' && /compr|precio|pago|checkout|tienda/i.test(value);
}

function hasEmailLeadLanguage(value: unknown): value is string {
  return typeof value === 'string' && /mail|email|correo|notific/i.test(value);
}

function inquiryCopy(value: unknown, fallback: string): string {
  if (hasPurchaseLanguage(value) || hasEmailLeadLanguage(value)) {
    return fallback;
  }

  return typeof value === 'string' && value.trim() ? value : fallback;
}

// ── Page ──────────────────────────────────────────────────────

interface DynamicEditionLandingProps {
  slug: string;
}

declare global {
  interface Window {
    BARAJA_VIBE_CONTEXT?: {
      timeOfDay: string;
      season: string;
      city: string;
    };
  }
}

export default function DynamicEditionLanding({ slug }: DynamicEditionLandingProps) {
  const { deck, loading, error } = useDeck(slug);
  
  // Read contextual vibe injected by Cloudflare Worker
  const vibe = typeof window !== 'undefined' && window.BARAJA_VIBE_CONTEXT ? window.BARAJA_VIBE_CONTEXT : { timeOfDay: 'day', season: 'spring', city: 'Unknown' };

  if (loading) return <div style={{ color: 'white', padding: '4rem', textAlign: 'center' }}>Cargando...</div>;
  if (error || !deck) return <div style={{ color: 'white', padding: '4rem' }}>Error cargando edición.</div>;

  const config = deck.landing_config || {};

  const themeStyles = {
    '--color-bg': deck.design.background || 'var(--color-bg)',
    '--color-text': deck.design.text_color || 'var(--color-text)',
    '--color-surface': deck.design.surface_color || 'var(--color-surface)',
    '--color-surface-2': deck.design.background || 'var(--color-surface-2)',
    '--color-gold': deck.design.accent_color || 'var(--color-gold)',
    '--color-gold-light': deck.design.accent_color || 'var(--color-gold-light)',
    '--color-border': 'rgba(255, 255, 255, 0.1)',
  } as CSSProperties;

  // Defaults for missing configs
  const heroEyebrow = config.hero?.eyebrow || 'Edición Especial';
  const heroTitleHtml = config.hero?.titleHtml || deck.name;
  const heroSubtitle = config.hero?.subtitle || deck.description;
  const ctaPrimary = inquiryCopy(config.hero?.ctaPrimary, 'Consultar acceso');
  const ctaSecondary = config.hero?.ctaSecondary || 'Ver las cartas';

  const showcaseEyebrow = config.showcase?.eyebrow?.replace('{count}', String(deck.card_count)) || `${deck.card_count} cartas`;
  const showcaseTitle = config.showcase?.title || 'Explorá el mazo';
  const showcaseSubtitle = config.showcase?.subtitle;
  const showcaseFooter = config.showcase?.footer?.replace('{remaining}', String(Math.max(0, deck.card_count - 4)));

  const leadEyebrow = inquiryCopy(config.leadCapture?.eyebrow, 'Consulta');
  const leadTitle = inquiryCopy(config.leadCapture?.title, `Consultar ${deck.name}`);
  const leadSubtitle = inquiryCopy(
    config.leadCapture?.subtitle,
    'Escribinos por WhatsApp y vemos cómo acceder a esta edición.'
  );
  const inquiryMessage = getDeckInquiryMessage(deck);

  // Resolve Vibe Background
  // Fallbacks: If the generated vibe image doesn't exist, it will fallback to CSS gradient
  const vibeBackgroundImage = `/assets/vibes/${slug}/${vibe.timeOfDay}_${vibe.season}.jpg`;

  return (
    <div style={themeStyles} className={`edition-theme-wrapper vibe-${vibe.timeOfDay}`}>
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="navbar edition-navbar">
        <a href="https://baraja.cards" className="navbar-back edition-navbar-brand">
          <span className="edition-navbar-mark" aria-hidden="true" />
          <span>Baraja</span>
        </a>
        <a href="#reservar" className="btn-primary edition-navbar-cta">
          {ctaPrimary}
        </a>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="cat-hero">
        <div 
          className="hero-bg vibe-bg" 
          style={{ 
            opacity: 0.18,
            backgroundImage: `url(${vibeBackgroundImage}), linear-gradient(to bottom, #111, var(--color-bg))`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            mixBlendMode: vibe.timeOfDay === 'night' ? 'color-dodge' : 'normal'
          }} 
        />
        <div className="cat-hero-content">
          <p className="hero-eyebrow fade-up">
            {heroEyebrow} 
            {vibe.city && vibe.city !== 'Unknown' && <span className="vibe-stamp"> · {vibe.timeOfDay === 'night' ? '🌙' : '☀️'} {vibe.city}</span>}
          </p>
          <h1 
            className="cat-title fade-up fade-up-delay-1" 
            dangerouslySetInnerHTML={{ __html: heroTitleHtml }}
          />
          <p className="cat-hook fade-up fade-up-delay-2" style={{ maxWidth: '600px', margin: '0 auto 2rem', whiteSpace: 'pre-wrap' }}>
            {heroSubtitle}
          </p>
          <div className="hero-cta fade-up fade-up-delay-3" style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <a href="#reservar" className="btn-primary">{ctaPrimary}</a>
            <a href="#las-cartas" className="btn-ghost" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>{ctaSecondary}</a>
          </div>
        </div>
      </section>

      {/* ── Las cartas ─────────────────────────────────────── */}
      <section className="section editions" id="las-cartas" style={{ padding: '6rem 0' }}>
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow" style={{ color: 'var(--color-text)', opacity: 0.7 }}>{showcaseEyebrow}</p>
            <h2 className="section-title">{showcaseTitle}</h2>
            <div className="divider" style={{ background: 'var(--color-border)' }} />
            {showcaseSubtitle && (
              <p style={{ marginTop: '1rem', color: 'var(--color-text)', opacity: 0.8, maxWidth: '500px', margin: '1rem auto' }}>
                {showcaseSubtitle}
              </p>
            )}
          </div>
          <PublicShowcase deck={deck} maxCards={4} />
          {showcaseFooter && (
            <p className="edition-meta" style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--color-text)', opacity: 0.5 }}>
              {showcaseFooter}
            </p>
          )}
        </div>
      </section>

      {/* ── Por qué ────────────────────────────────────────── */}
      {config.reasons && config.reasons.length > 0 && (
        <section className="section cat-why" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>
          <div className="container">
            <div className="cat-why-grid">
              {config.reasons.map((reason, idx) => (
                <div key={idx} className="cat-why-item" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                  <div className="cat-why-icon">{reason.icon}</div>
                  <h3 style={{ color: 'var(--color-text)' }}>{reason.title}</h3>
                  <p style={{ color: 'var(--color-text)', opacity: 0.7 }}>{reason.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Consulta + CTA ─────────────────────────────────── */}
      <section className="section lead-capture" id="reservar" style={{ padding: '8rem 0' }}>
        <div className="container">
          <div className="section-header">
            <p className="section-eyebrow" style={{ color: 'var(--color-text)', opacity: 0.7 }}>{leadEyebrow}</p>
            <h2 className="section-title">{leadTitle}</h2>
            <div className="divider" style={{ background: 'var(--color-border)' }} />
            <p className="section-subtitle" style={{ color: 'var(--color-text)', opacity: 0.8 }}>
              {leadSubtitle}
            </p>
          </div>
          <WhatsAppInquiry id="lead-main" message={inquiryMessage} />
        </div>
      </section>

      <RelatedDecksSection currentDeck={deck} />

      {/* ── FAQ ────────────────────────────────────────────── */}
      {config.faq && config.faq.length > 0 && (
        <section className="section cat-faq">
          <div className="container cat-faq-inner">
            <h2 className="section-title" style={{ marginBottom: '2.5rem' }}>{config.faqTitle || 'Preguntas frecuentes'}</h2>
            <div className="cat-faq-list">
              {config.faq.map((item, idx) => (
                <div key={idx} className="cat-faq-item">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="footer" style={{ borderTop: '1px solid var(--color-border)', marginTop: '4rem' }}>
        <div className="container">
          <div className="footer-inner">
            <span className="footer-brand" style={{ color: 'var(--color-text)' }}>{deck.name}</span>
            <span className="footer-copy" style={{ color: 'var(--color-text)', opacity: 0.6 }}>© {new Date().getFullYear()} · <a href="https://baraja.cards" style={{ color: 'var(--color-text)' }}>Baraja.cards</a></span>
            <span className="footer-copy muted" style={{ opacity: 0.4 }}>Entity Builders</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
