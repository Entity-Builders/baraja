import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DesignTemplateRepository } from '../../lib/deckRepository';
import type { DesignTemplateRow, DesignTemplateInput, LayoutConfig } from '../../lib/deckRepository';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';

const repo = new DesignTemplateRepository();

// ── Sample card for preview ──────────────────────────────────

const SAMPLE_CARD: Card = {
  id: 'sample-01',
  front: {
    art_prompt: '',
    art_url: '',
    title: 'La Vuelta',
    number: 7,
  },
  back: {
    phrase: 'A veces volver al punto de partida es la forma más honesta de avanzar.',
    when_to_use: 'Cuando sentís que estás dando vueltas',
    instruction: 'Cerrá los ojos. Pensá en algo que dejaste a medias. ¿Lo dejaste o te dejó?',
    fun_fact: 'El 80% de los proyectos abandonados tenían una solución a menos de 3 pasos.',
    answer: undefined,
  },
};

// ── Stable form inputs ───────────────────────────────────────

function InputRow({ label, value, onChange, type = 'text', placeholder, min, max, step }: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        style={{
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '0.4rem 0.5rem',
          borderRadius: '4px',
          fontSize: '0.85rem',
          width: '100%',
        }}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '32px', height: '32px', border: 'none', cursor: 'pointer', borderRadius: '4px', background: 'transparent', padding: 0 }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.4rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          }}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
      fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--color-gold, #d4af64)' }}
      />
      {label}
    </label>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Card Preview (renders both sides inline) ──────────────────

