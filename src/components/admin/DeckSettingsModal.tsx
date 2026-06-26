import React, { useState, useMemo, useEffect } from 'react';
import { PRINT_SPECS } from '@eb-packages/deck-engine';
import type { DeckSchema } from '@eb-packages/deck-engine';
import { Link } from 'react-router-dom';
import { CardCanvas } from '../cards/CardCanvas';
import { SupabaseDeckRepository, DesignTemplateRepository } from '../../lib/deckRepository';
import type { DesignTemplateRow } from '../../lib/deckRepository';

const deckRepo = new SupabaseDeckRepository();
const templateRepo = new DesignTemplateRepository();

interface DeckSettingsModalProps {
  deck: DeckSchema;
  onClose: () => void;
}

export function DeckSettingsModal({ deck, onClose }: DeckSettingsModalProps) {
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [presets, setPresets] = useState<DesignTemplateRow[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState(
    deck.design?.template_id || ''
  );

  useEffect(() => {
    templateRepo.getAll().then(setPresets).catch(console.error);
  }, []);

  const selectedPreset = presets.find(p => p.id === selectedPresetId);
  const deckDesignHref = `/admin/${encodeURIComponent(deck.slug || deck.id)}/design`;

  // Live deck for preview — reflects the selected preset instantly
  const liveDeck = useMemo((): DeckSchema => {
    if (!selectedPreset) return deck;

    const presetDimensions = {
      width: selectedPreset.card_width,
      height: selectedPreset.card_height,
      unit: 'mm' as const,
    };

    return {
      ...deck,
      print_specs: {
        ...PRINT_SPECS['baraja-standard'],
        dimensions: presetDimensions,
      },
      design: {
        template_id: selectedPreset.id as never,
        primary_color: selectedPreset.primary_color,
        accent_color: selectedPreset.accent_color,
        font_heading: selectedPreset.font_heading,
        font_body: selectedPreset.font_body,
        background: selectedPreset.background || undefined,
        text_color: selectedPreset.text_color || undefined,
        surface_color: selectedPreset.surface_color || undefined,
        // qr_color is read by CardCanvas directly from deck.design
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(selectedPreset.qr_color ? { qr_color: selectedPreset.qr_color } : {}),
      } as never,
    };
  }, [deck, selectedPreset]);

  const currentPrint = liveDeck.print_specs;

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPresetId) return;
    setSaving(true);
    try {
      await deckRepo.assignPreset(deck.slug || deck.id, selectedPresetId);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Error saving deck settings.');
    } finally {
      setSaving(false);
    }
  }

  const hasChanged = selectedPresetId !== (deck.design?.template_id || '');

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        width: '100%', maxWidth: '1100px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
      }}>

        {/* Header */}
        <div style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
              Settings — <span style={{ color: 'var(--color-gold)' }}>{deck.name}</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)' }}>
              Assign an Edition Preset. All visual config lives in the preset.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              padding: '0.5rem 1rem',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px', color: 'white', cursor: 'pointer',
            }}
          >Close</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT: Preset Selector */}
          <form
            id="settings-form"
            onSubmit={handleSave}
            style={{
              flex: '0 0 380px',
              padding: '2rem',
              overflowY: 'auto',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column', gap: '1.5rem',
            }}
          >

            {/* Current Preset */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-gold)' }}>
                🎨 Edition Preset
              </h3>

              <select
                value={selectedPresetId}
                onChange={e => setSelectedPresetId(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'white',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '0.6rem 0.75rem', borderRadius: '6px',
                  fontSize: '0.9rem', width: '100%',
                }}
              >
                <option value="">— Sin preset asignado —</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Preset details chip */}
              {selectedPreset && (
                <div style={{
                  background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.07)', padding: '0.75rem',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <div title="Primary" style={{ width: 20, height: 20, borderRadius: '4px', background: selectedPreset.background || selectedPreset.primary_color, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div title="Accent" style={{ width: 20, height: 20, borderRadius: '4px', background: selectedPreset.accent_color, border: '1px solid rgba(255,255,255,0.2)' }} />
                    {selectedPreset.qr_color && (
                      <>
                        <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>QR:</span>
                        <div title={`QR: ${selectedPreset.qr_color}`} style={{ width: 20, height: 20, borderRadius: '4px', background: selectedPreset.qr_color, border: '1px solid rgba(255,255,255,0.2)' }} />
                        <span style={{ fontSize: '0.65rem', opacity: 0.4, fontFamily: 'monospace' }}>{selectedPreset.qr_color}</span>
                      </>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.3, fontFamily: 'monospace' }}>
                      {selectedPreset.card_width}×{selectedPreset.card_height}mm
                    </span>
                  </div>

                  {/* Fonts */}
                  <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>
                    {selectedPreset.font_heading} · {selectedPreset.font_body}
                  </div>

                  {/* Link to edit preset */}
                  <Link
                    to={deckDesignHref}
                    onClick={onClose}
                    style={{
                      fontSize: '0.72rem', color: 'var(--color-gold)',
                      textDecoration: 'none', opacity: 0.7,
                      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    Abrir diseño global del mazo →
                  </Link>
                </div>
              )}

              {!selectedPreset && presets.length > 0 && (
                <p style={{ fontSize: '0.75rem', opacity: 0.4, margin: 0 }}>
                  Select a preset from the dropdown to preview it.
                </p>
              )}

              {presets.length === 0 && (
                <p style={{ fontSize: '0.75rem', opacity: 0.4, margin: 0 }}>
                  No presets found.{' '}
                  <Link to={deckDesignHref} onClick={onClose} style={{ color: 'var(--color-gold)' }}>
                    Abrir diseño global →
                  </Link>
                </p>
              )}
            </section>

            {/* Print info (read-only) */}
            {selectedPreset && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>
                  📐 Print Dimensions
                </h3>
                <div style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                  padding: '0.6rem 0.8rem', fontSize: '0.8rem', opacity: 0.6,
                  fontFamily: 'monospace',
                }}>
                  {currentPrint.dimensions?.width} × {currentPrint.dimensions?.height} mm
                  <span style={{ opacity: 0.5, marginLeft: '0.5rem' }}>(locked to preset)</span>
                </div>
              </section>
            )}

          </form>

          {/* RIGHT: Live Preview */}
          <div style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: '2rem',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <h4 style={{ margin: '0 0 1rem', color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>
              Live Preview
            </h4>
            <div style={{ transform: 'scale(1.2)' }}>
              <CardCanvas
                deck={liveDeck}
                card={sampleCard as unknown as import('@eb-packages/deck-engine').Card}
                flipped={flipped}
                onFlip={() => setFlipped(!flipped)}
              />
            </div>
            <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
              Click the card to flip · {currentPrint.dimensions?.width}×{currentPrint.dimensions?.height}mm
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.25rem 2rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'flex-end', gap: '1rem',
          alignItems: 'center',
        }}>
          {hasChanged && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-gold)', opacity: 0.7 }}>
              Preset changed — save to apply
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem', background: 'transparent', color: 'white',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            type="submit"
            form="settings-form"
            disabled={saving || !selectedPresetId}
            className="btn-primary"
            style={{ padding: '0.75rem 2rem', cursor: (saving || !selectedPresetId) ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving...' : 'Assign Preset'}
          </button>
        </div>
      </div>
    </div>
  );
}
