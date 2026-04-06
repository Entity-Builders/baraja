import React, { useState } from 'react';
import { DESIGN_TEMPLATES, PRINT_SPECS } from '@eb-packages/deck-engine';
import type { DeckSchema } from '@eb-packages/deck-engine';

interface DeckSettingsModalProps {
  deck: DeckSchema;
  onClose: () => void;
}

export function DeckSettingsModal({ deck, onClose }: DeckSettingsModalProps) {
  const [saving, setSaving] = useState(false);
  
  // Local state for the settings
  const [designTemplateId, setDesignTemplateId] = useState(deck.design.template_id);

  // DeckSchema strips print_spec_id, so we deduce it by matching dimensions, or fallback to standard
  const initialPrintSpecId = Object.keys(PRINT_SPECS).find(
    k => PRINT_SPECS[k as keyof typeof PRINT_SPECS].dimensions.width === deck.print_specs.dimensions.width
  ) || 'baraja-standard';

  const [printSpecId, setPrintSpecId] = useState(initialPrintSpecId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/admin/save-deck-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.slug || deck.id,
          updates: {
            design_template_id: designTemplateId,
            print_spec_id: printSpecId,
          }
        })
      });

      if (response.ok) {
        // A full page reload ensures all nested components get the updated schema,
        // although standard Vite HMR could also partially handle this once JSON changes.
        window.location.reload();
      } else {
        const errorData = await response.json() as { error: string };
        alert(`Failed to save settings: ${errorData.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving deck settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--color-surface)', width: '400px', maxWidth: '90%', 
        borderRadius: '8px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Deck Settings</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Print Specification</label>
            <select 
              value={printSpecId} 
              onChange={e => setPrintSpecId(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', 
                padding: '0.5rem', borderRadius: '4px', width: '100%'
              }}
            >
              {Object.keys(PRINT_SPECS).map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            {PRINT_SPECS[printSpecId as keyof typeof PRINT_SPECS] && (
              <small style={{ color: 'var(--color-gold)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Measurements: {PRINT_SPECS[printSpecId as keyof typeof PRINT_SPECS].dimensions.width}x{PRINT_SPECS[printSpecId as keyof typeof PRINT_SPECS].dimensions.height}mm (Bleed: {PRINT_SPECS[printSpecId as keyof typeof PRINT_SPECS].bleed}mm)
              </small>
            )}
            <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
              Determines card physical dimensions, orientation, and bleed.
            </small>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Design Template</label>
            <select 
              value={designTemplateId} 
              onChange={e => setDesignTemplateId(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', 
                padding: '0.5rem', borderRadius: '4px', width: '100%'
              }}
            >
              {Object.keys(DESIGN_TEMPLATES).map(key => (
                <option key={key} value={key}>{DESIGN_TEMPLATES[key as keyof typeof DESIGN_TEMPLATES].template_id}</option>
              ))}
            </select>
            <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
              Determines colors, typography, and visual styling.
            </small>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              onClick={onClose}
              style={{ flex: 1, padding: '0.75rem', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="btn-primary"
              style={{ flex: 1, padding: '0.75rem', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
