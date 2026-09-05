import { Link, useParams } from 'react-router-dom';
import { EbWhatsAppButton } from '@entity-builders/ui-web';
import {
  FEATURED_DIGITAL_DECK,
  findDigitalDeck,
  getDeckInquiryHref,
} from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

export default function DigitalAppAccess() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug) ?? FEATURED_DIGITAL_DECK;

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Acceso no encontrado.</h1>
        <Link to="/app">Volver</Link>
      </main>
    );
  }

  const inquiryHref = getDeckInquiryHref(deck);
  const trackInquiry = (source: string, ctaId: string) => {
    trackBarajaEvent('baraja_inquiry_started', {
      cta_id: ctaId,
      cta_kind: 'whatsapp',
      deck_id: deck.id,
      deck_slug: deck.slug,
      href_type: 'wa_me',
      source,
      surface: 'pwa_access',
    });
  };
  const trackPrintableInterest = (source: string) => {
    trackBarajaEvent('baraja_printable_pdf_interest', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      printable_enabled: true,
      source,
      surface: 'pwa_access',
    });
  };

  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content">
        <Link to={`/app/decks/${deck.slug}`} className="baraja-mobile-back">Consulta</Link>

        <article className="baraja-active-access">
          <span aria-hidden="true">?</span>
          <div>
            <h1>{deck.name}</h1>
            <p>Consultá por acceso digital y PDF imprimible.</p>
          </div>
        </article>

        <article className="baraja-pdf-card">
          <div className="baraja-pdf-card-header">
            <div>
              <h2>PDF imprimible</h2>
              <p>{deck.name} · {deck.card_count} cartas · A4 y carta</p>
            </div>
            <span>PDF</span>
          </div>
          <div className="baraja-pdf-formats">
            <span>A4</span>
            <span>Carta</span>
            <span>Tarjeta</span>
          </div>
          <EbWhatsAppButton
            href={inquiryHref}
            onClick={() => {
              trackPrintableInterest('pwa_access_pdf_cta');
              trackInquiry('pwa_access_pdf_cta', 'pwa_access_pdf_cta');
            }}
          >
            Consultar PDF imprimible
          </EbWhatsAppButton>
        </article>

        <article className="baraja-print-rights">
          <h2>Derechos de impresión</h2>
          <p>
            Uso personal o profesional según la licencia acordada. Podés
            imprimirlo vos o enviarlo a una imprenta local; la reventa requiere
            permiso aparte.
          </p>
        </article>

        <Link
          className="baraja-print-guide-link"
          to={`/app/decks/${deck.slug}/print-guide`}
          onClick={() => trackPrintableInterest('pwa_access_print_guide')}
        >
          Ver guía para imprenta
        </Link>
      </section>
    </main>
  );
}
