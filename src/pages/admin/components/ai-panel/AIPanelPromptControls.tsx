import type { BarajaTemplateMetadata, CardType } from '@entity-builders/deck-engine';
import { CARD_TYPES, INSPIRATION_CHIPS } from './aiPanelConfig';
import {
  aiPanelDetailsStyle,
  aiPanelInputStyle,
  aiPanelSectionLabel,
  aiPanelSummaryStyle,
} from './aiPanelStyles';

interface AIPanelPromptControlsProps {
  builderMetadata: Partial<BarajaTemplateMetadata>;
  cardType: CardType;
  customConstraints: string;
  customPrompt: string;
  framePalette: 'dark' | 'light';
  onAppendThemeInspiration: (label: string) => void;
  onCardTypeChange: (cardType: CardType) => void;
  onCustomConstraintsChange: (value: string) => void;
  onCustomPromptChange: (value: string) => void;
  onEnhanceTheme: () => void;
  onFramePaletteChange: (palette: 'dark' | 'light') => void;
  onPrimaryColorChange: (value: string) => void;
  onResetPrimaryColor: () => void;
  onThemeDescriptionChange: (value: string) => void;
}

export function AIPanelPromptControls({
  builderMetadata,
  cardType,
  customConstraints,
  customPrompt,
  framePalette,
  onAppendThemeInspiration,
  onCardTypeChange,
  onCustomConstraintsChange,
  onCustomPromptChange,
  onEnhanceTheme,
  onFramePaletteChange,
  onPrimaryColorChange,
  onResetPrimaryColor,
  onThemeDescriptionChange,
}: AIPanelPromptControlsProps) {
  return (
    <>
      <div>
        <label style={aiPanelSectionLabel}>Idea visual del fondo</label>
        <textarea
          value={builderMetadata.themeDescription}
          onChange={e => onThemeDescriptionChange(e.target.value)}
          style={{ ...aiPanelInputStyle, resize: 'vertical', minHeight: '86px' }}
          placeholder="Ej: comedia romántica, colores vivos, marco festivo, zona central limpia para texto..."
        />
      </div>

      <details style={aiPanelDetailsStyle}>
        <summary style={aiPanelSummaryStyle}>
          Inspiración rápida
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.7rem' }}>
          {INSPIRATION_CHIPS.map(chip => (
            <button
              key={chip.label}
              onClick={() => onAppendThemeInspiration(chip.label)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.75)',
                fontSize: '0.62rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <span>{chip.icon}</span> {chip.label}
            </button>
          ))}

          <button
            onClick={onEnhanceTheme}
            style={{
              background: 'var(--color-gold)',
              border: 'none',
              color: '#111',
              fontSize: '0.62rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
            title="Enriquecer prompt visualmente"
          >
            Mejorar
          </button>
        </div>
      </details>

      <details style={aiPanelDetailsStyle}>
        <summary style={aiPanelSummaryStyle}>
          Tipo y reglas avanzadas
        </summary>
        <div style={{ marginTop: '0.8rem' }}>
          <label style={aiPanelSectionLabel}>Tipo de carta</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
            {CARD_TYPES.map(typeOption => (
              <button
                key={typeOption.id}
                onClick={() => onCardTypeChange(typeOption.id)}
                title={typeOption.hint}
                style={{
                  padding: '0.4rem 0.5rem',
                  borderRadius: '6px',
                  border: `1px solid ${cardType === typeOption.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                  background: cardType === typeOption.id ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                  color: cardType === typeOption.id ? 'var(--color-gold)' : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  textAlign: 'left',
                  ...(typeOption.id === 'custom' ? { gridColumn: '1 / -1' } : {}),
                }}
              >
                {typeOption.label}
              </button>
            ))}
          </div>
        </div>
      </details>

      <div>
        <label style={aiPanelSectionLabel}>Color Principal</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="color"
            value={builderMetadata.primaryColorHex || '#d4af64'}
            onChange={e => onPrimaryColorChange(e.target.value)}
            style={{ width: '32px', height: '32px', padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
          />
          <input
            type="text"
            value={builderMetadata.primaryColorHex || ''}
            onChange={e => onPrimaryColorChange(e.target.value)}
            style={{ ...aiPanelInputStyle, flex: 1 }}
            placeholder="Ej: #FFD700"
          />
          <button
            onClick={onResetPrimaryColor}
            style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
            title="Reset color"
          >
            ↺
          </button>
        </div>
      </div>

      <div>
        <label style={aiPanelSectionLabel}>Paleta de fondo</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['dark', 'light'] as const).map(palette => (
            <button
              key={palette}
              onClick={() => onFramePaletteChange(palette)}
              style={{
                flex: 1,
                padding: '0.4rem',
                borderRadius: '6px',
                border: `1px solid ${framePalette === palette ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
                background: framePalette === palette ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
                color: framePalette === palette ? 'var(--color-gold)' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              {palette === 'dark' ? '🌑 Oscura' : '☀️ Clara'}
            </button>
          ))}
        </div>
      </div>

      <details style={aiPanelDetailsStyle}>
        <summary style={aiPanelSummaryStyle}>
          Overrides de prompt
        </summary>
        <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.8rem' }}>
          <div>
            <label style={aiPanelSectionLabel}>Override Visual (opcional)</label>
            <textarea
              value={customPrompt}
              onChange={e => onCustomPromptChange(e.target.value)}
              style={{ ...aiPanelInputStyle, resize: 'vertical', minHeight: '40px' }}
              placeholder="Forzar imagen en una esquina, o custom prompt para Cajas..."
            />
          </div>

          <div>
            <label style={aiPanelSectionLabel}>Override Estructural (opcional)</label>
            <textarea
              value={customConstraints}
              onChange={e => onCustomConstraintsChange(e.target.value)}
              style={{ ...aiPanelInputStyle, resize: 'vertical', minHeight: '40px' }}
              placeholder="Sin bordes, zona inferior libre para texto largo..."
            />
          </div>
        </div>
      </details>
    </>
  );
}
