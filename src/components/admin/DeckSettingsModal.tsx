import React, { useState, useMemo } from 'react';
import { DESIGN_TEMPLATES, PRINT_SPECS } from '@eb-packages/deck-engine';
import type {
  DeckSchema,
  PrintSpecs,
  DeckDesign,
  DesignTemplateId,
  PrintSpecId,
} from '@eb-packages/deck-engine';
import { CardCanvas } from '../cards/CardCanvas';
import { SupabaseDeckRepository } from '../../lib/deckRepository';

const deckRepo = new SupabaseDeckRepository();

interface DeckSettingsModalProps {
  deck: DeckSchema;
  onClose: () => void;
}

export function DeckSettingsModal({ deck, onClose }: DeckSettingsModalProps) {
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // Local state for presets
  const [designTemplateId, setDesignTemplateId] = useState(
    deck.design?.template_id || 'dark-minimal-01',
  );

  const initialPrintSpecId =
    Object.keys(PRINT_SPECS).find(
      (k) =>
        PRINT_SPECS[k as keyof typeof PRINT_SPECS].dimensions.width ===
        deck.print_specs.dimensions.width,
    ) || 'baraja-standard';
  const [printSpecId, setPrintSpecId] = useState(initialPrintSpecId);

  // Local state for Overrides
  const [printOverrides, setPrintOverrides] = useState<Partial<PrintSpecs>>(
    deck.print_specs_overrides || {},
  );
  const [designOverrides, setDesignOverrides] = useState<Partial<DeckDesign>>(
    deck.design_template_overrides || {},
  );

  // Calculated Live Deck
  const liveDeck = useMemo((): DeckSchema => {
    const basePrint =
      PRINT_SPECS[printSpecId as keyof typeof PRINT_SPECS] ||
      PRINT_SPECS['baraja-standard'];
    const baseDesign =
      DESIGN_TEMPLATES[designTemplateId as keyof typeof DESIGN_TEMPLATES] ||
      DESIGN_TEMPLATES['dark-minimal-01'];

    return {
      ...deck,
      print_specs: { ...basePrint, ...printOverrides },
      design: { ...baseDesign, ...designOverrides },
    };
  }, [deck, printSpecId, designTemplateId, printOverrides, designOverrides]);

  const currentPrint = liveDeck.print_specs;
  const currentDesign = liveDeck.design;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await deckRepo.updateDeckSettings(deck.slug || deck.id, {
        design_template_id: designTemplateId as DesignTemplateId,
        print_spec_id: printSpecId as PrintSpecId,
        print_specs_overrides: printOverrides,
        design_template_overrides: designOverrides,
      });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Network error while saving deck settings.');
    } finally {
      setSaving(false);
    }
  }

  // Helper for generating standard inputs
  const InputRow = ({ label, value, onChange, type = 'text', hint }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '0.5rem',
          borderRadius: '4px',
          fontSize: '0.9rem',
          width: '100%',
        }}
      />
      {hint && (
        <span
          style={{
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.4)',
            marginTop: 2,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );

  const sampleCard = deck.cards?.[0] || {
    id: 'sample',
    front: { title: 'Sample Card', number: 1, art_prompt: '' },
    back: {
      phrase: 'This is a sample.',
      when_to_use: 'Use me to check styling.',
      instruction: 'Look at the live preview.',
    },
    tags: [],
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: '1100px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '1.5rem 2rem',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
              Deck Settings & Overrides
            </h2>
            <p
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.9rem',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Base presets can be fine-tuned via numerical and stylistic
              overrides.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* LEFT: Controls */}
          <form
            id='settings-form'
            onSubmit={handleSave}
            style={{
              flex: '0 0 450px',
              padding: '2rem',
              overflowY: 'auto',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
            }}
          >
            {/* Print Section */}
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.1rem',
                    color: 'var(--color-gold)',
                  }}
                >
                  Physical & Print
                </h3>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <label
                  style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}
                >
                  Base Print Spec
                </label>
                <select
                  value={printSpecId}
                  onChange={(e) => {
                    setPrintSpecId(e.target.value);
                    setPrintOverrides({}); // reset overrides on preset change
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '0.6rem',
                    borderRadius: '4px',
                  }}
                >
                  {Object.keys(PRINT_SPECS).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                }}
              >
                <InputRow
                  label='Width (mm)'
                  type='number'
                  value={currentPrint.dimensions?.width}
                  onChange={(v: string) =>
                    setPrintOverrides((p) => ({
                      ...p,
                      dimensions: {
                        ...currentPrint.dimensions,
                        width: Number(v),
                      },
                    }))
                  }
                />
                <InputRow
                  label='Height (mm)'
                  type='number'
                  value={currentPrint.dimensions?.height}
                  onChange={(v: string) =>
                    setPrintOverrides((p) => ({
                      ...p,
                      dimensions: {
                        ...currentPrint.dimensions,
                        height: Number(v),
                      },
                    }))
                  }
                />
              </div>
              <InputRow
                label='Bleed (mm)'
                type='number'
                value={currentPrint.bleed}
                onChange={(v: string) =>
                  setPrintOverrides((p) => ({ ...p, bleed: Number(v) }))
                }
              />
            </section>

            {/* Design Section */}
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.1rem',
                    color: 'var(--color-gold)',
                  }}
                >
                  Design & Styling
                </h3>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <label
                  style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}
                >
                  Base Template
                </label>
                <select
                  value={designTemplateId}
                  onChange={(e) => {
                    setDesignTemplateId(e.target.value);
                    setDesignOverrides({}); // reset overrides on preset change
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '0.6rem',
                    borderRadius: '4px',
                  }}
                >
                  {Object.keys(DESIGN_TEMPLATES).map((key) => (
                    <option key={key} value={key}>
                      {
                        DESIGN_TEMPLATES[key as keyof typeof DESIGN_TEMPLATES]
                          .template_id
                      }
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                }}
              >
                <InputRow
                  label='Primary Color'
                  type='color'
                  value={currentDesign.primary_color}
                  onChange={(v: string) =>
                    setDesignOverrides((p) => ({ ...p, primary_color: v }))
                  }
                />
                <InputRow
                  label='Accent Color'
                  type='color'
                  value={currentDesign.accent_color}
                  onChange={(v: string) =>
                    setDesignOverrides((p) => ({ ...p, accent_color: v }))
                  }
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                }}
              >
                <InputRow
                  label='Text Color'
                  type='color'
                  value={currentDesign.text_color || '#ffffff'}
                  onChange={(v: string) =>
                    setDesignOverrides((p) => ({ ...p, text_color: v }))
                  }
                />
                <InputRow
                  label='Surface Color'
                  type='color'
                  value={currentDesign.surface_color || '#000000'}
                  onChange={(v: string) =>
                    setDesignOverrides((p) => ({ ...p, surface_color: v }))
                  }
                />
              </div>

              <InputRow
                label='Headings Font'
                value={currentDesign.font_heading}
                onChange={(v: string) =>
                  setDesignOverrides((p) => ({ ...p, font_heading: v }))
                }
                hint="E.g. 'Cormorant Garamond' (must exist via Google Fonts payload)"
              />
              <InputRow
                label='Body Font'
                value={currentDesign.font_body}
                onChange={(v: string) =>
                  setDesignOverrides((p) => ({ ...p, font_body: v }))
                }
              />
            </section>
          </form>

          {/* RIGHT: Live Preview */}
          <div
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <h4
              style={{
                margin: '0 0 1rem 0',
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 400,
              }}
            >
              Live Template Preview
            </h4>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div style={{ transform: 'scale(1.2)' }}>
                {/* Note: In a real environment, fonts might require a <link> tag injected. We assume index.html covers default fonts. */}
                <CardCanvas
                  deck={liveDeck}
                  card={sampleCard as any}
                  flipped={flipped}
                  onFlip={() => setFlipped(!flipped)}
                />
              </div>
            </div>
            <p
              style={{
                marginTop: '2rem',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.4)',
                textAlign: 'center',
              }}
            >
              Click the card to flip.
              <br />
              Size: {currentPrint.dimensions?.width}x
              {currentPrint.dimensions?.height}mm
            </p>
          </div>
        </div>

        {/* FOOTER Actions */}
        <div
          style={{
            padding: '1.5rem 2rem',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
          }}
        >
          <button
            type='button'
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type='submit'
            form='settings-form'
            disabled={saving}
            className='btn-primary'
            style={{
              padding: '0.75rem 2rem',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Confirm Overrides'}
          </button>
        </div>
      </div>
    </div>
  );
}
