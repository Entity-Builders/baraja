import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Template, Schema } from '@pdfme/common';
import { DesignTemplateRepository } from '../../lib/deckRepository';
import type { DesignTemplateRow, DesignTemplateInput } from '../../lib/deckRepository';
import { createDefaultCardTemplate } from '../../lib/pdfmeConfig';
import { TemplateDesigner } from '../../components/admin/TemplateDesigner';

const repo = new DesignTemplateRepository();

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
      <TemplateDesigner
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
      <TemplateDesigner
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
