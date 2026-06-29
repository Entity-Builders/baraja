import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findDigitalDeck, getDeckPrintableLabel } from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

export default function DigitalPrintGuide() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);

  useEffect(() => {
    if (!deck) {
      return;
    }

    trackBarajaEvent('baraja_printable_pdf_interest', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      printable_enabled: true,
      source: 'print_guide_view',
      surface: 'print_guide',
    });
  }, [deck]);

  if (!deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Guía no encontrada</p>
        <h1>No encontramos esa edición.</h1>
        <Link className="btn-primary" to="/">Volver a la biblioteca</Link>
      </main>
    );
  }

  const printableLabel = getDeckPrintableLabel(deck);
  const dimensions = `${deck.print_specs.dimensions.width} x ${deck.print_specs.dimensions.height} ${deck.print_specs.dimensions.unit}`;

  return (
    <main className="digital-shell">
      <nav className="digital-nav">
        <Link to={`/decks/${deck.slug}`} className="digital-brand">{deck.name}</Link>
        <div className="digital-nav-links">
          <Link to={`/decks/${deck.slug}/session`}>Sesión</Link>
          <Link to={`/decks/${deck.slug}/access`}>Consulta</Link>
        </div>
      </nav>

      <section className="digital-print-hero">
        <p className="digital-kicker">PDF imprimible</p>
        <h1>Especificación para imprimir {deck.name}.</h1>
        <p className="digital-lead">
          Pensado para que una persona o negocio mande el archivo a una imprenta
          con las indicaciones mínimas correctas.
        </p>
      </section>

      <section className="digital-spec-grid">
        <Spec label="Tamaño final" value={dimensions} />
        <Spec label="Sangrado" value={`${deck.print_specs.bleed} mm`} />
        <Spec label="Papel" value={deck.print_specs.paper_weight} />
        <Spec label="Terminación" value={deck.print_specs.finish} />
        <Spec label="Color" value={deck.print_specs.color_profile} />
        <Spec
          label="Esquinas"
          value={deck.print_specs.rounded_corners ? 'Redondeadas' : 'Rectas'}
        />
      </section>

      <section className="digital-print-copy">
        <div>
          <p className="digital-kicker">Licencia</p>
          <h2>{printableLabel}</h2>
          <p>
            La licencia personal habilita impresión para uso propio. La
            licencia profesional se acuerda para sesiones o talleres, sin
            reventa del archivo ni de copias sueltas.
          </p>
        </div>
        <div>
          <p className="digital-kicker">Proveedor</p>
          <h2>Imprenta a elección</h2>
          <p>
            Compartí estas especificaciones con la imprenta que elijas para
            coordinar material, costo, prueba de color y entrega con claridad.
          </p>
        </div>
      </section>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <article className="digital-spec">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
