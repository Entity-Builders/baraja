import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template } from '@pdfme/common';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { buildPdfmeFonts, pdfmePlugins } from '../../../../lib/pdfmeConfig';

interface DeckDesignerRunnerProps {
  deck: RawDeckContent;
  template: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  cardWidth: number;
  cardHeight: number;
  onFaceChange: (f: 'front' | 'back') => void;
  onCardSizeChange: (w: number, h: number) => void;
  onSave: (tpl: Template) => void;
}

export interface DeckDesignerRunnerRef {
  getLatestCombinedTemplate: () => Template | null;
}

export const DeckDesignerRunner = forwardRef<DeckDesignerRunnerRef, DeckDesignerRunnerProps>(({
  deck,
  template,
  mockData,
  activeFace,
  cardWidth,
  cardHeight,
  onFaceChange,
  onCardSizeChange,
  onSave,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);

  const [saving, setSaving] = useState(false);
  const [hideGuides, setHideGuides] = useState(false);

  // We persist the in-memory edits of the non-visible face here
  const pendingSchemas = useRef<[any[], any[]]>([[], []]);
  const currentFace = useRef<'front' | 'back'>(activeFace);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // 1. Mount/Destroy Single Designer
  useEffect(() => {
    let mounted = true;
    if (!containerRef.current) return;

    buildPdfmeFonts(deck.layout_config as any, template).then(fonts => {
      if (!mounted || !containerRef.current) return;

      const hydratedTpl = JSON.parse(JSON.stringify(template)) as Template;
      pendingSchemas.current = [hydratedTpl.schemas[0] || [], hydratedTpl.schemas[1] || []];

      const initialTpl = { ...hydratedTpl, schemas: [pendingSchemas.current[activeFace === 'front' ? 0 : 1]] };
      currentFace.current = activeFace;

      // Inject mock data for initial load
      initialTpl.schemas = initialTpl.schemas.map(pageSchema =>
        pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) (s as any).content = String(mockData[s.name]);
          return s;
        })
      );

      designerRef.current = new Designer({
        domContainer: containerRef.current,
        template: initialTpl,
        options: { font: fonts, lang: 'en' },
        plugins: pdfmePlugins,
      });
    }).catch(err => {
      console.error('[DeckDesignerRunner] Failed to load fonts:', err);
    });

    return () => {
      mounted = false;
      designerRef.current?.destroy();
      designerRef.current = null;
    };
  }, [deck.id]); // Re-mount entirely when deck changes

  // 2. Handle Face Swap
  useEffect(() => {
    if (!designerRef.current) return;
    if (activeFace === currentFace.current) return;

    // Save current face's WIP schema so we don't lose drag edits
    const wip = designerRef.current.getTemplate();
    const saveIdx = currentFace.current === 'front' ? 0 : 1;
    pendingSchemas.current[saveIdx] = wip.schemas[0] || [];

    // Load new face's schema from our pending cache
    const nextIdx = activeFace === 'front' ? 0 : 1;
    const nextTpl = { ...wip, schemas: [pendingSchemas.current[nextIdx]] };

    // Re-inject mock data so it looks correct visually
    nextTpl.schemas = nextTpl.schemas.map(pageSchema =>
      pageSchema.map(schema => {
        const s = { ...schema };
        if (mockData[s.name] !== undefined) (s as any).content = String(mockData[s.name]);
        return s;
      })
    );

    designerRef.current.updateTemplate(nextTpl);
    currentFace.current = activeFace;
  }, [activeFace, mockData]);

  // 3. Hot-swap card texts when mockData changes while staying on the SAME face
  useEffect(() => {
    if (!designerRef.current) return;
    if (activeFace !== currentFace.current) return; // handled by face swap sync above

    try {
      const wip = designerRef.current.getTemplate();
      const updatedTpl = JSON.parse(JSON.stringify(wip)) as Template;
      updatedTpl.schemas = updatedTpl.schemas.map(pageSchema =>
        pageSchema.map(schema => {
          const s = { ...schema };
          if (mockData[s.name] !== undefined) {
            (s as any).content = String(mockData[s.name]);
          }
          return s;
        })
      );
      designerRef.current.updateTemplate(updatedTpl);
    } catch (err) {
      console.warn('[DeckDesignerRunner] Hot-swap failed:', err);
    }
  }, [mockData, activeFace]);

  // 4. Propagate template changes (e.g. from AI injection) from parent
  useEffect(() => {
    if (!designerRef.current || !template) return;
    // Overwrite the entire pending schemas array with the injected one
    pendingSchemas.current = [
      template.schemas[0] ? [...template.schemas[0]] : [],
      template.schemas[1] ? [...template.schemas[1]] : [],
    ];

    // Force reload active face
    const idx = currentFace.current === 'front' ? 0 : 1;
    const nextTpl = JSON.parse(JSON.stringify(template)) as Template;
    nextTpl.schemas = [pendingSchemas.current[idx]];

    nextTpl.schemas = nextTpl.schemas.map(pageSchema =>
      pageSchema.map(schema => {
        const s = { ...schema };
        if (mockData[s.name] !== undefined) (s as any).content = String(mockData[s.name]);
        return s;
      })
    );
    designerRef.current.updateTemplate(nextTpl);
  }, [template]);

  useImperativeHandle(ref, () => ({
    getLatestCombinedTemplate: () => {
      if (!designerRef.current) return null;
      try {
        // Sync the designer's state to our current running schema cache
        const wip = designerRef.current.getTemplate();
        const idx = currentFace.current === 'front' ? 0 : 1;
        pendingSchemas.current[idx] = wip.schemas[0] || [];

        const st = JSON.parse(JSON.stringify(template)) as Template;
        st.schemas = [
          pendingSchemas.current[0] || [],
          pendingSchemas.current[1] || []
        ];

        // Clean mock data before returning to parent
        st.schemas = st.schemas.map(pageSchema =>
          pageSchema.map(schema => {
            const s = { ...schema };
            if (mockData[s.name] !== undefined) delete (s as any).content;
            return s;
          })
        );
        return st;
      } catch (err) {
        console.error('Failed to get template from designer', err);
        return null;
      }
    }
  }));

  const handleDualSave = async () => {
    if (saving || !designerRef.current) return;
    setSaving(true);
    try {
      // Sync current wip
      const wip = designerRef.current.getTemplate();
      const idx = currentFace.current === 'front' ? 0 : 1;
      pendingSchemas.current[idx] = wip.schemas[0] || [];

      const savedTemplate = JSON.parse(JSON.stringify(template)) as Template;
      savedTemplate.schemas = [
        pendingSchemas.current[0] || [],
        pendingSchemas.current[1] || []
      ];

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

        {/* Card Size Preset Selector */}
        {(() => {
          const CARD_SIZE_PRESETS = [
            { label: '⭐ 6×9',  w: 60,   h: 90,   cost: '🆓',     note: 'Matriz existente — sin costo de troquel' },
            { label: 'Poker',    w: 63,   h: 88,   cost: '💲',     note: 'Estándar universal' },
            { label: 'Bridge',   w: 57,   h: 89,   cost: '💲',     note: 'Clásico angosto' },
            { label: 'TCG',      w: 63.5, h: 88.9, cost: '💲',     note: 'MTG / Pokémon' },
            { label: 'Tarot',    w: 70,   h: 120,  cost: '💲💲',   note: 'Grande vertical' },
            { label: 'Mini',     w: 44,   h: 67,   cost: '💲💲',   note: 'Compacto portátil' },
            { label: 'Square',   w: 70,   h: 70,   cost: '💲💲💲', note: 'Formato cuadrado' },
            { label: 'Jumbo',    w: 89,   h: 127,  cost: '💲💲💲', note: 'Formato grande' },
          ];

          const matchedPreset = CARD_SIZE_PRESETS.find(p => p.w === cardWidth && p.h === cardHeight);
          const selectValue = matchedPreset ? `${matchedPreset.w}x${matchedPreset.h}` : 'custom';

          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tamaño:</span>
              <select
                value={selectValue}
                onChange={e => {
                  if (e.target.value === 'custom') return;
                  const [sw, sh] = e.target.value.split('x').map(Number);
                  onCardSizeChange(sw, sh);
                }}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
                  padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer',
                  outline: 'none', maxWidth: '200px',
                }}
              >
                {CARD_SIZE_PRESETS.map(p => (
                  <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                    {p.label} — {p.w}×{p.h}mm {p.cost}
                  </option>
                ))}
                <option value="custom">✏️ Personalizado</option>
              </select>

              {/* Show dimensions badge (always) + custom inputs if non-standard */}
              {selectValue === 'custom' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                  <input
                    type="number"
                    value={cardWidth}
                    onChange={e => onCardSizeChange(Number(e.target.value) || 0, cardHeight)}
                    style={{
                      background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.12)',
                      padding: '0.3rem 0.4rem', borderRadius: '4px 0 0 4px', fontSize: '0.75rem', width: '48px', textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', padding: '0.3rem 0.25rem', fontSize: '0.75rem' }}>×</span>
                  <input
                    type="number"
                    value={cardHeight}
                    onChange={e => onCardSizeChange(cardWidth, Number(e.target.value) || 0)}
                    style={{
                      background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.12)',
                      padding: '0.3rem 0.4rem', borderRadius: '0 4px 4px 0', fontSize: '0.75rem', width: '48px', textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginLeft: '2px' }}>mm</span>
                </div>
              ) : matchedPreset ? (
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>{matchedPreset.note}</span>
              ) : null}
            </div>
          );
        })()}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />

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

      {/* Single canvas to eliminate duplicate event listener performance tanking */}
      <div className="deck-designer-canvas" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
});
