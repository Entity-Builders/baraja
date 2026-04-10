import { Link } from 'react-router-dom';
import { useAllDecks } from '../../hooks/useAllDecks';

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
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1>Baraja Admin</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/admin/frames" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            🖼️ Frames
          </Link>
          <Link to="/admin/templates" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            🎨 Templates
          </Link>
          <Link to="/admin/generate" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            🃏 Generate New Edition
          </Link>
        </div>
      </div>
      <p style={{ opacity: 0.7 }}>Manage your decks and generate print-ready PDFs.</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        {decks.map(({ id, deck }) => (
          <div key={id} style={{ 
            padding: '1.5rem', 
            border: '1px solid rgba(255,255,255,0.1)', 
            borderRadius: '8px',
            background: 'var(--color-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0 }}>{deck.name}</h2>
              <div style={{ opacity: 0.5, fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {deck.card_count} cards • {deck.metadata.topic}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to={`/admin/${id}`} className="btn-primary" style={{ textDecoration: 'none' }}>
                Edit
              </Link>
              <Link to={`/admin/${id}/print`} className="btn-ghost" style={{ textDecoration: 'none' }}>
                Print PDF
              </Link>
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: '3rem' }}>
        <a href="/" style={{ color: 'var(--color-gold)' }}>&larr; Back to Public Site</a>
      </div>
    </div>
  );
}
