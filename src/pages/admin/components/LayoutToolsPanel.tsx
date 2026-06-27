import { FieldVisibilityMenu } from '../features/deck-studio/FieldVisibilityMenu';

interface LayoutToolsPanelProps {
  hiddenFields: Record<string, boolean>;
  analyzing: boolean;
  onFieldChange: (newFields: Record<string, boolean>) => void;
  onAutoLayout: () => void;
}

export function LayoutToolsPanel({
  hiddenFields,
  analyzing,
  onFieldChange,
  onAutoLayout,
}: LayoutToolsPanelProps) {
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '0.85rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.25rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Layout global
        </p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', fontSize: '0.74rem', lineHeight: 1.45 }}>
          Ajustá campos, guías y distribución general. Estos cambios afectan la plantilla del mazo, no una carta suelta.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <FieldVisibilityMenu
          hiddenFields={hiddenFields}
          onFieldChange={onFieldChange}
        />

        <button
          onClick={onAutoLayout}
          disabled={analyzing}
          style={{
            width: '100%',
            background: analyzing ? '#444' : 'linear-gradient(135deg, #2a2a2a, #111)',
            border: '1px solid rgba(255,255,255,0.18)',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            color: 'white',
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 650,
          }}
        >
          {analyzing ? 'Analizando layout...' : 'Sugerir auto-layout'}
        </button>
      </div>
    </section>
  );
}
