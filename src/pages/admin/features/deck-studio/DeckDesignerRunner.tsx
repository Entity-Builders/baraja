import React, { useState, useEffect, useRef } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { buildPdfmeFonts, pdfmePlugins } from '../../../../lib/pdfmeConfig';

interface DeckDesignerRunnerProps {
  deck: RawDeckContent;
  template: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  onFaceChange: (f: 'front' | 'back') => void;
  onSave: (tpl: Template) => void;
}

export function DeckDesignerRunner({
  deck,
  template,
  mockData,
  activeFace,
  onFaceChange,
  onSave,
}: DeckDesignerRunnerProps) {
  const frontContainerRef = useRef<HTMLDivElement>(null);
  const backContainerRef = useRef<HTMLDivElement>(null);

  const frontDesignerRef = useRef<Designer | null>(null);
  const backDesignerRef = useRef<Designer | null>(null);

  const [saving, setSaving] = useState(false);
  const [hideGuides, setHideGuides] = useState(false);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Mount/destroy designers when deck changes
  useEffect(() => {
    let mounted = true;
    if (!frontContainerRef.current || !backContainerRef.current) return;

    buildPdfmeFonts(deck.layout_config as any, template).then(fonts => {
      if (!mounted || !frontContainerRef.current || !backContainerRef.current) return;

      // Inject mock data so we see visuals perfectly
      const hydratedTpl = JSON.parse(JSON.stringify(template)) as Template;
      hydratedTpl.schemas = hydratedTpl.schemas.map(pageSchema =>
        pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) {
            (s as any).content = String(mockData[s.name]);
          }
          return s;
        })
      );

      const frontTpl = { ...hydratedTpl, schemas: hydratedTpl.schemas[0] ? [hydratedTpl.schemas[0]] : [] };
      const backTpl  = { ...hydratedTpl, schemas: hydratedTpl.schemas[1] ? [hydratedTpl.schemas[1]] : [] };

      frontDesignerRef.current = new Designer({
        domContainer: frontContainerRef.current,
        template: frontTpl,
        options: { font: fonts, lang: 'en' },
        plugins: pdfmePlugins,
      });

      backDesignerRef.current = new Designer({
        domContainer: backContainerRef.current,
        template: backTpl,
        options: { font: fonts, lang: 'en' },
        plugins: pdfmePlugins,
      });
    }).catch(err => {
      console.error('[DeckDesignerRunner] Failed to load fonts:', err);
    });

    return () => {
      mounted = false;
      frontDesignerRef.current?.destroy();
      frontDesignerRef.current = null;
      backDesignerRef.current?.destroy();
      backDesignerRef.current = null;
    };
  }, [deck.id]); // Re-mount entirely when deck changes

  // Hot-swap card texts when mockData changes without losing layout edits
  useEffect(() => {
    if (!frontDesignerRef.current || !backDesignerRef.current) return;
    try {
      const runHotSwap = (designer: Designer) => {
        const currentTpl = designer.getTemplate();
        const updatedTpl = JSON.parse(JSON.stringify(currentTpl)) as Template;
        updatedTpl.schemas = updatedTpl.schemas.map(pageSchema =>
          pageSchema.map(schema => {
            const s = { ...schema };
            if (mockData[s.name] !== undefined) {
              (s as any).content = String(mockData[s.name]);
            }
            return s;
          })
        );
        designer.updateTemplate(updatedTpl);
      };
      runHotSwap(frontDesignerRef.current);
      runHotSwap(backDesignerRef.current);
    } catch (err) {
      console.warn('[DeckDesignerRunner] Hot-swap failed:', err);
    }
  }, [mockData]);

  // Propagate template changes (e.g. from AI generation) without full remount
  useEffect(() => {
    if (!frontDesignerRef.current || !backDesignerRef.current || !template) return;
    try {
      const hydratedTpl = JSON.parse(JSON.stringify(template)) as Template;
      hydratedTpl.schemas = hydratedTpl.schemas.map(pageSchema =>
        pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) {
            (s as any).content = String(mockData[s.name]);
          }
          return s;
        })
      );

      const fTpl = { ...hydratedTpl, schemas: hydratedTpl.schemas[0] ? [hydratedTpl.schemas[0]] : [] };
      const bTpl = { ...hydratedTpl, schemas: hydratedTpl.schemas[1] ? [hydratedTpl.schemas[1]] : [] };
      
      frontDesignerRef.current.updateTemplate(fTpl);
      backDesignerRef.current.updateTemplate(bTpl);
    } catch (err) {
      console.warn('[DeckDesignerRunner] Template update sync failed:', err);
    }
  }, [template]); // Run when parent provides a new template

  const handleDualSave = async () => {
    if (saving || !frontDesignerRef.current || !backDesignerRef.current) return;
    setSaving(true);
    try {
      const fTpl = frontDesignerRef.current.getTemplate();
      const bTpl = backDesignerRef.current.getTemplate();

      const savedTemplate = JSON.parse(JSON.stringify(template)) as Template;
      savedTemplate.schemas = [fTpl.schemas[0] || [], bTpl.schemas[0] || []];

      // Strip injected mock content before saving to DB
      const cleanTpl = JSON.parse(JSON.stringify(savedTemplate)) as Template;
      cleanTpl.schemas = cleanTpl.schemas.map(pageSchema =>
        pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) delete (s as any).content;
          return s;
        })
      );

      await onSaveRef.current(cleanTpl);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scoped CSS: reposition pdfme zoom bar to bottom-right corner */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* pdfme centers the control-bar via inline left:calc(50% - N). Override to right-align. */
        .deck-designer-canvas .pdfme-ui-control-bar {
          left: auto !important;
          right: 12px !important;
          position: absolute !important;
        }
        ${hideGuides ? `
          .deck-designer-canvas .pdfme-document { pointer-events: none !important; }
          .deck-designer-canvas .pdfme-document .pdfme-schema { outline: none !important; border: none !important; }
          .moveable-control-box, .moveable-line, .moveable-control { display: none !important; opacity: 0 !important; }
        ` : ''}
      `}} />

      {/* Editor Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#131313', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Face Toggles */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#000', padding: '4px', borderRadius: '6px' }}>
          {(['front', 'back'] as const).map(face => (
            <button
              key={face}
              onClick={() => onFaceChange(face)}
              style={{
                padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.75rem',
                background: activeFace === face ? 'var(--color-gold)' : 'transparent',
                color: activeFace === face ? '#000' : '#888',
              }}
            >
              {face === 'front' ? '🖼️ FRENTE' : '📝 DORSO'}
            </button>
          ))}
        </div>

        {/* View Toggles & Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setHideGuides(!hideGuides)}
            style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
          >
            {hideGuides ? '👁️ Mostrar guías' : '🚫 Ocultar guías'}
          </button>
          <button
            onClick={handleDualSave}
            disabled={saving}
            style={{ background: 'var(--color-gold)', color: '#000', border: 'none', padding: '0.4rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
          >
            {saving ? 'Guardando...' : '💾 Guardar Layout'}
          </button>
        </div>
      </div>

      {/* Stacked canvases — hidden via opacity to preserve dimensions */}
      <div className="deck-designer-canvas" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
        {(['front', 'back'] as const).map(face => (
          <div
            key={face}
            style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              opacity: activeFace === face ? 1 : 0,
              pointerEvents: activeFace === face ? 'auto' : 'none',
              zIndex: activeFace === face ? 10 : 1,
            }}
          >
            <div ref={face === 'front' ? frontContainerRef : backContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
