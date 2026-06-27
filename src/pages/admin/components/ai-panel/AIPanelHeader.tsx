interface AIPanelHeaderProps {
  activeFieldCount: number;
  deckName: string;
  editionLabel: string;
  face: 'front' | 'back';
  heightMm: number;
  hiddenFieldCount: number;
  widthMm: number;
}

export function AIPanelHeader({
  activeFieldCount,
  deckName,
  editionLabel,
  face,
  heightMm,
  hiddenFieldCount,
  widthMm,
}: AIPanelHeaderProps) {
  return (
    <>
      <div>
        <p style={{ margin: '0 0 0.35rem', color: '#d4af64', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Diseño global del mazo
        </p>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          Fondo para {face === 'front' ? 'frente' : 'dorso'}
        </h2>
        <p style={{ margin: '0.4rem 0 0', opacity: 0.58, fontSize: '0.75rem', lineHeight: 1.45 }}>
          Los cambios de fondo se aplican a todas las cartas del mazo en la cara activa. Usá la navegación para revisar contenido real antes de guardar/exportar.
        </p>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '0.65rem 0.75rem', fontSize: '0.75rem', opacity: 0.82 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span><strong>{deckName || editionLabel}</strong></span>
          <span>{widthMm}×{heightMm}mm</span>
        </div>
        <div style={{ marginTop: '0.35rem', opacity: 0.72 }}>
          {activeFieldCount} campos activos
          {hiddenFieldCount > 0 && (
            <span style={{ marginLeft: '0.4rem', color: '#f59e0b', fontSize: '0.65rem' }}>
              ({hiddenFieldCount} ocultos)
            </span>
          )}
        </div>
      </div>
    </>
  );
}
