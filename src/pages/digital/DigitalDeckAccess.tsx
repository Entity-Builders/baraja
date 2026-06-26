import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getPrintableAccess } from '@eb-packages/deck-engine';
import { findDigitalDeck, formatDeckPrice } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

export default function DigitalDeckAccess() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const deck = findDigitalDeck(slug);
  const [downloadState, setDownloadState] = useState<'idle' | 'queued'>('idle');
  const printable = deck ? getPrintableAccess(deck) : undefined;
  const checkoutReturnState = searchParams.get('checkout');

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

    if (checkoutReturnState) {
      trackBarajaEvent('baraja_checkout_returned', {
        deck_id: deck.id,
        deck_slug: deck.slug,
        checkout_return_state: checkoutReturnState,
        surface: 'access_page',
      });
    }
  }, [checkoutReturnState, deck, printable]);

  if (!deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Acceso no encontrado</p>
        <h1>No encontramos esa edición.</h1>
        <Link className="btn-primary" to="/">Volver a la biblioteca</Link>
      </main>
    );
  }

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to={`/decks/${deck.slug}`} className="digital-brand">{deck.name}</Link>
        <div className="digital-nav-links">
          <Link to={`/decks/${deck.slug}/session`}>Abrir mazo</Link>
          <Link to={`/decks/${deck.slug}/print-guide`}>Guía PDF</Link>
        </div>
      </nav>

      <section className="digital-access-hero">
        <p className="digital-kicker">Acceso digital</p>
        <h1>{deck.name} queda listo para usar.</h1>
        <p className="digital-lead">
          Una edición de {formatDeckPrice(deck)} con sesión digital completa y
          PDF descargable incluido.
        </p>
        <div className="digital-access-actions">
          <Link
            to={`/decks/${deck.slug}/session`}
            className="btn-primary"
          >
            Abrir mazo digital
          </Link>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              setDownloadState('queued');
              trackBarajaEvent('baraja_printable_pdf_download_requested', {
                deck_id: deck.id,
                deck_slug: deck.slug,
                printable_enabled: true,
                license_scope_count: printable?.license_scopes.length ?? 0,
                surface: 'access_page',
              });
            }}
          >
            Descargar PDF imprimible
          </button>
        </div>
        {downloadState === 'queued' && (
          <p className="digital-access-note">
            Cuando el acceso esté verificado, Baraja abrirá la descarga privada
            del PDF incluido.
          </p>
        )}
      </section>

      <section className="digital-access-grid">
        <article>
          <p className="digital-kicker">Incluido</p>
          <h2>Sesión completa</h2>
          <p>{deck.card_count} cartas, guardados locales y navegación por el mazo.</p>
        </article>
        <article>
          <p className="digital-kicker">Imprimible</p>
          <h2>PDF para imprenta</h2>
          <p>
            Paquete preparado para descarga privada con licencia personal o
            profesional según el plan.
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
