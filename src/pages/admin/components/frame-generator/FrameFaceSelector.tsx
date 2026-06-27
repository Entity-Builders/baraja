import { labelStyle, sectionStyle } from '../../frameGeneratorStyles';

interface FrameFaceSelectorProps {
  face: 'front' | 'back';
  onFaceChange: (face: 'front' | 'back') => void;
}

export function FrameFaceSelector({ face, onFaceChange }: FrameFaceSelectorProps) {
  return (
    <section style={sectionStyle}>
      <label style={labelStyle}>Cara de la carta</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['back', 'front'] as const).map(nextFace => (
          <button
            key={nextFace}
            onClick={() => onFaceChange(nextFace)}
            style={{
              flex: 1,
              padding: '0.6rem',
              borderRadius: '6px',
              border: `1px solid ${face === nextFace ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}`,
              background: face === nextFace ? 'rgba(201,168,92,0.15)' : 'rgba(255,255,255,0.03)',
              color: face === nextFace ? 'var(--color-gold)' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.15s',
            }}
          >
            {nextFace === 'back' ? '🔄 Reverso' : '🃏 Frente'}
          </button>
        ))}
      </div>
    </section>
  );
}
