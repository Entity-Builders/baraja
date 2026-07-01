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
  previewTemplate?: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  cardWidth: number;
  cardHeight: number;
  analyzing?: boolean;
  autoLayoutUnavailableReason?: string;
  onFaceChange: (f: 'front' | 'back') => void;
  onCardSizeChange: (w: number, h: number) => void;
  onSave: (tpl: Template) => void;
  onAutoLayout?: () => void;
  onFocusBackgroundTools?: () => void;
  onTemplateDraftChange?: (tpl: Template) => void;
}

export interface DeckDesignerRunnerRef {
  getLatestCombinedTemplate: () => Template | null;
}

function TemplatePreviewCard({
  template,
  previewTemplate,
  mockData,
  activeFace,
  cardWidth,
  cardHeight,
}: {
  template: Template;
  previewTemplate?: Template;
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  cardWidth: number;
  cardHeight: number;
}) {
  const renderedTemplate = previewTemplate ?? template;

  return (
    <PdfmeTemplatePreview
      template={renderedTemplate}
      mockData={mockData}
      activeFace={activeFace}
      fallbackWidth={cardWidth}
      fallbackHeight={cardHeight}
      variant="stage"
      respectExplicitColors={renderedTemplate === template}
    />
  );
}

export const DeckDesignerRunner = forwardRef<DeckDesignerRunnerRef, DeckDesignerRunnerProps>(({
  deck,
  template,
  previewTemplate,
  mockData,
  activeFace,
  cardWidth,
  cardHeight,
  analyzing,
  autoLayoutUnavailableReason,
  onFaceChange,
  onAutoLayout,
  onFocusBackgroundTools,
  onCardSizeChange,
  onSave,
  onTemplateDraftChange,
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
  // Re-mount entirely when deck changes or technical editor opens. Template and
  // sample updates are hot-swapped by the effects below to preserve WIP edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.id, showTechnicalEditor]);

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
  // Template changes are propagated here; mock data changes are handled by the
  // hot-swap effect above so card navigation does not reset the editor shell.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const getLatestCombinedTemplate = useCallback((): Template | null => {
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
  }, [mockData, template]);

  useImperativeHandle(ref, () => ({
    getLatestCombinedTemplate,
  }), [getLatestCombinedTemplate]);

  const handleDualSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!designerRef.current) {
        await onSaveRef.current(template);
        return;
      }

      // Sync current wip
      const latestTemplate = getLatestCombinedTemplate();
      if (!latestTemplate) return;

      await onSaveRef.current(latestTemplate);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [getLatestCombinedTemplate, saving, template]);

  const handleToggleGuides = useCallback(() => {
    setHideGuides(prev => !prev);
  }, []);

  const handleToggleTechnicalEditor = useCallback(() => {
    if (showTechnicalEditor) {
      const confirmed = window.confirm('Volver a vista limpia? Los cambios tecnicos quedaran en la vista previa, pero no se guardan hasta usar Guardar layout.');
      if (!confirmed) return;

      const latestTemplate = getLatestCombinedTemplate();
      if (latestTemplate) {
        onTemplateDraftChange?.(latestTemplate);
      }
    }

    setShowTechnicalEditor(prev => !prev);
  }, [getLatestCombinedTemplate, onTemplateDraftChange, showTechnicalEditor]);

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
          .deck-designer-canvas--hide-guides .ruler-container,
          .deck-designer-canvas--hide-guides .scena-guides-manager,
          .deck-designer-canvas--hide-guides .scena-guides-guide-origin,
          .deck-designer-canvas--hide-guides .scena-guides-guides,
          .deck-designer-canvas--hide-guides .scena-guides-guide,
          .deck-designer-canvas--hide-guides .scena-guides-display-drag,
          .deck-designer-canvas--hide-guides .scena-guides-guide-adder,
          .deck-designer-canvas--hide-guides .moveable-control-box,
          .deck-designer-canvas--hide-guides .moveable-line,
          .deck-designer-canvas--hide-guides .moveable-control,
          .deck-designer-canvas--hide-guides .pdfme-designer-delete-button {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }

          .deck-designer-canvas--hide-guides [style*="outline"] {
            outline: none !important;
          }

          .deck-designer-canvas--hide-guides [style*="box-shadow"] {
            box-shadow: none !important;
          }
        ` : ''}
      `}} />

      <DeckDesignerToolbar
        activeFace={activeFace}
        cardHeight={cardHeight}
        cardWidth={cardWidth}
        hideGuides={hideGuides}
        saving={saving}
        showTechnicalEditor={showTechnicalEditor}
        analyzing={analyzing}
        autoLayoutUnavailableReason={autoLayoutUnavailableReason}
        onCardSizeChange={onCardSizeChange}
        onFaceChange={onFaceChange}
        onAutoLayout={onAutoLayout}
        onFocusBackgroundTools={onFocusBackgroundTools}
        onSave={handleDualSave}
        onToggleGuides={handleToggleGuides}
        onToggleTechnicalEditor={handleToggleTechnicalEditor}
      />

      {showTechnicalEditor ? (
        <div className={`deck-designer-canvas${hideGuides ? ' deck-designer-canvas--hide-guides' : ''}`} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      ) : (
        <TemplatePreviewCard
          template={template}
          previewTemplate={previewTemplate}
          mockData={mockData}
          activeFace={activeFace}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      )}
    </div>
  );
});
