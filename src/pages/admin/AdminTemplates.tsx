import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import type { Template, Schema } from '@pdfme/common';
import { DesignTemplateRepository } from '../../lib/deckRepository';
import type { DesignTemplateRow, DesignTemplateInput } from '../../lib/deckRepository';
import {
  pdfmePlugins,
  buildPdfmeFonts,
  createDefaultCardTemplate,
} from '../../lib/pdfmeConfig';

const repo = new DesignTemplateRepository();

// ── pdfme Designer wrapper ────────────────────────────

function PdfmeDesigner({
  template,
  onSave,
  onCancel,
  templateRow,
  isNew,
}: {
  template: Template;
  onSave: (pdfmeTemplate: Template, meta: Partial<DesignTemplateInput>) => Promise<void>;
  onCancel: () => void;
  templateRow: Partial<DesignTemplateInput>;
  isNew: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(templateRow.name || '');
  const [slug, setSlug] = useState(templateRow.id || '');
  const [cardWidth, setCardWidth] = useState(templateRow.card_width || 88);
  const [cardHeight, setCardHeight] = useState(templateRow.card_height || 63);

  // Colors for metadata (stored in DB, not in pdfme template)
  const [primaryColor, setPrimaryColor] = useState(templateRow.primary_color || '#0c0b09');
  const [accentColor, setAccentColor] = useState(templateRow.accent_color || '#d4af64');
  const [textColor, setTextColor] = useState(templateRow.text_color || '#f0ebe0');
  const [generatingLayout, setGeneratingLayout] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const fonts = buildPdfmeFonts();

    const designer = new Designer({
      domContainer: containerRef.current,
      template,
      options: {
        font: fonts,
        lang: 'en',
      },
      plugins: pdfmePlugins,
    });

    // Listen for Ctrl+S / Cmd+S
    designer.onSaveTemplate(async (savedTemplate) => {
      if (saving) return;
      handleSave(savedTemplate);
    });

    designerRef.current = designer;

    return () => {
      designer.destroy();
      designerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(pdfmeTemplate?: Template) {
    const tpl = pdfmeTemplate || designerRef.current?.getTemplate();
    if (!tpl) return;
    if (!slug || !name) {
      alert('Template ID and Name are required');
      return;
    }

    setSaving(true);
    try {
      const finalW = (typeof tpl.basePdf === 'object' && 'width' in tpl.basePdf) ? tpl.basePdf.width : cardWidth;
      const finalH = (typeof tpl.basePdf === 'object' && 'height' in tpl.basePdf) ? tpl.basePdf.height : cardHeight;
      
      await onSave(tpl, {
        id: slug,
        name,
        primary_color: primaryColor,
        accent_color: accentColor,
        text_color: textColor,
        card_width: finalW,
        card_height: finalH,
        card_unit: 'mm',
        font_heading: 'Cormorant Garamond',
        font_body: 'Inter',
      });
    } catch (err) {
      alert(`Error saving: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  const updateCardSize = useCallback((w: number, h: number) => {
    setCardWidth(w);
    setCardHeight(h);
    // Update the pdfme template basePdf
    if (designerRef.current) {
      const current = designerRef.current.getTemplate();
      const updated: Template = {
        ...current,
        basePdf: { width: w, height: h, padding: [0, 0, 0, 0] },
      };
      designerRef.current.updateTemplate(updated);
    }
  }, []);

  async function handleAutoLayout() {
    if (!designerRef.current) return;
    const currentTpl = designerRef.current.getTemplate();
    const isHorizontal = typeof currentTpl.basePdf === 'object' && 'width' in currentTpl.basePdf
      ? currentTpl.basePdf.width > currentTpl.basePdf.height
      : cardWidth > cardHeight;
    
    const userPrompt = window.prompt(
      'Describe the layout style to the AI (e.g. "Centered minimalist", "Dark fantasy full bleed"):',
      isHorizontal ? 'Horizontal format layout. Classic card game.' : 'Minimalist clean layout. Classic poker style.'
    );
    if (!userPrompt) return;

    setGeneratingLayout(true);
    try {
      const publicHost = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
      
      const newSchemas = [];
      
      // We process each page/side of the card (e.g. front and back) individually or together.
      // Doing it individually reduces context size and complexity for the AI.
      for (let i = 0; i < currentTpl.schemas.length; i++) {
        const pageElements = currentTpl.schemas[i].map(s => ({
          name: s.name,
          type: s.type,
          // Give AI the current text/color/font to help it know what it is
          content: 'content' in s ? s.content : undefined,
          color: 'color' in s ? s.color : undefined,
          fontColor: 'fontColor' in s ? s.fontColor : undefined,
          fontName: 'fontName' in s ? s.fontName : undefined,
        }));
        
        console.log(`[AI Layout] Generating page ${i}...`, pageElements);
        const res = await fetch(`${publicHost}/functions/v1/baraja-generate-layout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            cardWidth: cardWidth,
            cardHeight: cardHeight,
            elements: pageElements,
            prompt: userPrompt + (i === 1 ? ' (This is the BACK face of the card).' : ' (This is the FRONT face of the card).')
          })
        });
        
        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`API Error ${res.status}: ${errData}`);
        }
        
        const data = await res.json() as { schemas: any[] };
        // The API returns an array for this specific page
        newSchemas.push(data.schemas);
      }
      
      const updatedTemplate = {
        ...currentTpl,
        schemas: newSchemas
      };
      
      designerRef.current.updateTemplate(updatedTemplate);
      alert('✨ Layout generation applied!');
      
    } catch (e: unknown) {
      const err = e as Error;
      alert(`Error generating layout: ${err.message}`);
      console.error(e);
    } finally {
      setGeneratingLayout(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: '#0e0e0e' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 1rem', background: '#131313',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        zIndex: 10, flexShrink: 0,
      }}>
        <button type="button" onClick={onCancel} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', fontSize: '0.85rem', padding: '0.3rem 0.5rem',
        }}>← Back</button>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

        {/* ID */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <label style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>ID</label>
          <input value={slug} onChange={e => setSlug(e.target.value)} disabled={!isNew}
            style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
              padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', width: '120px',
              opacity: isNew ? 1 : 0.5,
            }} />
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <label style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Name</label>
          <input value={name} onChange={e => {
            setName(e.target.value);
            if (isNew) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
          }}
            style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
              padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', width: '180px',
            }} />
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

        {/* Card width & height inputs */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Size:</span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <input 
              type="number"
              value={cardWidth} 
              onChange={e => updateCardSize(Number(e.target.value) || 0, cardHeight)}
              style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
                padding: '0.2rem 0.4rem', borderRadius: '3px 0 0 3px', fontSize: '0.75rem', width: '50px', textAlign: 'center'
              }} 
            />
            <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}>×</span>
            <input 
              type="number"
              value={cardHeight} 
              onChange={e => updateCardSize(cardWidth, Number(e.target.value) || 0)}
              style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
                padding: '0.2rem 0.4rem', borderRadius: '0 3px 3px 0', fontSize: '0.75rem', width: '50px', textAlign: 'center'
              }} 
            />
          </div>
          <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginLeft: '-0.3rem' }}>mm</span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

        {/* Color pickers */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {[
            { label: 'BG', value: primaryColor, set: setPrimaryColor },
            { label: 'Accent', value: accentColor, set: setAccentColor },
            { label: 'Text', value: textColor, set: setTextColor },
          ].map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)' }}>{c.label}</span>
              <input type="color" value={c.value || '#000'} onChange={e => c.set(e.target.value)}
                style={{ width: '20px', height: '20px', border: 'none', cursor: 'pointer', borderRadius: '3px', background: 'transparent', padding: 0 }} />
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Save & Layout */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" disabled={saving || generatingLayout} onClick={() => handleAutoLayout()}
            style={{
              background: 'rgba(255,255,255,0.05)', color: '#d4af64', border: '1px solid rgba(212, 175, 100, 0.3)',
              padding: '0.35rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, opacity: generatingLayout ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.3rem'
            }}>{generatingLayout ? '⏳ Generating...' : '✨ Auto-Layout'}</button>

          <button type="button" disabled={saving || generatingLayout} onClick={() => handleSave()}
            style={{
              background: '#d4af64', color: '#000', border: 'none',
              padding: '0.35rem 1rem', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, opacity: saving ? 0.5 : 1,
            }}>{saving ? 'Saving...' : isNew ? '💾 Create Template' : '💾 Save Template'}</button>
        </div>
      </div>

      {/* pdfme Designer Container */}
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />
    </div>
  );
}

