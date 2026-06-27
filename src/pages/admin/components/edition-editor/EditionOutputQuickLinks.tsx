import { Link } from 'react-router-dom';

interface EditionOutputQuickLinksProps {
  deckSlug: string;
  workspaceDeckId: string;
}

export function EditionOutputQuickLinks({ deckSlug, workspaceDeckId }: EditionOutputQuickLinksProps) {
  return (
    <section
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.025)',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1rem' }}>Pruebas rápidas antes de publicar</h2>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to={`/decks/${deckSlug}`} className="btn-ghost" style={{ textDecoration: 'none' }}>
          Ver landing
        </Link>
        <Link to={`/decks/${deckSlug}/session`} className="btn-ghost" style={{ textDecoration: 'none' }}>
          Probar sesión digital
        </Link>
        <Link to={`/admin/${encodeURIComponent(workspaceDeckId)}/print`} className="btn-primary" style={{ textDecoration: 'none' }}>
          Generar PDF imprimible
        </Link>
      </div>
      <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.86rem', lineHeight: 1.5 }}>
        Este modo concentra la salida del mazo: landing pública, PDF de impresión y pruebas de lectura. Los cambios de diseño viven en “Diseño global”; contenido y revisión viven en “Mazo”.
      </p>
    </section>
  );
}
