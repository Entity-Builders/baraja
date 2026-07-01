import { FieldVisibilityMenu } from '../features/deck-studio/FieldVisibilityMenu';

interface LayoutToolsPanelProps {
  hiddenFields: Record<string, boolean>;
  analyzing: boolean;
  autoLayoutUnavailableReason?: string;
  onFieldChange: (newFields: Record<string, boolean>) => void;
  onAutoLayout: () => void;
}

export function LayoutToolsPanel({
  hiddenFields,
  analyzing,
  autoLayoutUnavailableReason,
  onFieldChange,
  onAutoLayout,
}: LayoutToolsPanelProps) {
  const autoLayoutDisabled = analyzing || Boolean(autoLayoutUnavailableReason);

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
          disabled={autoLayoutDisabled}
          title={autoLayoutUnavailableReason}
          style={{
            width: '100%',
            background: autoLayoutDisabled ? '#333' : 'linear-gradient(135deg, #2a2a2a, #111)',
            border: '1px solid rgba(255,255,255,0.18)',
            cursor: autoLayoutDisabled ? 'not-allowed' : 'pointer',
            color: autoLayoutDisabled ? 'rgba(255,255,255,0.52)' : 'white',
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 650,
          }}
        >
          {analyzing ? 'Analizando layout...' : 'Sugerir auto-layout'}
        </button>
        {autoLayoutUnavailableReason ? (
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.44)', fontSize: '0.68rem', lineHeight: 1.35 }}>
            {autoLayoutUnavailableReason}
          </p>
        ) : null}
      </div>
    </section>
  );
}
