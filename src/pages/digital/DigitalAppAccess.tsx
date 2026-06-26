import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FEATURED_DIGITAL_DECK, findDigitalDeck } from '../../lib/digitalDeckCatalog';

export default function DigitalAppAccess() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug) ?? FEATURED_DIGITAL_DECK;
  const [downloadState, setDownloadState] = useState<'idle' | 'queued'>('idle');

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Acceso no encontrado.</h1>
        <Link to="/app">Volver</Link>
      </main>
    );
  }

  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content">
        <Link to={`/app/decks/${deck.slug}`} className="baraja-mobile-back">Mi acceso</Link>

        <article className="baraja-active-access">
          <span aria-hidden="true">✓</span>
          <div>
            <h1>{deck.name} — Acceso activo</h1>
            <p>Acceso digital completo · PDF incluido</p>
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
          <button type="button" onClick={() => setDownloadState('queued')}>
            Descargar PDF · A4
          </button>
        </article>

        {downloadState === 'queued' && (
          <p className="baraja-download-note">
            Cuando el acceso esté verificado, Baraja abrirá la descarga privada
            del PDF incluido.
          </p>
        )}

        <article className="baraja-print-rights">
          <h2>Derechos de impresión</h2>
          <p>
            Uso personal o profesional según tu licencia. Podés imprimirlo vos
            o enviarlo a una imprenta local; la reventa requiere permiso aparte.
          </p>
        </article>

        <Link className="baraja-print-guide-link" to={`/app/decks/${deck.slug}/print-guide`}>
          Ver guía para imprenta
        </Link>
      </section>
    </main>
  );
}
