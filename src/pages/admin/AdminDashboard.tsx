import { Link } from 'react-router-dom';
import { useAllDecks } from '../../hooks/useAllDecks';
import { getDeckPublicationReadiness } from '../../lib/deckPublicationReadiness';

type DashboardReadinessItem = {
  label: string;
  ready: boolean;
  detail: string;
};

function getDashboardReadinessItems(deck: ReturnType<typeof useAllDecks>['decks'][number]['deck']): DashboardReadinessItem[] {
  const readiness = getDeckPublicationReadiness(deck);

  return [
    {
      label: 'Landing',
      ready: deck.digital?.is_published === true,
      detail: deck.digital?.is_published ? 'activa' : readiness.isPublishable ? 'lista' : 'bloqueada',
    },
    {
      label: 'Arte frontal',
      ready: readiness.missingFrontArtCount === 0,
      detail: `${readiness.totalCards - readiness.missingFrontArtCount}/${readiness.totalCards}`,
    },
    {
      label: 'Reversos',
      ready: readiness.missingBackCount === 0,
      detail: `${readiness.totalCards - readiness.missingBackCount}/${readiness.totalCards}`,
    },
    {
      label: 'Contenido',
      ready: readiness.incompleteContentCount === 0,
      detail: `${readiness.totalCards - readiness.incompleteContentCount}/${readiness.totalCards}`,
    },
    {
      label: 'Publicación',
      ready: readiness.isPublishable,
      detail: readiness.isPublishable ? 'publicable' : `${readiness.blockers.length} pendientes`,
    },
  ];
}

function ReadinessChip({ item }: { item: DashboardReadinessItem }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      padding: '0.35rem 0.5rem',
      borderRadius: '999px',
      border: `1px solid ${item.ready ? 'rgba(116, 196, 147, 0.35)' : 'rgba(212,175,100,0.28)'}`,
      color: item.ready ? '#9ee0b6' : '#d4af64',
      background: item.ready ? 'rgba(116, 196, 147, 0.08)' : 'rgba(212,175,100,0.08)',
      fontSize: '0.72rem',
      whiteSpace: 'nowrap',
    }}>
      <strong>{item.label}</strong>
      <span style={{ opacity: 0.75 }}>{item.detail}</span>
    </span>
  );
}

export default function AdminDashboard() {
  const { decks, loading, error } = useAllDecks();

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
        <p style={{ opacity: 0.7, fontSize: '1.1rem' }}>Cargando ediciones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'white' }}>
        <p style={{ color: '#ff6b6b' }}>Error loading decks: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1040px', margin: '0 auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.35rem' }}>Baraja Admin</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>Consola interna para preparar mazos digitales, aprobar cartas y activar landings públicas.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link to="/admin/giro" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            Configurar giro
          </Link>
          <Link to="/admin/generate" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            Nueva edición
          </Link>
        </div>
      </div>

      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        border: '1px solid rgba(212,175,100,0.18)',
        borderRadius: '8px',
        background: 'rgba(212,175,100,0.06)',
      }}>
        <strong style={{ display: 'block', color: 'var(--color-gold)', marginBottom: '0.35rem' }}>Prioridad MVP</strong>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.9rem' }}>
          Primero cerrar arte frontal, reversos renderizables y contenido completo. La landing se activa por mazo cuando el checklist queda verde.
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        {decks.length === 0 && (
          <div style={{
            padding: '1.5rem',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            background: 'var(--color-surface)',
          }}>
            <h2 style={{ marginTop: 0 }}>No hay decks cargados</h2>
            <p style={{ opacity: 0.7 }}>Creá una edición nueva o sincronizá el deck-engine antes de preparar la publicación digital.</p>
            <Link to="/admin/generate" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
              Crear edición
            </Link>
          </div>
        )}

        {decks.map(({ id, deck }) => {
          const readiness = getDeckPublicationReadiness(deck);
          const firstBlocker = readiness.blockers[0];

          return (
          <div key={id} style={{ 
            padding: '1.5rem', 
            border: '1px solid rgba(255,255,255,0.1)', 
            borderRadius: '8px',
            background: 'var(--color-surface)',
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0 }}>{deck.name}</h2>
              <div style={{ opacity: 0.5, fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {deck.card_count} cards • {deck.metadata.topic}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.9rem' }}>
                {getDashboardReadinessItems(deck).map(item => (
                  <ReadinessChip key={item.label} item={item} />
                ))}
              </div>
              {!readiness.isPublishable && firstBlocker && (
                <p style={{ margin: '0.75rem 0 0', color: '#fca5a5', fontSize: '0.82rem' }}>
                  Próximo bloqueo: {firstBlocker.label} ({firstBlocker.detail}).
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link to={`/admin/${id}`} className="btn-primary" style={{ textDecoration: 'none' }}>
                Abrir estudio
              </Link>
              {deck.digital?.is_published ? (
                <Link to={`/decks/${deck.slug}`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                  Ver landing
                </Link>
              ) : readiness.isPublishable ? (
                <Link to={`/admin/${id}?studio=output`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                  Activar landing
                </Link>
              ) : (
                <span
                  className="btn-ghost"
                  style={{
                    textDecoration: 'none',
                    opacity: 0.45,
                    cursor: 'not-allowed',
                  }}
                  title={firstBlocker ? firstBlocker.detail : 'Completar el checklist para activar la landing'}
                >
                  Landing bloqueada
                </span>
              )}
              <Link to={`/admin/${id}?studio=design`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                Diseño del mazo
              </Link>
              <Link to={`/admin/${id}?studio=output`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                Publicar / PDF
              </Link>
            </div>
          </div>
          );
        })}
      </div>

      <div style={{
        marginTop: '2rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ opacity: 0.55, fontSize: '0.8rem' }}>Laboratorio interno</span>
        <Link to="/admin/giro" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
          Giro landing
        </Link>
        <Link to="/admin/frames" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
          Frames
        </Link>
        <Link to="/admin/tuckbox" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
          Tuck box
        </Link>
      </div>
      
      <div style={{ marginTop: '3rem' }}>
        <a href="/" style={{ color: 'var(--color-gold)' }}>&larr; Back to Public Site</a>
      </div>
    </div>
  );
}
