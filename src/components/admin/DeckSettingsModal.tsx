import React, { useState, useMemo, useEffect } from 'react';
import { DESIGN_TEMPLATES, PRINT_SPECS } from '@eb-packages/deck-engine';
import type {
  DeckSchema,
  PrintSpecs,
  DeckDesign,
  DesignTemplateId,
  PrintSpecId,
} from '@eb-packages/deck-engine';
import { CardCanvas } from '../cards/CardCanvas';
import { SupabaseDeckRepository, DesignTemplateRepository } from '../../lib/deckRepository';
import type { DesignTemplateRow } from '../../lib/deckRepository';

// ── Extracted outside component to maintain stable identity across renders ──
function InputRow({ label, value, onChange, type = 'text', hint, readOnly }: {
  label: string;
  value: string | number | undefined;
  onChange?: (val: string) => void;
  type?: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange && onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          background: readOnly ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)',
          color: readOnly ? 'rgba(255,255,255,0.5)' : 'white',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '0.5rem',
          borderRadius: '4px',
          fontSize: '0.9rem',
          width: '100%',
          cursor: readOnly ? 'not-allowed' : 'text',
        }}
      />
      {hint && (
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

const deckRepo = new SupabaseDeckRepository();
const templateRepo = new DesignTemplateRepository();

interface DeckSettingsModalProps {
  deck: DeckSchema;
  onClose: () => void;
}

export function DeckSettingsModal({ deck, onClose }: DeckSettingsModalProps) {
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [dbTemplates, setDbTemplates] = useState<DesignTemplateRow[]>([]);

  // Fetch DB templates on mount
  useEffect(() => {
    templateRepo.getAll().then(setDbTemplates).catch(console.error);
  }, []);

  // Local state for presets
  const [designTemplateId, setDesignTemplateId] = useState(
    deck.design?.template_id || 'dark-minimal-01',
  );

  // Local state for Overrides
  const [printOverrides, setPrintOverrides] = useState<Partial<PrintSpecs>>(
    deck.print_specs_overrides || {},
  );
  const [designOverrides, setDesignOverrides] = useState<Partial<DeckDesign>>(
    deck.design_template_overrides || {},
  );

  // Calculated Live Deck
  const liveDeck = useMemo((): DeckSchema => {
    // Try DB templates first, then hardcoded presets
    const dbMatch = dbTemplates.find((t) => t.id === designTemplateId);
    const baseDesign: DeckDesign = dbMatch
      ? {
          template_id: dbMatch.id,
          primary_color: dbMatch.primary_color,
          accent_color: dbMatch.accent_color,
          font_heading: dbMatch.font_heading,
          font_body: dbMatch.font_body,
          background: dbMatch.background || undefined,
          text_color: dbMatch.text_color || undefined,
          surface_color: dbMatch.surface_color || undefined,
        }
      : DESIGN_TEMPLATES[designTemplateId as keyof typeof DESIGN_TEMPLATES] ||
        DESIGN_TEMPLATES['dark-minimal-01'];

    // Dimension overrides are now controlled entirely by the Design Template
    const templateWidth = dbMatch
      ? dbMatch.card_width
      : PRINT_SPECS['baraja-standard'].dimensions.width;
    const templateHeight = dbMatch
      ? dbMatch.card_height
      : PRINT_SPECS['baraja-standard'].dimensions.height;

    // Provide a standardized print spec but inject template dimensions
    const basePrint = {
      ...PRINT_SPECS['baraja-standard'],
      dimensions: { width: templateWidth, height: templateHeight, unit: 'mm' as const },
    };

    return {
      ...deck,
      print_specs: {
        ...basePrint,
        ...printOverrides,
        dimensions: { width: templateWidth, height: templateHeight, unit: 'mm' as const },
      },
      design: { ...baseDesign, ...designOverrides },
    };
  }, [deck, designTemplateId, printOverrides, designOverrides, dbTemplates]);

  const currentPrint = liveDeck.print_specs;
  const currentDesign = liveDeck.design;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await deckRepo.updateDeckSettings(deck.slug || deck.id, {
        design_template_id: designTemplateId as DesignTemplateId,
        print_spec_id: 'baraja-standard' as PrintSpecId, // Legacy field, standardized
        // Ensure dimensions reflect design template safely so they align across the DB
        print_specs_overrides: {
          ...printOverrides,
          dimensions: {
            width: currentPrint.dimensions.width,
            height: currentPrint.dimensions.height,
            unit: 'mm'
          },
        },
        design_template_overrides: designOverrides,
      });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Error while saving deck settings.');
    } finally {
      setSaving(false);
    }
  }

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
                  Design Template
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
                  {/* DB templates (created via pdfme Designer) */}
                  {dbTemplates.length > 0 && (
                    <optgroup label='Custom Templates (DB)'>
                      {dbTemplates.map((t) => (
                        <option key={`db-${t.id}`} value={t.id}>
                          ★ {t.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* Hardcoded presets */}
                  <optgroup label='Built-in Presets'>
                    {Object.keys(DESIGN_TEMPLATES).map((key) => (
                      <option key={key} value={key}>
                        {
                          DESIGN_TEMPLATES[key as keyof typeof DESIGN_TEMPLATES]
                            .template_id
                        }
                      </option>
                    ))}
                  </optgroup>
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
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                }}
              >
                <InputRow
                  label='Width (mm)'
                  type='number'
                  readOnly
                  value={currentPrint.dimensions?.width}
                  hint='Locked to Design Template'
                />
                <InputRow
                  label='Height (mm)'
                  type='number'
                  readOnly
                  value={currentPrint.dimensions?.height}
                  hint='Locked to Design Template'
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
                  card={sampleCard as unknown as import('@eb-packages/deck-engine').Card}
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
