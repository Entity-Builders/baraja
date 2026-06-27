import { Link } from 'react-router-dom';

export function GenerateEditionHeader() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <Link to="/admin" style={{ color: 'var(--color-gold)', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem' }}>
        ← All Editions
      </Link>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 400 }}>
        Generate New Edition
      </h1>
      <p style={{ opacity: 0.5, marginTop: '0.5rem', fontSize: '0.9rem' }}>
        Configure your deck parameters, enrich with external data, preview the prompt, then generate.
      </p>
    </div>
  );
}
