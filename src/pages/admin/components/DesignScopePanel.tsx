interface DesignScopePanelProps {
  activeFace: 'front' | 'back';
  activeCardIndex: number;
  totalCards: number;
  cardWidth: number;
  cardHeight: number;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}

export function DesignScopePanel({
  activeFace,
  activeCardIndex,
  totalCards,
  cardWidth,
  cardHeight,
  showAdvanced,
  onToggleAdvanced,
}: DesignScopePanelProps) {
  return (
    <section
      style={{
        background: 'linear-gradient(135deg, rgba(212,175,100,0.12), rgba(255,255,255,0.035))',
        border: '1px solid rgba(212,175,100,0.24)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.25rem', color: '#f3d58c', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Cambios globales
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.68)', fontSize: '0.76rem', lineHeight: 1.45 }}>
          Lo que ajustes acá se aplica como diseño base del mazo. La carta visible es una muestra para revisar el resultado con contenido real.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
        <ScopeMetric label="Cara activa" value={activeFace === 'front' ? 'Frente' : 'Dorso'} />
        <ScopeMetric label="Carta muestra" value={totalCards > 0 ? `${activeCardIndex + 1}/${totalCards}` : '--'} />
        <ScopeMetric label="Tamaño" value={`${cardWidth}×${cardHeight}mm`} />
        <ScopeMetric label="Alcance" value="Todo el mazo" />
      </div>

      <button
        type="button"
        onClick={onToggleAdvanced}
        style={{
          width: '100%',
          background: showAdvanced ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.14)',
          color: showAdvanced ? 'white' : 'rgba(255,255,255,0.72)',
          borderRadius: '6px',
          padding: '0.5rem 0.7rem',
          cursor: 'pointer',
          fontSize: '0.78rem',
          fontWeight: 650,
        }}
      >
        {showAdvanced ? 'Ocultar herramientas avanzadas' : 'Mostrar herramientas avanzadas'}
      </button>
    </section>
  );
}

export function ScopeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding: '0.55rem',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>
        {value}
      </div>
    </div>
  );
}
