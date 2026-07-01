import {
  CARD_FIELD_DEFINITIONS,
  type FieldPlacementMap,
} from '../../../lib/cardFieldPlacements';
import type { CardFieldState } from './cardFieldInventory';

const statusCopy: Record<CardFieldState['status'], string> = {
  visible: 'Visible',
  hidden: 'Oculto',
  missing: 'Falta',
  base: 'Base',
};

const statusTone: Record<CardFieldState['status'], { border: string; background: string; color: string }> = {
  visible: { border: 'rgba(53,208,127,0.34)', background: 'rgba(53,208,127,0.09)', color: '#7ee3aa' },
  hidden: { border: 'rgba(255,255,255,0.13)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)' },
  missing: { border: 'rgba(248,113,113,0.34)', background: 'rgba(248,113,113,0.09)', color: '#fca5a5' },
  base: { border: 'rgba(212,175,100,0.34)', background: 'rgba(212,175,100,0.09)', color: '#f3d58c' },
};

export function CardFieldInventoryPanel({
  activeFace,
  frontFields,
  backFields,
}: {
  activeFace: 'front' | 'back';
  frontFields: CardFieldState[];
  backFields: CardFieldState[];
}) {
  const frontCounts = getFieldCounts(frontFields);
  const backCounts = getFieldCounts(backFields);
  const faceGroups = activeFace === 'back'
    ? [
        { key: 'back', label: 'Dorso', fields: backFields, counts: backCounts },
        { key: 'front', label: 'Frente', fields: frontFields, counts: frontCounts },
      ]
    : [
        { key: 'front', label: 'Frente', fields: frontFields, counts: frontCounts },
        { key: 'back', label: 'Dorso', fields: backFields, counts: backCounts },
      ];

  return (
    <div>
      <div style={{ marginBottom: '0.45rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Campos de la carta actual
      </div>
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        {faceGroups.map(group => (
          <CardFaceFieldGroup
            key={group.key}
            label={group.label}
            active={activeFace === group.key}
            fields={group.fields}
            counts={group.counts}
          />
        ))}
      </div>
    </div>
  );
}

const placementLabel: Record<'front' | 'back' | 'hidden', string> = {
  front: 'Frente',
  back: 'Dorso',
  hidden: 'Oculto',
};

const placementTone: Record<'front' | 'back' | 'hidden', { border: string; bg: string; color: string }> = {
  front: { border: 'rgba(53,208,127,0.34)', bg: 'rgba(53,208,127,0.1)', color: '#86efac' },
  back: { border: 'rgba(212,175,100,0.34)', bg: 'rgba(212,175,100,0.1)', color: '#f3d58c' },
  hidden: { border: 'rgba(255,255,255,0.14)', bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)' },
};

export function FieldPlacementPanel({
  placements,
  onChange,
}: {
  placements: FieldPlacementMap;
  onChange: (placements: FieldPlacementMap) => void;
}) {
  const counts = {
    front: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'front').length,
    back: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'back').length,
    hidden: CARD_FIELD_DEFINITIONS.filter(field => placements[field.key] === 'hidden').length,
  };

  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.7rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.24rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Campos y caras
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '0.73rem', lineHeight: 1.45 }}>
          Mové qué información vive en frente, dorso u oculto. Después ajustá posición en el canvas y guardá el layout.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
        {(['front', 'back', 'hidden'] as const).map(placement => {
          const tone = placementTone[placement];
          return (
            <div
              key={placement}
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                borderRadius: '7px',
                padding: '0.45rem 0.25rem',
                textAlign: 'center',
              }}
            >
              <div style={{ color: tone.color, fontSize: '0.68rem', fontWeight: 800 }}>
                {placementLabel[placement]}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.8rem', fontWeight: 850 }}>
                {counts[placement]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {CARD_FIELD_DEFINITIONS.map(field => (
          <div
            key={field.key}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.16)',
              borderRadius: '7px',
              padding: '0.55rem',
              display: 'grid',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.76rem', fontWeight: 800 }}>
                {field.label}
              </span>
              <span style={{ color: placementTone[placements[field.key]].color, fontSize: '0.66rem', fontWeight: 800 }}>
                {placementLabel[placements[field.key]]}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.3rem' }}>
              {(['front', 'back', 'hidden'] as const).map(placement => {
                const active = placements[field.key] === placement;
                const tone = placementTone[placement];
                return (
                  <button
                    key={placement}
                    type="button"
                    onClick={() => onChange({ ...placements, [field.key]: placement })}
                    style={{
                      minHeight: '30px',
                      border: `1px solid ${active ? tone.border : 'rgba(255,255,255,0.09)'}`,
                      background: active ? tone.bg : 'rgba(255,255,255,0.025)',
                      color: active ? tone.color : 'rgba(255,255,255,0.5)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                    }}
                  >
                    {placementLabel[placement]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function getFieldCounts(fields: CardFieldState[]) {
  return {
    visible: fields.filter(field => field.status === 'visible' || field.status === 'base').length,
    hidden: fields.filter(field => field.status === 'hidden').length,
    missing: fields.filter(field => field.status === 'missing').length,
  };
}

function CardFaceFieldGroup({
  label,
  active,
  fields,
  counts,
}: {
  label: string;
  active: boolean;
  fields: CardFieldState[];
  counts: { visible: number; hidden: number; missing: number };
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? 'rgba(212,175,100,0.32)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(212,175,100,0.06)' : 'rgba(0,0,0,0.16)',
        borderRadius: '7px',
        padding: '0.62rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.46rem' }}>
        <span style={{ color: active ? '#f3d58c' : 'rgba(255,255,255,0.72)', fontSize: '0.74rem', fontWeight: 800 }}>
          {label}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.66rem' }}>
          {counts.visible} ok · {counts.hidden} ocultos · {counts.missing} falta
        </span>
      </div>

      <div style={{ display: 'grid', gap: '0.34rem' }}>
        {fields.map(field => (
          <CardFieldRow key={`${label}-${field.label}`} field={field} />
        ))}
      </div>
    </div>
  );
}

function CardFieldRow({ field }: { field: CardFieldState }) {
  const tone = statusTone[field.status];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '5.3rem 3.4rem 1fr',
        gap: '0.38rem',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {field.label}
      </span>
      <span
        style={{
          border: `1px solid ${tone.border}`,
          background: tone.background,
          color: tone.color,
          borderRadius: '999px',
          padding: '0.16rem 0.34rem',
          fontSize: '0.58rem',
          lineHeight: 1,
          textAlign: 'center',
          fontWeight: 800,
          textTransform: 'uppercase',
        }}
      >
        {statusCopy[field.status]}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {field.value}
      </span>
    </div>
  );
}
