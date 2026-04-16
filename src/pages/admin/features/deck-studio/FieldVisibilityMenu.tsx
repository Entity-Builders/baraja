import React, { useState } from 'react';

const FIELD_OPTIONS = [
  { key: 'player_count', label: 'Ctd. Jugadores (en When)' },
  { key: 'brand',        label: 'Marca / Nombre Mazo' },
  { key: 'qr',          label: 'Código QR' },
  { key: 'when_to_use', label: 'Box: Cuándo Usar' },
  { key: 'phrase',      label: 'Box: Frase Principal' },
  { key: 'instruction', label: 'Box: Instrucción' },
  { key: 'fun_fact',    label: 'Box: Fun Fact' },
  { key: 'answer',      label: 'Box: Respuesta' },
] as const;

interface FieldVisibilityMenuProps {
  hiddenFields: Record<string, boolean>;
  onFieldChange: (newFields: Record<string, boolean>) => void;
}

export function FieldVisibilityMenu({ hiddenFields, onFieldChange }: FieldVisibilityMenuProps) {
  const [open, setOpen] = useState(false);

  const activeCount = FIELD_OPTIONS.filter(f => !hiddenFields[f.key]).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          background: '#222', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
          color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}
      >
        👁️ Campos ({activeCount}/{FIELD_OPTIONS.length})
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', right: 0,
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
          padding: '1rem', borderRadius: '8px', zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', width: '240px',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#d4af64' }}>Campos Activos</h4>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.65rem', opacity: 0.5, lineHeight: 1.3 }}>
            Desmarcá un campo para ocultarlo del diseño y la impresión.
          </p>
          {FIELD_OPTIONS.map(field => {
            const isActive = !hiddenFields[field.key];
            return (
              <label
                key={field.key}
                style={{
                  fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  cursor: 'pointer', opacity: isActive ? 1 : 0.45,
                }}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => {
                    // Inverted: unchecked → hidden=true, checked → hidden=false
                    onFieldChange({ ...hiddenFields, [field.key]: !e.target.checked });
                  }}
                />
                {field.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
