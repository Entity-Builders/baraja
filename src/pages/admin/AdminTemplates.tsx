import React, { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DesignTemplateRepository } from '../../lib/deckRepository';
import type {
  DesignTemplateRow, DesignTemplateInput, LayoutConfig,
  ElementLayout, BackElementKey,
} from '../../lib/deckRepository';

const repo = new DesignTemplateRepository();

// ── Default element layouts (%) ──────────────────────────────

const DEFAULT_ELEMENTS: Record<BackElementKey, ElementLayout> = {
  when_to_use: {
    visible: true, x: 10, y: 8, w: 80, h: 0,
    fontSize: 7, align: 'center', transform: 'uppercase',
    letterSpacing: 2, opacity: 1, fontType: 'heading',
    fontWeight: 400, fontStyle: 'normal', lineHeight: 1.3,
    useAccentColor: true,
  },
  phrase: {
    visible: true, x: 10, y: 22, w: 80, h: 40,
    fontSize: 13, align: 'center', transform: 'none',
    letterSpacing: 0, opacity: 1, fontType: 'heading',
    fontWeight: 600, fontStyle: 'normal', lineHeight: 1.35,
    useAccentColor: false,
  },
  instruction: {
    visible: true, x: 10, y: 65, w: 80, h: 0,
    fontSize: 8, align: 'center', transform: 'none',
    letterSpacing: 0, opacity: 0.75, fontType: 'body',
    fontWeight: 400, fontStyle: 'normal', lineHeight: 1.4,
    useAccentColor: false,
  },
  fun_fact: {
    visible: true, x: 10, y: 78, w: 80, h: 0,
    fontSize: 7, align: 'center', transform: 'none',
    letterSpacing: 0, opacity: 0.6, fontType: 'heading',
    fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3,
    useAccentColor: false,
  },
  answer: {
    visible: false, x: 10, y: 80, w: 80, h: 0,
    fontSize: 9, align: 'center', transform: 'none',
    letterSpacing: 0, opacity: 1, fontType: 'body',
    fontWeight: 700, fontStyle: 'normal', lineHeight: 1.3,
    useAccentColor: true,
  },
  qr: {
    visible: true, x: 42, y: 85, w: 16, h: 0,
    fontSize: 6, align: 'center', transform: 'none',
    letterSpacing: 0, opacity: 0.3, fontType: 'body',
    fontWeight: 400, fontStyle: 'normal', lineHeight: 1,
    useAccentColor: false,
  },
  brand: {
    visible: true, x: 10, y: 93, w: 80, h: 0,
    fontSize: 6, align: 'center', transform: 'uppercase',
    letterSpacing: 2, opacity: 0.35, fontType: 'heading',
    fontWeight: 400, fontStyle: 'normal', lineHeight: 1,
    useAccentColor: false,
  },
};

const DEFAULT_SAMPLE_TEXT: Record<BackElementKey, string> = {
  when_to_use: 'Cuando sentís que estás dando vueltas',
  phrase: 'A veces volver al punto de partida es la forma más honesta de avanzar.',
  instruction: 'Cerrá los ojos. Pensá en algo que dejaste a medias. ¿Lo dejaste o te dejó?',
  fun_fact: '💡 El 80% de los proyectos abandonados tenían una solución a menos de 3 pasos.',
  answer: 'Respuesta de ejemplo',
  qr: 'QR',
  brand: 'Baraja · Sample Edition',
};

const DEFAULT_BORDER = { visible: true, style: 'solid' as const, inset: 5, opacity: 0.25 };

function getElement(layout: LayoutConfig, key: BackElementKey): ElementLayout {
  return { ...DEFAULT_ELEMENTS[key], ...(layout.elements?.[key] || {}) };
}

