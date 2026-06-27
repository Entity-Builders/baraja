import { useCallback, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Designer } from '@pdfme/ui';
import type { Schema, Template } from '@pdfme/common';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { buildPdfmeFonts, pdfmePlugins } from '../../../../lib/pdfmeConfig';
import { PdfmeTemplatePreview } from '../../../../components/cards/PdfmeTemplatePreview';
import { normalizeTemplateFieldAliases } from '../../../../lib/cardFieldPlacements';
import {
  getStoredSchemas,
  injectMockDataIntoSchemas,
  prepareDesignerTemplate,
  stripMockDataFromSchemas,
} from './deckStudioTemplateUtils';
import { DeckDesignerToolbar } from './DeckDesignerToolbar';

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

function TemplatePreviewCard({
  template,
  mockData,
  activeFace,
  cardWidth,
  cardHeight,
}: {
  template: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  cardWidth: number;
  cardHeight: number;
}) {
  return (
    <PdfmeTemplatePreview
      template={template}
      mockData={mockData}
      activeFace={activeFace}
      fallbackWidth={cardWidth}
      fallbackHeight={cardHeight}
      variant="stage"
    />
  );
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
  const [showTechnicalEditor, setShowTechnicalEditor] = useState(false);

  // We persist the in-memory edits of the non-visible face here
  const pendingSchemas = useRef<[Schema[], Schema[]]>([[], []]);
  const currentFace = useRef<'front' | 'back'>(activeFace);

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // 1. Mount/Destroy Single Designer
  useEffect(() => {
    let mounted = true;
    if (!showTechnicalEditor) return;
    if (!containerRef.current) return;

    const fontHints = deck.design_template_overrides?.layout_config as Parameters<typeof buildPdfmeFonts>[0];
    buildPdfmeFonts(fontHints, template).then(async fonts => {
      if (!mounted || !containerRef.current) return;

      const hydratedTpl = await prepareDesignerTemplate(template, mockData);
      if (!mounted || !containerRef.current) return;

      pendingSchemas.current = getStoredSchemas(hydratedTpl, mockData);

      const initialTpl = { ...hydratedTpl, schemas: [pendingSchemas.current[activeFace === 'front' ? 0 : 1]] };
      currentFace.current = activeFace;

      // Inject mock data for initial load
      initialTpl.schemas = injectMockDataIntoSchemas(initialTpl.schemas, mockData);

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
  }, [deck.id, showTechnicalEditor]); // Re-mount entirely when deck changes or technical editor opens

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

    let cancelled = false;

    void prepareDesignerTemplate(nextTpl, mockData).then(readableTpl => {
      if (cancelled || !designerRef.current) return;
      pendingSchemas.current[nextIdx] = getStoredSchemas(readableTpl, mockData)[0] || [];
      designerRef.current.updateTemplate(readableTpl);
      currentFace.current = activeFace;
    });

    return () => {
      cancelled = true;
    };
  }, [activeFace, mockData]);

  // 3. Hot-swap card texts when mockData changes while staying on the SAME face
  useEffect(() => {
    if (!designerRef.current) return;
    if (activeFace !== currentFace.current) return; // handled by face swap sync above

    try {
      const wip = designerRef.current.getTemplate();
      const activeIdx = currentFace.current === 'front' ? 0 : 1;
      const baseTpl = JSON.parse(JSON.stringify(wip)) as Template;
      baseTpl.schemas = stripMockDataFromSchemas(baseTpl.schemas, mockData);

      void prepareDesignerTemplate(baseTpl, mockData).then(readableTpl => {
        if (!designerRef.current) return;
        pendingSchemas.current[activeIdx] = getStoredSchemas(readableTpl, mockData)[0] || [];
        designerRef.current.updateTemplate(readableTpl);
      });
    } catch (err) {
      console.warn('[DeckDesignerRunner] Hot-swap failed:', err);
    }
  }, [mockData, activeFace]);

  // 4. Propagate template changes (e.g. from AI injection) from parent
  useEffect(() => {
    if (!designerRef.current || !template) return;
    let cancelled = false;

    void prepareDesignerTemplate(template, mockData).then(readableTemplate => {
      if (cancelled || !designerRef.current) return;

      pendingSchemas.current = getStoredSchemas(readableTemplate, mockData);

      // Force reload active face
      const idx = currentFace.current === 'front' ? 0 : 1;
      const nextTpl = { ...readableTemplate, schemas: [readableTemplate.schemas[idx] || []] };
      designerRef.current.updateTemplate(nextTpl);
    });

    return () => {
      cancelled = true;
    };
  }, [template]);

  useImperativeHandle(ref, () => ({
    getLatestCombinedTemplate: () => {
      if (!designerRef.current) return null;
      try {
        // Sync the designer's state to our current running schema cache
        const wip = designerRef.current.getTemplate();
        const idx = currentFace.current === 'front' ? 0 : 1;
        pendingSchemas.current[idx] = wip.schemas[0] || [];

        const st = normalizeTemplateFieldAliases(template);
        st.schemas = [
          pendingSchemas.current[0] || [],
          pendingSchemas.current[1] || []
        ];

        // Clean mock data before returning to parent
        st.schemas = stripMockDataFromSchemas(st.schemas, mockData);
        return normalizeTemplateFieldAliases(st);
      } catch (err) {
        console.error('Failed to get template from designer', err);
        return null;
      }
    }
  }));

  const handleDualSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!designerRef.current) {
        await onSaveRef.current(template);
        return;
      }

      // Sync current wip
      const wip = designerRef.current.getTemplate();
      const idx = currentFace.current === 'front' ? 0 : 1;
      pendingSchemas.current[idx] = wip.schemas[0] || [];

      const savedTemplate = normalizeTemplateFieldAliases(template);
      savedTemplate.schemas = [
        pendingSchemas.current[0] || [],
        pendingSchemas.current[1] || []
      ];

      // Strip injected mock content before saving to DB
      const cleanTpl = JSON.parse(JSON.stringify(savedTemplate)) as Template;
      cleanTpl.schemas = stripMockDataFromSchemas(cleanTpl.schemas, mockData);

      await onSaveRef.current(normalizeTemplateFieldAliases(cleanTpl));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [mockData, saving, template]);

  const handleToggleGuides = useCallback(() => {
    setHideGuides(prev => !prev);
  }, []);

  const handleToggleTechnicalEditor = useCallback(() => {
    setShowTechnicalEditor(prev => !prev);
  }, []);

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

      <DeckDesignerToolbar
        activeFace={activeFace}
        cardHeight={cardHeight}
        cardWidth={cardWidth}
        hideGuides={hideGuides}
        saving={saving}
        showTechnicalEditor={showTechnicalEditor}
        onCardSizeChange={onCardSizeChange}
        onFaceChange={onFaceChange}
        onSave={handleDualSave}
        onToggleGuides={handleToggleGuides}
        onToggleTechnicalEditor={handleToggleTechnicalEditor}
      />

      {showTechnicalEditor ? (
        <div className="deck-designer-canvas" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      ) : (
        <TemplatePreviewCard
          template={template}
          mockData={mockData}
          activeFace={activeFace}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      )}
    </div>
  );
});
