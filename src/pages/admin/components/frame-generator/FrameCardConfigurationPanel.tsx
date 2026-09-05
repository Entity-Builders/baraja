import { DECKS, type BarajaTemplateMetadata, type CardType, type DeckId } from '@entity-builders/deck-engine';
import { inputStyle, labelStyle, sectionStyle, selectStyle } from '../../frameGeneratorStyles';

interface FrameCardConfigurationPanelProps {
  builderMetadata: BarajaTemplateMetadata;
  cardType: CardType;
  onAppendThemeInspiration: (label: string) => void;
  onCardTypeChange: (cardType: CardType) => void;
  onClearPrimaryColor: () => void;
  onClearThemeDescription: () => void;
  onEnhanceThemeDescription: () => void;
  onPrimaryColorChange: (color: string) => void;
  onSelectDeck: (deckId: DeckId) => void;
  onThemeDescriptionChange: (description: string) => void;
}

const THEME_INSPIRATION_CHIPS = [
  { label: 'Cyberpunk Neón', icon: '⚡' },
  { label: 'Acuarela Botánica', icon: '🌿' },
  { label: 'Retrofuturismo 80s', icon: '📼' },
  { label: 'Minimalismo Zen', icon: '🧘' },
  { label: 'Gótico Oscuro', icon: '🦇' },
  { label: 'Bauhaus Geométrico', icon: '📐' },
  { label: 'Pop Art', icon: '💥' },
  { label: 'Rococó Elegante', icon: '👑' },
];

const CARD_TYPE_OPTIONS = [
  { id: 'therapeutic', label: '🧘 Terapéutica', hint: 'Ejercicios / regulación' },
  { id: 'trivia', label: '🎯 Trivia', hint: 'Preguntas y respuestas' },
  { id: 'party', label: '🎉 Fiesta', hint: 'Social / irreverente' },
  { id: 'game', label: '🎲 Juego', hint: 'Mecánicas / reglas' },
  { id: 'custom', label: '✍️ Custom', hint: 'Personalizado' },
] as const satisfies ReadonlyArray<{ id: CardType; label: string; hint: string }>;

export function FrameCardConfigurationPanel({
  builderMetadata,
  cardType,
  onAppendThemeInspiration,
  onCardTypeChange,
  onClearPrimaryColor,
  onClearThemeDescription,
  onEnhanceThemeDescription,
  onPrimaryColorChange,
  onSelectDeck,
  onThemeDescriptionChange,
}: FrameCardConfigurationPanelProps) {
  return (
    <section style={sectionStyle}>
      <label style={labelStyle}>Configuración de Carta</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <DeckAutofillControl onSelectDeck={onSelectDeck} />

        <ThemeDescriptionControl
          themeDescription={builderMetadata.themeDescription}
          onAppendThemeInspiration={onAppendThemeInspiration}
          onClearThemeDescription={onClearThemeDescription}
          onEnhanceThemeDescription={onEnhanceThemeDescription}
          onThemeDescriptionChange={onThemeDescriptionChange}
        />

        <CardTypeControl
          cardType={cardType}
          onCardTypeChange={onCardTypeChange}
        />

        <PrimaryColorControl
          primaryColorHex={builderMetadata.primaryColorHex}
          onClearPrimaryColor={onClearPrimaryColor}
          onPrimaryColorChange={onPrimaryColorChange}
        />
      </div>
    </section>
  );
}

interface DeckAutofillControlProps {
  onSelectDeck: (deckId: DeckId) => void;
}

function DeckAutofillControl({ onSelectDeck }: DeckAutofillControlProps) {
  return (
    <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'block', marginBottom: '0.4rem' }}>Autocompletar desde Baraja</label>
      <select
        style={{ ...selectStyle, cursor: 'pointer' }}
        onChange={e => {
          const deckId = e.target.value as DeckId;
          if (deckId) onSelectDeck(deckId);
        }}
        defaultValue=""
      >
        <option value="" disabled>-- Seleccionar Baraja --</option>
        {Object.keys(DECKS).map(key => (
          <option key={key} value={key}>{DECKS[key as DeckId].name}</option>
        ))}
      </select>
    </div>
  );
}

interface ThemeDescriptionControlProps {
  themeDescription: string;
  onAppendThemeInspiration: (label: string) => void;
  onClearThemeDescription: () => void;
  onEnhanceThemeDescription: () => void;
  onThemeDescriptionChange: (description: string) => void;
}

function ThemeDescriptionControl({
  themeDescription,
  onAppendThemeInspiration,
  onClearThemeDescription,
  onEnhanceThemeDescription,
  onThemeDescriptionChange,
}: ThemeDescriptionControlProps) {
  return (
    <div>
      <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span>Temática visual (Gemini Art Director)</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onEnhanceThemeDescription}
            style={{ background: 'var(--color-gold)', border: 'none', color: '#111', fontSize: '0.65rem', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}
            title="Enriquecer prompt visualmente"
          >
            🪄 Enhance
          </button>
          <button
            onClick={onClearThemeDescription}
            style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '0.65rem', cursor: 'pointer', padding: 0, opacity: 0.8 }}
          >
            Limpiar
          </button>
        </div>
      </label>
      <textarea
        value={themeDescription}
        onChange={e => onThemeDescriptionChange(e.target.value)}
        style={{ ...inputStyle, resize: 'vertical', minHeight: '65px' }}
        placeholder="Ej: Trivia de cine, energía de sala de cine vintage..."
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
        {THEME_INSPIRATION_CHIPS.map(chip => (
          <button
            key={chip.label}
            onClick={() => onAppendThemeInspiration(chip.label)}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              borderRadius: '16px',
              padding: '0.2rem 0.6rem',
              fontSize: '0.65rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              transition: 'all 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            <span>{chip.icon}</span> {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CardTypeControlProps {
  cardType: CardType;
  onCardTypeChange: (cardType: CardType) => void;
}

function CardTypeControl({ cardType, onCardTypeChange }: CardTypeControlProps) {
  return (
    <div>
      <label style={{ fontSize: '0.7rem', opacity: 0.5, display: 'block', marginBottom: '0.4rem' }}>Tipo de Carta</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
        {CARD_TYPE_OPTIONS.map(option => (
          <button
            key={option.id}
            onClick={() => onCardTypeChange(option.id)}
            title={option.hint}
            style={{
              padding: '0.45rem 0.5rem',
              borderRadius: '6px',
              border: `1px solid ${cardType === option.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
              background: cardType === option.id ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
              color: cardType === option.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.55)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              textAlign: 'left',
              transition: 'all 0.15s',
              ...(option.id === 'custom' ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PrimaryColorControlProps {
  primaryColorHex?: string;
  onClearPrimaryColor: () => void;
  onPrimaryColorChange: (color: string) => void;
}

function PrimaryColorControl({
  primaryColorHex,
  onClearPrimaryColor,
  onPrimaryColorChange,
}: PrimaryColorControlProps) {
  return (
    <div>
      <label style={{ fontSize: '0.7rem', opacity: 0.5 }}>Color Principal (Opcional)</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="color"
          value={primaryColorHex || '#FFD700'}
          onChange={e => onPrimaryColorChange(e.target.value)}
          style={{ width: '32px', height: '32px', padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
        />
        <input
          type="text"
          value={primaryColorHex || ''}
          onChange={e => onPrimaryColorChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Ej: #FFD700"
        />
        <button
          onClick={onClearPrimaryColor}
          style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
          title="Limpiar color"
        >
          X
        </button>
      </div>
    </div>
  );
}
