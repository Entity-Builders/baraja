import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EbWhatsAppButton } from '@entity-builders/ui-web';
import { getPrintableAccess } from '@entity-builders/deck-engine';
import { findDigitalDeck, getDeckInquiryHref } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

export default function DigitalDeckAccess() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);
  const printable = deck ? getPrintableAccess(deck) : undefined;

  useEffect(() => {
    if (!deck) {
      return;
    }

    trackBarajaEvent('baraja_paywall_viewed', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      printable_enabled: true,
      license_scope_count: printable?.license_scopes.length ?? 0,
      surface: 'access_page',
    });
  }, [deck, printable]);

  if (!deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Acceso no encontrado</p>
        <h1>No encontramos esa edición.</h1>
        <Link className="btn-primary" to="/">Volver a la biblioteca</Link>
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
      surface: 'access_page',
    });
  };
  const trackPrintGuide = (source: string) => {
    trackBarajaEvent('baraja_printable_pdf_interest', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      license_scope_count: printable?.license_scopes.length ?? 0,
      printable_enabled: true,
      source,
      surface: 'access_page',
    });
  };

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to={`/decks/${deck.slug}`} className="digital-brand">{deck.name}</Link>
        <div className="digital-nav-links">
          <Link to={`/decks/${deck.slug}/session`}>Abrir mazo</Link>
          <Link
            to={`/decks/${deck.slug}/print-guide`}
            onClick={() => trackPrintGuide('access_nav_print_guide')}
          >
            Guía PDF
          </Link>
        </div>
      </nav>

      <section className="digital-access-hero">
        <p className="digital-kicker">Consulta</p>
        <h1>Consultá por {deck.name}.</h1>
        <p className="digital-lead">
          Te mostramos la experiencia completa y coordinamos el acceso por
          mensaje para esta edición.
        </p>
        <div className="digital-access-actions">
          <Link
            to={`/decks/${deck.slug}/session`}
            className="btn-primary"
          >
            Probar sesión
          </Link>
          <EbWhatsAppButton
            className="btn-ghost"
            href={inquiryHref}
            onClick={() => trackInquiry('access_page_cta', 'access_page_cta')}
          >
            Consultar acceso
          </EbWhatsAppButton>
        </div>
      </section>

      <section className="digital-access-grid">
        <article>
          <p className="digital-kicker">Incluido</p>
          <h2>Sesión guiada</h2>
          <p>{deck.card_count} cartas, muestra jugable y navegación por el mazo.</p>
        </article>
        <article>
          <p className="digital-kicker">Imprimible</p>
          <h2>PDF para imprenta</h2>
          <p>
            Paquete preparado para descarga privada cuando la edición incluye
            versión imprimible.
          </p>
        </article>
        <article>
          <p className="digital-kicker">Mesa</p>
          <h2>Imprimilo a tu manera</h2>
          <p>Usá las especificaciones del PDF con tu imprenta, taller o equipo interno.</p>
        </article>
      </section>
    </main>
  );
}