function CardPreview({ template }: { template: Partial<DesignTemplateInput> }) {
  const bg = template.background || template.primary_color || '#0c0b09';
  const text = template.text_color || (isLightColor(bg) ? '#1a1a1a' : '#f0ebe0');
  const accent = template.accent_color || '#d4af64';
  const surface = template.surface_color || bg;
  const fontHead = template.font_heading || 'Cormorant Garamond';
  const fontBody = template.font_body || 'Inter';

  const w = template.card_width || 88;
  const h = template.card_height || 63;
  const isLandscape = w > h;

  // Scale card to fit preview area (max 200px wide)
  const maxW = 180;
  const scale = maxW / w;
  const displayW = w * scale;
  const displayH = h * scale;

  const layout = (template.layout_config || {}) as LayoutConfig;
  const elems = layout.back_elements || {};
  const fonts = layout.font_sizes || {};
  const padding = layout.back_padding ?? 10;
  const borderStyle = layout.back_border_style ?? 'solid';
  const align = layout.content_align ?? 'center';

  const cardStyle: React.CSSProperties = {
    width: `${displayW}px`,
    height: `${displayH}px`,
    borderRadius: '6px',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
    flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
      {/* FRONT */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ fontSize: '0.65rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Front</span>
        <div style={{ ...cardStyle, background: bg }}>
          {/* Art placeholder with pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `repeating-linear-gradient(45deg, ${accent}11, ${accent}11 10px, transparent 10px, transparent 20px)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '2rem' }}>🎨</span>
            <span style={{ color: text, opacity: 0.4, fontSize: '0.6rem', fontFamily: fontBody, marginTop: '0.3rem' }}>
              Art goes here
            </span>
          </div>
          {/* Card number overlay */}
          <div style={{
            position: 'absolute', bottom: '8px', left: '8px',
            background: accent, color: isLightColor(accent) ? '#1a1a1a' : '#fff',
            padding: '0.15rem 0.4rem', borderRadius: '3px',
            fontSize: '0.6rem', fontWeight: 700, fontFamily: fontBody,
          }}>
            #07
          </div>
          {/* Title overlay */}
          <div style={{
            position: 'absolute', bottom: '8px', right: '8px',
            color: text, opacity: 0.8,
            fontSize: '0.6rem', fontFamily: fontHead, fontStyle: 'italic',
          }}>
            {SAMPLE_CARD.front.title}
          </div>
        </div>
        <span style={{ fontSize: '0.7rem', opacity: 0.3, fontFamily: 'monospace' }}>{w}×{h}mm</span>
      </div>

      {/* BACK */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ fontSize: '0.65rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Back</span>
        <div style={{ ...cardStyle, background: bg, display: 'flex', flexDirection: 'column', padding: `${padding}%`, textAlign: align }}>
          {/* Inner border frame */}
          {borderStyle !== 'none' && (
            <div style={{
              position: 'absolute', inset: '5%',
              border: `1px ${borderStyle} ${accent}50`,
              borderRadius: '2px', pointerEvents: 'none',
            }} />
          )}

          {/* When to use */}
          {(elems.show_when_to_use !== false) && (
            <div style={{
              color: accent, fontFamily: fontHead,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontSize: `${(fonts.when_to_use || 0.45) * scale * 0.7}rem`,
              marginBottom: '0.3rem',
            }}>
              {SAMPLE_CARD.back.when_to_use}
            </div>
          )}

          {/* Phrase */}
          {(elems.show_phrase !== false) && (
            <div style={{
              color: text, fontFamily: fontHead,
              fontSize: `${(fonts.phrase || 0.7) * scale * 0.7}rem`,
              lineHeight: 1.3, fontWeight: 600,
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : `flex-${align === 'left' ? 'start' : 'end'}`,
            }}>
              "{SAMPLE_CARD.back.phrase}"
            </div>
          )}

          {/* Instruction */}
          {(elems.show_instruction !== false) && (
            <div style={{
              color: text, fontFamily: fontBody, opacity: 0.7,
              fontSize: `${(fonts.instruction || 0.45) * scale * 0.7}rem`,
              lineHeight: 1.4, marginTop: '0.3rem',
            }}>
              {SAMPLE_CARD.back.instruction}
            </div>
          )}

          {/* Fun fact */}
          {(elems.show_fun_fact !== false) && SAMPLE_CARD.back.fun_fact && (
            <div style={{
              color: text, fontFamily: fontBody, fontStyle: 'italic',
              fontSize: `${(fonts.instruction || 0.4) * scale * 0.7}rem`,
              opacity: 0.6, marginTop: '0.2rem',
            }}>
              💡 {SAMPLE_CARD.back.fun_fact}
            </div>
          )}

          {/* QR */}
          {(elems.show_qr !== false) && (
            <div style={{
              marginTop: 'auto', alignSelf: 'center',
              width: `${14 * scale * 0.6}px`, height: `${14 * scale * 0.6}px`,
              border: `1px solid ${text}40`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '0.35rem', color: text, opacity: 0.4 }}>QR</span>
            </div>
          )}

          {/* Brand */}
          {(elems.show_brand !== false) && (
            <div style={{
              color: text, fontFamily: fontHead, opacity: 0.35,
              fontSize: `${(fonts.brand || 0.4) * scale * 0.7}rem`,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              marginTop: '0.2rem', alignSelf: 'center',
            }}>
              Baraja · Sample
            </div>
          )}
        </div>
        <span style={{ fontSize: '0.7rem', opacity: 0.3, fontFamily: 'monospace' }}>
          {isLandscape ? 'Landscape' : 'Portrait'}
        </span>
      </div>
    </div>
  );
}

// ── Template Editor Form ─────────────────────────────────────

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial: Partial<DesignTemplateInput>;
  onSave: (t: DesignTemplateInput) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Partial<DesignTemplateInput>>({ ...initial });
  const [saving, setSaving] = useState(false);

  const layout = useMemo(() => (form.layout_config || {}) as LayoutConfig, [form.layout_config]);
  const elems = layout.back_elements || {};

  const update = (key: keyof DesignTemplateInput, value: string | number | LayoutConfig | null) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (isNew && key === 'name' && typeof value === 'string' && !initial.id) {
        next.id = slugify(value);
      }
      return next;
    });
  };

  const updateLayout = (partial: Partial<LayoutConfig>) => {
    const merged = { ...layout, ...partial };
    update('layout_config', merged);
  };

  const updateElems = (partial: Partial<NonNullable<LayoutConfig['back_elements']>>) => {
    updateLayout({ back_elements: { ...elems, ...partial } });
  };

  const updateFontSizes = (partial: Partial<NonNullable<LayoutConfig['font_sizes']>>) => {
    updateLayout({ font_sizes: { ...(layout.font_sizes || {}), ...partial } });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id || !form.name) {
      alert('ID and Name are required');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: form.id,
        name: form.name,
        primary_color: form.primary_color || '#0c0b09',
        accent_color: form.accent_color || '#d4af64',
        font_heading: form.font_heading || 'Cormorant Garamond',
        font_body: form.font_body || 'Inter',
        background: form.background || null,
        text_color: form.text_color || null,
        surface_color: form.surface_color || null,
        card_width: form.card_width || 88,
        card_height: form.card_height || 63,
        card_unit: form.card_unit || 'mm',
        layout_config: form.layout_config || {},
      });
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--color-surface, #1a1a1a)',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '1rem' }}>
          {isNew ? '✨ New Template' : `✏️ ${form.name}`}
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', opacity: saving ? 0.5 : 1 }}>
            {saving ? '...' : isNew ? 'Create' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} className="btn-ghost" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
            Cancel
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
        {/* Left: All fields */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', maxHeight: '600px' }}>

          {/* Identity */}
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
            <legend style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', padding: '0 0.3rem' }}>IDENTITY</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <InputRow label="ID (slug)" value={form.id || ''} onChange={v => update('id', v)} placeholder="dark-minimal-01" />
              <InputRow label="Name" value={form.name || ''} onChange={v => update('name', v)} placeholder="Dark Minimal" />
            </div>
          </fieldset>

          {/* Card Size */}
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
            <legend style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', padding: '0 0.3rem' }}>📐 CARD SIZE</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <InputRow label="Width" value={form.card_width || 88} onChange={v => update('card_width', Number(v))} type="number" min={30} max={200} step={1} />
              <InputRow label="Height" value={form.card_height || 63} onChange={v => update('card_height', Number(v))} type="number" min={30} max={200} step={1} />
              <InputRow label="Unit" value={form.card_unit || 'mm'} onChange={v => update('card_unit', v)} placeholder="mm" />
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { label: '88×63 (Landscape)', w: 88, h: 63 },
                { label: '63×88 (Portrait)', w: 63, h: 88 },
                { label: '70×120 (Tarot)', w: 70, h: 120 },
                { label: '89×51 (Business)', w: 89, h: 51 },
                { label: '100×100 (Square)', w: 100, h: 100 },
              ].map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { update('card_width', p.w); update('card_height', p.h); }}
                  style={{
                    padding: '0.2rem 0.5rem', fontSize: '0.65rem', cursor: 'pointer',
                    background: (form.card_width === p.w && form.card_height === p.h) ? 'var(--color-gold, #d4af64)' : 'rgba(255,255,255,0.05)',
                    color: (form.card_width === p.w && form.card_height === p.h) ? '#000' : 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Colors */}
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
            <legend style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', padding: '0 0.3rem' }}>🎨 COLORS</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <ColorInput label="Primary" value={form.primary_color || '#0c0b09'} onChange={v => update('primary_color', v)} />
              <ColorInput label="Accent" value={form.accent_color || '#d4af64'} onChange={v => update('accent_color', v)} />
              <ColorInput label="Background" value={form.background || ''} onChange={v => update('background', v)} />
              <ColorInput label="Text" value={form.text_color || ''} onChange={v => update('text_color', v)} />
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <ColorInput label="Surface" value={form.surface_color || ''} onChange={v => update('surface_color', v)} />
            </div>
          </fieldset>

          {/* Fonts */}
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
            <legend style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', padding: '0 0.3rem' }}>✒️ FONTS</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <InputRow label="Heading" value={form.font_heading || 'Cormorant Garamond'} onChange={v => update('font_heading', v)} />
              <InputRow label="Body" value={form.font_body || 'Inter'} onChange={v => update('font_body', v)} />
            </div>
          </fieldset>

          {/* Layout / Elements */}
          <fieldset style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
            <legend style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', padding: '0 0.3rem' }}>📋 BACK FACE LAYOUT</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              <ToggleRow label="When to Use" checked={elems.show_when_to_use !== false} onChange={v => updateElems({ show_when_to_use: v })} />
              <ToggleRow label="Phrase" checked={elems.show_phrase !== false} onChange={v => updateElems({ show_phrase: v })} />
              <ToggleRow label="Instruction" checked={elems.show_instruction !== false} onChange={v => updateElems({ show_instruction: v })} />
              <ToggleRow label="Fun Fact" checked={elems.show_fun_fact !== false} onChange={v => updateElems({ show_fun_fact: v })} />
              <ToggleRow label="QR Code" checked={elems.show_qr !== false} onChange={v => updateElems({ show_qr: v })} />
              <ToggleRow label="Brand" checked={elems.show_brand !== false} onChange={v => updateElems({ show_brand: v })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
              <InputRow label="Phrase size (rem)" value={layout.font_sizes?.phrase || 0.7} onChange={v => updateFontSizes({ phrase: Number(v) })} type="number" min={0.3} max={2} step={0.05} />
              <InputRow label="Label size" value={layout.font_sizes?.when_to_use || 0.45} onChange={v => updateFontSizes({ when_to_use: Number(v) })} type="number" min={0.2} max={1} step={0.05} />
              <InputRow label="Body size" value={layout.font_sizes?.instruction || 0.45} onChange={v => updateFontSizes({ instruction: Number(v) })} type="number" min={0.2} max={1} step={0.05} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
              <InputRow label="Padding (%)" value={layout.back_padding ?? 10} onChange={v => updateLayout({ back_padding: Number(v) })} type="number" min={2} max={25} step={1} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Border</label>
                <select
                  value={layout.back_border_style ?? 'solid'}
                  onChange={(e) => updateLayout({ back_border_style: e.target.value as LayoutConfig['back_border_style'] })}
                  style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem', borderRadius: '4px', fontSize: '0.8rem' }}
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Align</label>
                <select
                  value={layout.content_align ?? 'center'}
                  onChange={(e) => updateLayout({ content_align: e.target.value as LayoutConfig['content_align'] })}
                  style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem', borderRadius: '4px', fontSize: '0.8rem' }}
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Right: Live Card Preview */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            ♠ Live Card Preview
          </span>
          <CardPreview template={form} />
        </div>
      </div>
    </form>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<DesignTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await repo.getAll();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  async function handleCreate(t: DesignTemplateInput) {
    await repo.create(t);
    setCreating(false);
    await loadTemplates();
  }

  async function handleUpdate(t: DesignTemplateInput) {
    await repo.update(t.id, t);
    setEditingId(null);
    await loadTemplates();
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete template "${id}"? Editions using it will need to be reassigned.`)) return;
    await repo.delete(id);
    await loadTemplates();
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <Link to="/admin" style={{ color: 'var(--color-gold, #d4af64)', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Dashboard</Link>
          <h1 style={{ margin: '0.5rem 0 0' }}>🎨 Design Templates</h1>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="btn-primary"
            style={{ fontSize: '0.85rem' }}
          >
            + New Template
          </button>
        )}
      </div>
      <p style={{ opacity: 0.5, marginBottom: '2rem', fontSize: '0.9rem' }}>
        Each template controls colors, fonts, card dimensions, and back-face layout. Assign a template to each edition.
      </p>

      {/* Create new */}
      {creating && (
        <div style={{ marginBottom: '2rem' }}>
          <TemplateForm
            initial={{
              font_heading: 'Cormorant Garamond', font_body: 'Inter',
              primary_color: '#0c0b09', accent_color: '#d4af64',
              card_width: 88, card_height: 63, card_unit: 'mm',
              layout_config: {},
            }}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
            isNew
          />
        </div>
      )}

      {loading && <p style={{ opacity: 0.5 }}>Loading templates...</p>}

      {/* Template list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {templates.map((tpl) => (
          <div key={tpl.id}>
            {editingId === tpl.id ? (
              <TemplateForm
                initial={tpl}
                onSave={handleUpdate}
                onCancel={() => setEditingId(null)}
                isNew={false}
              />
            ) : (
              /* Collapsed card row */
              <div style={{
                background: 'var(--color-surface, #1a1a1a)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'grid',
                gridTemplateColumns: '1fr 300px',
                overflow: 'hidden',
              }}>
                {/* Info side */}
                <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{tpl.name}</h3>
                    <code style={{ fontSize: '0.65rem', opacity: 0.35, background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                      {tpl.id}
                    </code>
                    <span style={{ fontSize: '0.65rem', opacity: 0.35, marginLeft: 'auto' }}>
                      {tpl.card_width}×{tpl.card_height}{tpl.card_unit}
                    </span>
                  </div>

                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Primary', color: tpl.primary_color },
                      { label: 'Accent', color: tpl.accent_color },
                      ...(tpl.background ? [{ label: 'BG', color: tpl.background }] : []),
                      ...(tpl.text_color ? [{ label: 'Text', color: tpl.text_color }] : []),
                      ...(tpl.surface_color ? [{ label: 'Surface', color: tpl.surface_color }] : []),
                    ].map((c) => (
                      <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: c.color, border: '1px solid rgba(255,255,255,0.15)' }} />
                        <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>{c.label}</span>
                      </div>
                    ))}
                    <span style={{ fontSize: '0.65rem', opacity: 0.3, marginLeft: '0.5rem' }}>
                      {tpl.font_heading} / {tpl.font_body}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                    <button
                      onClick={() => { setEditingId(tpl.id); setCreating(false); }}
                      style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                        color: 'white', padding: '0.25rem 0.7rem', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '0.7rem',
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      style={{
                        background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444', padding: '0.25rem 0.7rem', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '0.7rem',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Mini preview */}
                <div style={{ padding: '0.75rem', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
                  <CardPreview template={tpl} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && templates.length === 0 && (
        <p style={{ opacity: 0.4, textAlign: 'center', padding: '3rem 0' }}>
          No templates yet. Create your first one to get started.
        </p>
      )}
    </div>
  );
}
