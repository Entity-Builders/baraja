type CardFace = 'front' | 'back';

interface DeckDesignerToolbarProps {
  activeFace: CardFace;
  cardHeight: number;
  cardWidth: number;
  hideGuides: boolean;
  saving: boolean;
  showTechnicalEditor: boolean;
  analyzing?: boolean;
  autoLayoutUnavailableReason?: string;
  onCardSizeChange: (width: number, height: number) => void;
  onFaceChange: (face: CardFace) => void;
  onAutoLayout?: () => void;
  onFocusBackgroundTools?: () => void;
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
  analyzing,
  autoLayoutUnavailableReason,
  onCardSizeChange,
  onFaceChange,
  onAutoLayout,
  onFocusBackgroundTools,
  onSave,
  onToggleGuides,
  onToggleTechnicalEditor,
}: DeckDesignerToolbarProps) {
  const matchedPreset = CARD_SIZE_PRESETS.find(preset => preset.w === cardWidth && preset.h === cardHeight);
  const selectValue = matchedPreset ? `${matchedPreset.w}x${matchedPreset.h}` : 'custom';
  const autoLayoutDisabled = analyzing || Boolean(autoLayoutUnavailableReason) || !onAutoLayout;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', background: '#131313', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.28rem',
            borderRadius: '8px',
            border: '1px solid rgba(96,165,250,0.28)',
            background: 'linear-gradient(135deg, rgba(96,165,250,0.12), rgba(212,175,100,0.1))',
          }}
        >
          <span
            style={{
              alignSelf: 'stretch',
              display: 'grid',
              placeItems: 'center',
              minWidth: '32px',
              padding: '0 0.35rem',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.08)',
              color: '#bfdbfe',
              fontSize: '0.68rem',
              fontWeight: 900,
              letterSpacing: '0.08em',
            }}
          >
            AI
          </span>
          <button
            onClick={onFocusBackgroundTools}
            disabled={!onFocusBackgroundTools}
            style={{
              background: onFocusBackgroundTools ? 'rgba(212,175,100,0.22)' : 'rgba(255,255,255,0.045)',
              border: `1px solid ${onFocusBackgroundTools ? 'rgba(212,175,100,0.46)' : 'rgba(255,255,255,0.13)'}`,
              color: onFocusBackgroundTools ? '#ffe2a0' : 'rgba(255,255,255,0.5)',
              padding: '0.52rem 0.78rem',
              borderRadius: '6px',
              cursor: onFocusBackgroundTools ? 'pointer' : 'not-allowed',
              fontSize: '0.76rem',
              fontWeight: 850,
              opacity: onFocusBackgroundTools ? 1 : 0.45,
            }}
          >
            Fondo contextual
          </button>
          <button
            onClick={onAutoLayout}
            disabled={autoLayoutDisabled}
            title={autoLayoutUnavailableReason || 'Recalcular posiciones, tamanos y legibilidad con AI'}
            style={{
              background: autoLayoutDisabled ? 'rgba(255,255,255,0.045)' : 'rgba(96,165,250,0.2)',
              border: `1px solid ${autoLayoutDisabled ? 'rgba(255,255,255,0.13)' : 'rgba(96,165,250,0.48)'}`,
              color: autoLayoutDisabled ? 'rgba(255,255,255,0.5)' : '#dbeafe',
              padding: '0.52rem 0.78rem',
              borderRadius: '6px',
              cursor: autoLayoutDisabled ? 'not-allowed' : 'pointer',
              fontSize: '0.76rem',
              fontWeight: 850,
              opacity: autoLayoutDisabled ? 0.62 : 1,
            }}
          >
            {analyzing ? 'Analizando...' : 'Texto + contraste'}
          </button>
        </div>
        <button
          onClick={onToggleTechnicalEditor}
          style={{ background: showTechnicalEditor ? 'rgba(212,175,100,0.14)' : 'transparent', border: `1px solid ${showTechnicalEditor ? 'var(--color-gold)' : '#444'}`, color: showTechnicalEditor ? 'var(--color-gold)' : '#ccc', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 650 }}
        >
          {showTechnicalEditor ? 'Vista limpia' : 'Editar posiciones'}
        </button>
        <button
          onClick={onToggleGuides}
          disabled={!showTechnicalEditor}
          title={showTechnicalEditor ? undefined : 'Las guías solo aparecen en Editar posiciones'}
          style={{
            background: hideGuides ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: `1px solid ${hideGuides ? 'rgba(255,255,255,0.22)' : '#444'}`,
            color: showTechnicalEditor ? '#ccc' : 'rgba(255,255,255,0.4)',
            padding: '0.4rem 0.8rem',
            borderRadius: '4px',
            cursor: showTechnicalEditor ? 'pointer' : 'not-allowed',
            fontSize: '0.75rem',
            opacity: showTechnicalEditor ? 1 : 0.58,
          }}
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