function getSampleText(layout: LayoutConfig, key: BackElementKey): string {
  return layout.sample_text?.[key] || DEFAULT_SAMPLE_TEXT[key];
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

// ── Stable form inputs ───────────────────────────────────────

function InputRow({ label, value, onChange, type = 'text', placeholder, min, max, step, width }: {
  label: string; value: string | number; onChange: (val: string) => void;
  type?: string; placeholder?: string; min?: number; max?: number; step?: number; width?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width }}>
      <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        min={min} max={max} step={step}
        style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', width: '100%' }}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void; }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)}
          style={{ width: '24px', height: '24px', border: 'none', cursor: 'pointer', borderRadius: '3px', background: 'transparent', padding: 0 }}
        />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="#000"
          style={{ flex: 1, background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem', fontFamily: 'monospace' }}
        />
      </div>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button type="button" onClick={() => setOpen(!open)} style={{
        width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)',
        padding: '0.5rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
        fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', fontSize: '0.55rem' }}>▶</span>
        <span>{icon}</span><span>{title}</span>
      </button>
      {open && <div style={{ padding: '0 0.6rem 0.6rem' }}>{children}</div>}
    </div>
  );
}

// ── Element Property Editor ──────────────────────────────────

function ElementEditor({ label, elemKey, el, text, onUpdate, onUpdateText }: {
  label: string;
  elemKey: BackElementKey;
  el: ElementLayout;
  text: string;
  onUpdate: (key: BackElementKey, partial: Partial<ElementLayout>) => void;
  onUpdateText: (key: BackElementKey, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: el.visible ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
      borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)',
      marginBottom: '0.3rem', overflow: 'hidden',
    }}>
      {/* Header: toggle + name + expand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.5rem' }}>
        <input type="checkbox" checked={el.visible} onChange={e => onUpdate(elemKey, { visible: e.target.checked })}
          style={{ accentColor: 'var(--color-gold, #d4af64)' }} />
        <span style={{ flex: 1, fontSize: '0.75rem', color: el.visible ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}>
          {label}
        </span>
        <button type="button" onClick={() => setExpanded(!expanded)} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.6rem',
        }}>{expanded ? '▲' : '▼'}</button>
      </div>

      {expanded && el.visible && (
        <div style={{ padding: '0.3rem 0.5rem 0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Sample text */}
          {elemKey !== 'qr' && (
            <div style={{ marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Preview Text</label>
              <textarea value={text} onChange={e => onUpdateText(elemKey, e.target.value)}
                rows={2}
                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.06)', padding: '0.3rem', borderRadius: '3px', fontSize: '0.7rem', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          )}
          {/* Position: X, Y, W */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '0.3rem' }}>
            <InputRow label="X %" value={el.x} onChange={v => onUpdate(elemKey, { x: Number(v) })} type="number" min={0} max={100} step={1} />
            <InputRow label="Y %" value={el.y} onChange={v => onUpdate(elemKey, { y: Number(v) })} type="number" min={0} max={100} step={1} />
            <InputRow label="W %" value={el.w} onChange={v => onUpdate(elemKey, { w: Number(v) })} type="number" min={5} max={100} step={1} />
          </div>
          {/* Font: size, weight, style, align */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.25rem', marginBottom: '0.3rem' }}>
            <InputRow label="Size pt" value={el.fontSize} onChange={v => onUpdate(elemKey, { fontSize: Number(v) })} type="number" min={4} max={30} step={0.5} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Align</label>
              <select value={el.align} onChange={e => onUpdate(elemKey, { align: e.target.value as ElementLayout['align'] })}
                style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Font</label>
              <select value={el.fontType || 'heading'} onChange={e => onUpdate(elemKey, { fontType: e.target.value as 'heading' | 'body' })}
                style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>
                <option value="heading">Heading</option>
                <option value="body">Body</option>
              </select>
            </div>
            <InputRow label="Opacity" value={el.opacity ?? 1} onChange={v => onUpdate(elemKey, { opacity: Number(v) })} type="number" min={0} max={1} step={0.05} />
          </div>
          {/* Advanced: lineHeight, letterSpacing, transform, accent */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.25rem' }}>
            <InputRow label="Line H" value={el.lineHeight ?? 1.3} onChange={v => onUpdate(elemKey, { lineHeight: Number(v) })} type="number" min={0.8} max={2.5} step={0.05} />
            <InputRow label="Letter" value={el.letterSpacing ?? 0} onChange={v => onUpdate(elemKey, { letterSpacing: Number(v) })} type="number" min={0} max={10} step={0.5} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Case</label>
              <select value={el.transform || 'none'} onChange={e => onUpdate(elemKey, { transform: e.target.value as 'uppercase' | 'none' })}
                style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>
                <option value="none">Normal</option>
                <option value="uppercase">UPPER</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', paddingTop: '0.7rem' }}>
              <input type="checkbox" checked={el.useAccentColor || false} onChange={e => onUpdate(elemKey, { useAccentColor: e.target.checked })}
                style={{ accentColor: 'var(--color-gold, #d4af64)' }} />
              Accent
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Canvas: Absolute-positioned back face ────────────────────

function BackFaceCanvas({
  template, layout, scalePx,
}: {
  template: Partial<DesignTemplateInput>;
  layout: LayoutConfig;
  scalePx: { w: number; h: number };
}) {
  const bg = template.background || template.primary_color || '#0c0b09';
  const text = template.text_color || (isLightColor(bg) ? '#1a1a1a' : '#f0ebe0');
  const accent = template.accent_color || '#d4af64';
  const fontHead = template.font_heading || 'Cormorant Garamond';
  const fontBody = template.font_body || 'Inter';
  const border = { ...DEFAULT_BORDER, ...(layout.border || {}) };

  // Scale factor: canvas pixels per mm
  const mmW = template.card_width || 88;
  const pxPerMm = scalePx.w / mmW;

  const ELEMENT_ORDER: { key: BackElementKey; label: string }[] = [
    { key: 'when_to_use', label: 'When' },
    { key: 'phrase', label: 'Phrase' },
    { key: 'instruction', label: 'Instruction' },
    { key: 'fun_fact', label: 'Fun Fact' },
    { key: 'answer', label: 'Answer' },
    { key: 'qr', label: 'QR' },
    { key: 'brand', label: 'Brand' },
  ];

  return (
    <div style={{
      width: `${scalePx.w}px`, height: `${scalePx.h}px`,
      background: bg, borderRadius: '8px', position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
    }}>
      {/* Border frame */}
      {border.visible && (
        <div style={{
          position: 'absolute',
          top: `${border.inset}%`, left: `${border.inset}%`,
          right: `${border.inset}%`, bottom: `${border.inset}%`,
          border: `1px ${border.style} ${accent}`,
          opacity: border.opacity, borderRadius: '3px', pointerEvents: 'none',
        }} />
      )}

      {/* Elements */}
      {ELEMENT_ORDER.map(({ key }) => {
        const el = getElement(layout, key);
        if (!el.visible) return null;
        const sampleText = getSampleText(layout, key);
        const color = el.useAccentColor ? accent : text;
        const font = el.fontType === 'body' ? fontBody : fontHead;

        if (key === 'qr') {
          return (
            <div key={key} style={{
              position: 'absolute',
              top: `${el.y}%`, left: `${el.x}%`,
              width: `${el.w}%`,
              display: 'flex', justifyContent: el.align === 'center' ? 'center' : `flex-${el.align === 'left' ? 'start' : 'end'}`,
            }}>
              <div style={{
                width: `${24 * pxPerMm}px`, height: `${24 * pxPerMm}px`,
                border: `1px solid ${text}`, opacity: el.opacity,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: `${el.fontSize * pxPerMm * 0.35}px`, color: text }}>QR</span>
              </div>
            </div>
          );
        }

        return (
          <div key={key} style={{
            position: 'absolute',
            top: `${el.y}%`, left: `${el.x}%`,
            width: `${el.w}%`,
            ...(el.h ? { height: `${el.h}%`, display: 'flex', alignItems: 'center' } : {}),
            color, opacity: el.opacity, fontFamily: `'${font}', serif`,
            fontSize: `${el.fontSize * pxPerMm * 0.35}px`,
            fontWeight: el.fontWeight || 400,
            fontStyle: el.fontStyle || 'normal',
            lineHeight: el.lineHeight || 1.3,
            textAlign: el.align,
            textTransform: el.transform === 'uppercase' ? 'uppercase' : 'none',
            letterSpacing: `${(el.letterSpacing || 0) * pxPerMm * 0.3}px`,
            overflow: 'hidden',
          }}>
            {el.h ? <span style={{ width: '100%', textAlign: el.align }}>{key === 'phrase' ? `"${sampleText}"` : sampleText}</span> : (key === 'phrase' ? `"${sampleText}"` : sampleText)}
          </div>
        );
      })}
    </div>
  );
}

function FrontFaceCanvas({
  template, scalePx,
}: {
  template: Partial<DesignTemplateInput>;
  scalePx: { w: number; h: number };
}) {
  const bg = template.background || template.primary_color || '#0c0b09';
  const text = template.text_color || (isLightColor(bg) ? '#1a1a1a' : '#f0ebe0');
  const accent = template.accent_color || '#d4af64';
  const fontHead = template.font_heading || 'Cormorant Garamond';
  const fontBody = template.font_body || 'Inter';
  const mmW = template.card_width || 88;
  const pxPerMm = scalePx.w / mmW;

  return (
    <div style={{
      width: `${scalePx.w}px`, height: `${scalePx.h}px`,
      background: bg, borderRadius: '8px', position: 'relative', overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-linear-gradient(45deg, ${accent}0d, ${accent}0d 12px, transparent 12px, transparent 24px)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: `${40 * pxPerMm * 0.35}px`, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>🎨</span>
        <span style={{ color: text, opacity: 0.25, fontSize: `${7 * pxPerMm * 0.35}px`, fontFamily: `'${fontBody}', sans-serif`, marginTop: '0.5rem' }}>
          Illustration artwork
        </span>
      </div>
      <div style={{
        position: 'absolute', bottom: `${14 * pxPerMm * 0.35}px`, left: `${14 * pxPerMm * 0.35}px`,
        background: accent, color: isLightColor(accent) ? '#1a1a1a' : '#fff',
        padding: `${3 * pxPerMm * 0.35}px ${8 * pxPerMm * 0.35}px`, borderRadius: '3px',
        fontSize: `${8 * pxPerMm * 0.35}px`, fontWeight: 700, fontFamily: `'${fontBody}', sans-serif`,
      }}>#07</div>
      <div style={{
        position: 'absolute', bottom: `${14 * pxPerMm * 0.35}px`, right: `${14 * pxPerMm * 0.35}px`,
        color: text, opacity: 0.6, fontSize: `${9 * pxPerMm * 0.35}px`,
        fontFamily: `'${fontHead}', serif`, fontStyle: 'italic',
      }}>La Vuelta</div>
      <div style={{
        position: 'absolute', top: `${10 * pxPerMm * 0.35}px`, left: `${14 * pxPerMm * 0.35}px`,
        color: accent, opacity: 0.4, fontSize: `${5 * pxPerMm * 0.35}px`,
        fontFamily: `'${fontHead}', serif`, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>Baraja · Sample</div>
    </div>
  );
}

// ── Full-screen Template Editor ──────────────────────────────

function TemplateEditor({
  initial, onSave, onCancel, isNew,
}: {
  initial: Partial<DesignTemplateInput>;
  onSave: (t: DesignTemplateInput) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Partial<DesignTemplateInput>>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('back');

  const layout: LayoutConfig = useMemo(() => (form.layout_config || {}), [form.layout_config]);

  const update = useCallback((key: keyof DesignTemplateInput, value: string | number | LayoutConfig | null) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (isNew && key === 'name' && typeof value === 'string' && !initial.id) {
        next.id = slugify(value);
      }
      return next;
    });
  }, [isNew, initial.id]);

  const updateLayout = useCallback((partial: Partial<LayoutConfig>) => {
    setForm(prev => {
      const current = (prev.layout_config || {}) as LayoutConfig;
      return { ...prev, layout_config: { ...current, ...partial } };
    });
  }, []);

  const updateElement = useCallback((key: BackElementKey, partial: Partial<ElementLayout>) => {
    setForm(prev => {
      const current = (prev.layout_config || {}) as LayoutConfig;
      const elements = { ...(current.elements || {}) };
      elements[key] = { ...getElement(current, key), ...partial };
      return { ...prev, layout_config: { ...current, elements } };
    });
  }, []);

  const updateSampleText = useCallback((key: BackElementKey, text: string) => {
    setForm(prev => {
      const current = (prev.layout_config || {}) as LayoutConfig;
      return { ...prev, layout_config: { ...current, sample_text: { ...(current.sample_text || {}), [key]: text } } };
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id || !form.name) { alert('ID and Name required'); return; }
    setSaving(true);
    try {
      await onSave({
        id: form.id, name: form.name,
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
    } catch (err) { alert(`Error: ${err}`); }
    finally { setSaving(false); }
  }

  const w = form.card_width || 88;
  const h = form.card_height || 63;

  // Compute canvas pixel size to fill ~500px on longest side
  const maxPx = 480;
  const scale = maxPx / Math.max(w, h);
  const scalePx = { w: Math.round(w * scale), h: Math.round(h * scale) };

  const border = { ...DEFAULT_BORDER, ...(layout.border || {}) };

  return (
    <form onSubmit={handleSubmit} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#0e0e0e',
      display: 'grid', gridTemplateColumns: '300px 1fr', overflow: 'hidden',
    }}>
      {/* ── LEFT PANEL ── */}
      <div style={{
        background: '#131313', borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: '#131313', zIndex: 10,
        }}>
          <button type="button" onClick={onCancel} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.75rem',
          }}>← Back</button>
          <button type="submit" disabled={saving} style={{
            background: 'var(--color-gold, #d4af64)', color: '#000', border: 'none',
            padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer',
            fontSize: '0.7rem', fontWeight: 600, opacity: saving ? 0.5 : 1,
          }}>{saving ? '...' : isNew ? '✨ Create' : '💾 Save'}</button>
        </div>

        <Section title="Identity" icon="🏷️">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <InputRow label="ID" value={form.id || ''} onChange={v => update('id', v)} placeholder="mi-template" />
            <InputRow label="Name" value={form.name || ''} onChange={v => update('name', v)} placeholder="Template Name" />
          </div>
        </Section>

        <Section title="Card Size" icon="📐">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
            <InputRow label="Width mm" value={w} onChange={v => update('card_width', Number(v))} type="number" min={30} max={200} />
            <InputRow label="Height mm" value={h} onChange={v => update('card_height', Number(v))} type="number" min={30} max={200} />
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {[
              { l: '88×63', w: 88, h: 63 }, { l: '63×88', w: 63, h: 88 },
              { l: '70×120', w: 70, h: 120 }, { l: '89×51', w: 89, h: 51 },
            ].map(p => {
              const active = form.card_width === p.w && form.card_height === p.h;
              return (
                <button key={p.l} type="button" onClick={() => { update('card_width', p.w); update('card_height', p.h); }}
                  style={{ padding: '0.15rem 0.4rem', fontSize: '0.6rem', cursor: 'pointer',
                    background: active ? 'var(--color-gold, #d4af64)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#000' : 'rgba(255,255,255,0.45)',
                    border: `1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.06)'}`, borderRadius: '3px',
                    fontWeight: active ? 600 : 400,
                  }}>{p.l}</button>
              );
            })}
          </div>
        </Section>

        <Section title="Colors" icon="🎨">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <ColorInput label="Primary" value={form.primary_color || '#0c0b09'} onChange={v => update('primary_color', v)} />
            <ColorInput label="Accent" value={form.accent_color || '#d4af64'} onChange={v => update('accent_color', v)} />
            <ColorInput label="Background" value={form.background || ''} onChange={v => update('background', v)} />
            <ColorInput label="Text" value={form.text_color || ''} onChange={v => update('text_color', v)} />
            <ColorInput label="Surface" value={form.surface_color || ''} onChange={v => update('surface_color', v)} />
          </div>
        </Section>

        <Section title="Fonts" icon="✒️">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <InputRow label="Heading" value={form.font_heading || 'Cormorant Garamond'} onChange={v => update('font_heading', v)} />
            <InputRow label="Body" value={form.font_body || 'Inter'} onChange={v => update('font_body', v)} />
          </div>
        </Section>

        <Section title="Border Frame" icon="🖼️" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={border.visible} onChange={e => updateLayout({ border: { ...border, visible: e.target.checked } })}
                style={{ accentColor: 'var(--color-gold, #d4af64)' }} /> Show border
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem' }}>
              <InputRow label="Inset %" value={border.inset} onChange={v => updateLayout({ border: { ...border, inset: Number(v) } })} type="number" min={1} max={20} />
              <InputRow label="Opacity" value={border.opacity} onChange={v => updateLayout({ border: { ...border, opacity: Number(v) } })} type="number" min={0} max={1} step={0.05} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <label style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Style</label>
                <select value={border.style} onChange={e => updateLayout({ border: { ...border, style: e.target.value as 'solid' | 'dashed' | 'dotted' } })}
                  style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)', padding: '0.3rem', borderRadius: '3px', fontSize: '0.7rem' }}>
                  <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                </select>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Back Elements" icon="📋">
          {([
            { key: 'when_to_use' as BackElementKey, label: 'When to Use' },
            { key: 'phrase' as BackElementKey, label: 'Phrase' },
            { key: 'instruction' as BackElementKey, label: 'Instruction' },
            { key: 'fun_fact' as BackElementKey, label: 'Fun Fact' },
            { key: 'answer' as BackElementKey, label: 'Answer' },
            { key: 'qr' as BackElementKey, label: 'QR Code' },
            { key: 'brand' as BackElementKey, label: 'Brand' },
          ]).map(({ key, label }) => (
            <ElementEditor
              key={key}
              elemKey={key}
              label={label}
              el={getElement(layout, key)}
              text={getSampleText(layout, key)}
              onUpdate={updateElement}
              onUpdateText={updateSampleText}
            />
          ))}
        </Section>
      </div>

      {/* ── RIGHT: CANVAS ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#090909', position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid bg */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px', pointerEvents: 'none',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, padding: '0.8rem 1.2rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', zIndex: 5,
        }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['front', 'back'] as const).map(s => (
              <button key={s} type="button" onClick={() => setPreviewSide(s)} style={{
                padding: '0.3rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer',
                background: previewSide === s ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: previewSide === s ? 'white' : 'rgba(255,255,255,0.35)',
                border: `1px solid ${previewSide === s ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: '4px', textTransform: 'capitalize', transition: 'all 0.15s',
              }}>{s === 'front' ? '♠ Front' : '♦ Back'}</button>
            ))}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
            {w}×{h}mm · {scalePx.w}×{scalePx.h}px
          </span>
        </div>

        {/* Card */}
        <div style={{ cursor: 'pointer' }} onClick={() => setPreviewSide(s => s === 'front' ? 'back' : 'front')}>
          {previewSide === 'front' ? (
            <FrontFaceCanvas template={form} scalePx={scalePx} />
          ) : (
            <BackFaceCanvas template={form} layout={layout} scalePx={scalePx} />
          )}
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: '0.8rem', left: 0, right: 0,
          textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: '0.65rem',
        }}>
          Click card to flip · {form.name || 'Untitled'}
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
    try { setTemplates(await repo.getAll()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { loadTemplates(); }, []);

  const editingTemplate = editingId ? templates.find(t => t.id === editingId) : null;

  async function handleCreate(t: DesignTemplateInput) {
    await repo.create(t); setCreating(false); await loadTemplates();
  }
  async function handleUpdate(t: DesignTemplateInput) {
    await repo.update(t.id, t); setEditingId(null); await loadTemplates();
  }
  async function handleDelete(id: string) {
    if (!confirm(`Delete "${id}"?`)) return;
    await repo.delete(id); await loadTemplates();
  }

  if (creating) {
    return <TemplateEditor initial={{
      font_heading: 'Cormorant Garamond', font_body: 'Inter',
      primary_color: '#0c0b09', accent_color: '#d4af64',
      card_width: 88, card_height: 63, card_unit: 'mm', layout_config: {},
    }} onSave={handleCreate} onCancel={() => setCreating(false)} isNew />;
  }

  if (editingTemplate) {
    return <TemplateEditor initial={editingTemplate} onSave={handleUpdate} onCancel={() => setEditingId(null)} isNew={false} />;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <Link to="/admin" style={{ color: 'var(--color-gold, #d4af64)', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Dashboard</Link>
          <h1 style={{ margin: '0.5rem 0 0' }}>🎨 Design Templates</h1>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary" style={{ fontSize: '0.85rem' }}>+ New Template</button>
      </div>
      <p style={{ opacity: 0.5, marginBottom: '2rem', fontSize: '0.9rem' }}>Click a template to open the editor.</p>

      {loading && <p style={{ opacity: 0.5 }}>Loading...</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
        {templates.map((tpl) => {
          const bg = tpl.background || tpl.primary_color;
          const accent = tpl.accent_color;
          return (
            <div key={tpl.id} onClick={() => setEditingId(tpl.id)} style={{
              background: '#1a1a1a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ height: '50px', display: 'flex' }}>
                <div style={{ flex: 2, background: bg }} />
                <div style={{ flex: 1, background: accent }} />
                {tpl.surface_color && <div style={{ flex: 1, background: tpl.surface_color }} />}
              </div>
              <div style={{ padding: '0.6rem 0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.85rem' }}>{tpl.name}</h3>
                  <button onClick={e => { e.stopPropagation(); handleDelete(tpl.id); }} style={{
                    background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', opacity: 0.4,
                  }}>🗑️</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                  <code style={{ fontSize: '0.6rem', opacity: 0.25 }}>{tpl.id}</code>
                  <span style={{ fontSize: '0.6rem', opacity: 0.25, fontFamily: 'monospace' }}>{tpl.card_width}×{tpl.card_height}mm</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0', opacity: 0.4 }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎨</p>
          <p>No templates yet.</p>
        </div>
      )}
    </div>
  );
}