// ── Template List Page ────────────────────────────────

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

  useEffect(() => { loadTemplates(); }, []);

  const editingTemplate = editingId ? templates.find(t => t.id === editingId) : null;

  // Resolve the pdfme Template from the stored layout_config
  function getPdfmeTemplate(row: DesignTemplateRow): Template {
    const config = row.layout_config;
    // If layout_config has a pdfme_template, use it directly (and auto-upgrade old ones)
    if (config && 'basePdf' in config && 'schemas' in config) {
      const template = JSON.parse(JSON.stringify(config)) as Template;
      const defaults = createDefaultCardTemplate(row.card_width, row.card_height);

      // Auto-inject missing sampledata so old DB templates aren't blank
      const currentSample = Array.isArray(template.sampledata) ? template.sampledata : [];
      if (currentSample.length === 0) {
        const defaultSample = (defaults.sampledata as Record<string, string>[])?.[0] || {};
        template.sampledata = [{ ...defaultSample }];
      }

      // LEGACY UPGRADE: If schema only has 1 page, it was the BACK face.
      if (template.schemas && template.schemas.length === 1) {
        // Move the back face to index 1, and insert the default front face at index 0
        template.schemas = [defaults.schemas[0], template.schemas[0]];
      }

      // Auto-upgrade legacy bg and border to rectangle type, and inject missing elements for both pages
      if (template.schemas && template.schemas.length >= 2) {
        template.schemas.forEach((schemaPage, pageIndex) => {
          // Remove old 'text' type bg/border
          ['bg', 'border'].forEach(name => {
            const index = schemaPage.findIndex(s => s.name === name);
            if (index >= 0 && schemaPage[index].type !== 'rectangle') {
              schemaPage.splice(index, 1);
            }
          });

          // Re-inject missing layout essentials from the corresponding default page
          const defaultPage = defaults.schemas[pageIndex] || [];
          const missingObjects: Schema[] = [];
          defaultPage.forEach(defaultObj => {
            if (!schemaPage.some(s => s.name === defaultObj.name)) {
              missingObjects.push(defaultObj);
            }
          });

          // Background and border go to the bottom of the stack (index 0)
          const bgBorder = missingObjects.filter(obj => obj.name === 'bg' || obj.name === 'border');
          // Other items go on top of the stack
          const textStuff = missingObjects.filter(obj => obj.name !== 'bg' && obj.name !== 'border');

          // Unshift adds to the beginning. Add border first, then bg
          bgBorder.reverse().forEach(obj => {
            if (obj) schemaPage.unshift(obj);
          });

          textStuff.forEach(obj => {
            if (obj) schemaPage.push(obj);
          });
        });
      }

      return template;
    }
    // Otherwise create a default one from card dimensions
    return createDefaultCardTemplate(row.card_width, row.card_height);
  }

  async function handleCreate(pdfmeTemplate: Template, meta: Partial<DesignTemplateInput>) {
    const input: DesignTemplateInput = {
      id: meta.id || 'untitled',
      name: meta.name || 'Untitled',
      primary_color: meta.primary_color || '#0c0b09',
      accent_color: meta.accent_color || '#d4af64',
      font_heading: meta.font_heading || 'Cormorant Garamond',
      font_body: meta.font_body || 'Inter',
      background: meta.primary_color || '#0c0b09',
      text_color: meta.text_color || '#f0ebe0',
      surface_color: null,
      card_width: meta.card_width || 88,
      card_height: meta.card_height || 63,
      card_unit: 'mm',
      // Store the full pdfme template as layout_config
      layout_config: pdfmeTemplate as unknown as DesignTemplateRow['layout_config'],
    };
    await repo.create(input);
    setCreating(false);
    await loadTemplates();

    const channel = new BroadcastChannel('baraja_template_updates');
    channel.postMessage({ type: 'TEMPLATE_UPDATED', id: input.id });
    channel.close();
  }

  async function handleUpdate(pdfmeTemplate: Template, meta: Partial<DesignTemplateInput>) {
    if (!editingId) return;
    await repo.update(editingId, {
      ...meta,
      background: meta.primary_color,
      layout_config: pdfmeTemplate as unknown as DesignTemplateRow['layout_config'],
    });
    setEditingId(null);
    await loadTemplates();

    const channel = new BroadcastChannel('baraja_template_updates');
    channel.postMessage({ type: 'TEMPLATE_UPDATED', id: editingId });
    channel.close();
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete "${id}"?`)) return;
    await repo.delete(id);
    await loadTemplates();
  }

  // ── Editor views ──

  if (creating) {
    const defaultTemplate = createDefaultCardTemplate(88, 63);
    return (
      <PdfmeDesigner
        template={defaultTemplate}
        onSave={handleCreate}
        onCancel={() => setCreating(false)}
        templateRow={{
          font_heading: 'Cormorant Garamond',
          font_body: 'Inter',
          primary_color: '#0c0b09',
          accent_color: '#d4af64',
          text_color: '#f0ebe0',
          card_width: 88,
          card_height: 63,
          card_unit: 'mm',
        }}
        isNew
      />
    );
  }

  if (editingTemplate) {
    return (
      <PdfmeDesigner
        template={getPdfmeTemplate(editingTemplate)}
        onSave={handleUpdate}
        onCancel={() => setEditingId(null)}
        templateRow={editingTemplate}
        isNew={false}
      />
    );
  }

  // ── List view ──

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <Link to="/admin" style={{ color: '#d4af64', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Dashboard</Link>
          <h1 style={{ margin: '0.5rem 0 0' }}>🎨 Design Templates</h1>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary" style={{ fontSize: '0.85rem' }}>+ New Template</button>
      </div>
      <p style={{ opacity: 0.5, marginBottom: '2rem', fontSize: '0.9rem' }}>
        Powered by <strong>pdfme</strong> — drag & drop template designer. What you design is what the PDF outputs.
      </p>

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
                  <span style={{ fontSize: '0.6rem', opacity: 0.25, fontFamily: 'monospace' }}>
                    {tpl.card_width}×{tpl.card_height}mm
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0', opacity: 0.4 }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎨</p>
          <p>No templates yet. Click <strong>+ New Template</strong> to start designing.</p>
        </div>
      )}
    </div>
  );
}
