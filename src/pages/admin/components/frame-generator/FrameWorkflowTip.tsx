export function FrameWorkflowTip() {
  return (
    <div style={{
      padding: '1rem 1.25rem',
      background: 'rgba(201,168,92,0.05)',
      border: '1px solid rgba(201,168,92,0.15)',
      borderRadius: '10px',
      fontSize: '0.78rem',
      lineHeight: 1.6,
      opacity: 0.7,
    }}>
      <strong style={{ color: 'var(--color-gold)' }}>💡 Workflow sugerido:</strong>
      <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
        <li>Elegí un preset y generá varios hasta encontrar el estilo correcto</li>
        <li>Usá el historial para comparar variaciones</li>
        <li>Hacé click en <em>"Set as Active Frame"</em> para guardarlo</li>
        <li>El frame reemplaza <code>/public/frames/{'{face}'}-frame.png</code></li>
      </ol>
    </div>
  );
}
