type CardFace = 'front' | 'back';

interface DeckDesignerToolbarProps {
  activeFace: CardFace;
  cardHeight: number;
  cardWidth: number;
  hideGuides: boolean;
  saving: boolean;
  showTechnicalEditor: boolean;
  onCardSizeChange: (width: number, height: number) => void;
  onFaceChange: (face: CardFace) => void;
  onSave: () => void;
  onToggleGuides: () => void;
  onToggleTechnicalEditor: () => void;
}

const CARD_SIZE_PRESETS = [
  { label: '⭐ 6×9', w: 60, h: 90, cost: '🆓', note: 'Matriz existente — sin costo de troquel' },
  { label: 'Poker', w: 63, h: 88, cost: '💲', note: 'Estándar universal' },
  { label: 'Bridge', w: 57, h: 89, cost: '💲', note: 'Clásico angosto' },
  { label: 'TCG', w: 63.5, h: 88.9, cost: '💲', note: 'MTG / Pokémon' },
  { label: 'Tarot', w: 70, h: 120, cost: '💲💲', note: 'Grande vertical' },
  { label: 'Mini', w: 44, h: 67, cost: '💲💲', note: 'Compacto portátil' },
  { label: 'Square', w: 70, h: 70, cost: '💲💲💲', note: 'Formato cuadrado' },
  { label: 'Jumbo', w: 89, h: 127, cost: '💲💲💲', note: 'Formato grande' },
];

export function DeckDesignerToolbar({
  activeFace,
  cardHeight,
  cardWidth,
  hideGuides,
  saving,
  showTechnicalEditor,
  onCardSizeChange,
  onFaceChange,
  onSave,
  onToggleGuides,
  onToggleTechnicalEditor,
}: DeckDesignerToolbarProps) {
  const matchedPreset = CARD_SIZE_PRESETS.find(preset => preset.w === cardWidth && preset.h === cardHeight);
  const selectValue = matchedPreset ? `${matchedPreset.w}x${matchedPreset.h}` : 'custom';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#131313', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', gap: '0.5rem', background: '#000', padding: '4px', borderRadius: '6px' }}>
        {(['front', 'back'] as const).map(face => (
          <button
            key={face}
            onClick={() => onFaceChange(face)}
            style={{
              padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.75rem',
              background: activeFace === face ? 'var(--color-gold)' : 'transparent',
              color: activeFace === face ? '#000' : '#888',
            }}
          >
            {face === 'front' ? '🖼️ FRENTE' : '📝 DORSO'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tamaño:</span>
        <select
          value={selectValue}
          onChange={event => {
            if (event.target.value === 'custom') return;
            const [sw, sh] = event.target.value.split('x').map(Number);
            onCardSizeChange(sw, sh);
          }}
          style={{
            background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
            padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer',
            outline: 'none', maxWidth: '200px',
          }}
        >
          {CARD_SIZE_PRESETS.map(preset => (
            <option key={`${preset.w}x${preset.h}`} value={`${preset.w}x${preset.h}`}>
              {preset.label} — {preset.w}×{preset.h}mm {preset.cost}
            </option>
          ))}
          <option value="custom">✏️ Personalizado</option>
        </select>

        {selectValue === 'custom' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <input
              type="number"
              value={cardWidth}
              onChange={event => onCardSizeChange(Number(event.target.value) || 0, cardHeight)}
              style={{
                background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.12)',
                padding: '0.3rem 0.4rem', borderRadius: '4px 0 0 4px', fontSize: '0.75rem', width: '48px', textAlign: 'center',
                outline: 'none',
              }}
            />
            <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', padding: '0.3rem 0.25rem', fontSize: '0.75rem' }}>×</span>
            <input
              type="number"
              value={cardHeight}
              onChange={event => onCardSizeChange(cardWidth, Number(event.target.value) || 0)}
              style={{
                background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.12)',
                padding: '0.3rem 0.4rem', borderRadius: '0 4px 4px 0', fontSize: '0.75rem', width: '48px', textAlign: 'center',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginLeft: '2px' }}>mm</span>
          </div>
        ) : matchedPreset ? (
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>{matchedPreset.note}</span>
        ) : null}
      </div>

      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={onToggleTechnicalEditor}
          style={{ background: showTechnicalEditor ? 'rgba(212,175,100,0.14)' : 'transparent', border: `1px solid ${showTechnicalEditor ? 'var(--color-gold)' : '#444'}`, color: showTechnicalEditor ? 'var(--color-gold)' : '#ccc', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 650 }}
        >
          {showTechnicalEditor ? 'Vista limpia' : 'Editar posiciones'}
        </button>
        <button
          onClick={onToggleGuides}
          disabled={!showTechnicalEditor}
          style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          {hideGuides ? 'Mostrar guías' : 'Ocultar guías'}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ background: 'var(--color-gold)', color: '#000', border: 'none', padding: '0.4rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
        >
          {saving ? 'Guardando...' : 'Guardar layout'}
        </button>
      </div>
    </div>
  );
}
