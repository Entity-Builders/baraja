import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Designer } from '@pdfme/ui';
import type { Template, Schema } from '@pdfme/common';
import type { DesignTemplateInput } from '../../lib/deckRepository';
import type { RawDeckContent } from '@eb-packages/deck-engine';
import { SupabaseDeckRepository } from '../../lib/deckRepository';
import { pdfmePlugins, buildPdfmeFonts } from '../../lib/pdfmeConfig';
import { SvgGeneratorModal } from './SvgGeneratorModal';
import { TemplateDesignerToolbar } from './TemplateDesignerToolbar';

export interface TemplateDesignerProps {
  template: Template;
  onSave: (pdfmeTemplate: Template, meta: Partial<DesignTemplateInput>) => Promise<void>;
  onCancel: () => void;
  templateRow: Partial<DesignTemplateInput>;
  isNew: boolean;
}

export function TemplateDesigner({
  template,
  onSave,
  onCancel,
  templateRow,
  isNew,
}: TemplateDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(templateRow.name || '');
  const [slug, setSlug] = useState(templateRow.id || '');
  const [cardWidth, setCardWidth] = useState(templateRow.card_width || 70);
  const [cardHeight, setCardHeight] = useState(templateRow.card_height || 120);

  // Colors for metadata
  const [primaryColor, setPrimaryColor] = useState(templateRow.primary_color || '#0c0b09');
  const [accentColor, setAccentColor] = useState(templateRow.accent_color || '#d4af64');
  const [textColor, setTextColor] = useState(templateRow.text_color || '#f0ebe0');
  const [generatingLayout, setGeneratingLayout] = useState(false);

  // Concept Art State
  const [conceptModalOpen, setConceptModalOpen] = useState(false);
  const [conceptAvailableFields, setConceptAvailableFields] = useState<string[]>([]);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 3000);
  };


  // Mock data state
  const [editions, setEditions] = useState<RawDeckContent[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState<string>('');

  useEffect(() => {
    new SupabaseDeckRepository().getAllDecks()
      .then(data => setEditions(data))
      .catch(err => console.error('Error loading mock decks:', err));
  }, []);

  function handleApplyMockData(editionId: string) {
    setSelectedEditionId(editionId);
    if (!editionId || !designerRef.current) return;
    
    const deck = editions.find(e => e.id === editionId);
    if (!deck || !deck.cards || deck.cards.length === 0) return;
    
    const firstCard = deck.cards[0];
    const mockData: Record<string, string> = {
      art: firstCard.front.art_url || '',
      art_url: firstCard.front.art_url || '',
      number: `#${String(firstCard.front.number).padStart(2, '0')}`,
      title: firstCard.front.title,
      when_to_use: firstCard.back?.when_to_use || '',
      phrase: firstCard.back?.phrase ? `"${firstCard.back.phrase}"` : '',
      instruction: firstCard.back?.instruction || '',
      answer: firstCard.back?.answer ? `Rta: ${firstCard.back.answer}` : '',
      fun_fact: firstCard.back?.fun_fact ? `💡 ${firstCard.back.fun_fact}` : '',
      qr: firstCard.back?.qr_url || 'https://baraja.cards',
      brand: `Baraja · ${deck.name}`,
    };

    const currentTpl = designerRef.current.getTemplate();
    const newSchemas = currentTpl.schemas.map(pageSchema => {
      return pageSchema.map(schema => {
        if (mockData[schema.name] !== undefined && mockData[schema.name] !== null) {
          return { ...schema, content: String(mockData[schema.name]) };
        }
        return schema;
      });
    });

    const updated = { ...currentTpl, sampledata: [mockData], schemas: newSchemas };
    designerRef.current.updateTemplate(updated);
  }

  useEffect(() => {
    let mounted = true;
    if (!containerRef.current) return;

    buildPdfmeFonts().then(fonts => {
      if (!mounted || !containerRef.current) return;
      
      const designer = new Designer({
        domContainer: containerRef.current,
        template,
        options: { font: fonts, lang: 'en' },
        plugins: pdfmePlugins,
      });

      designer.onSaveTemplate(async (savedTemplate) => {
        if (saving) return;
        handleSave(savedTemplate);
      });

      designerRef.current = designer;
    }).catch(err => {
      console.error("[TemplateDesigner] Failed to load fonts:", err);
    });

    return () => {
      mounted = false;
      if (designerRef.current) {
        designerRef.current.destroy();
        designerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(pdfmeTemplate?: Template) {
    const tpl = pdfmeTemplate || designerRef.current?.getTemplate();
    if (!tpl) return;
    if (!slug || !name) {
      showNotification('Template ID and Name are required', 'error');
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
      showNotification(`Error saving: ${err}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const updateCardSize = useCallback((w: number, h: number) => {
    setCardWidth(w);
    setCardHeight(h);
    if (designerRef.current) {
      const current = designerRef.current.getTemplate();
      const updated: Template = {
        ...current,
        basePdf: { width: w, height: h, padding: [0, 0, 0, 0] },
      };
      designerRef.current.updateTemplate(updated);
    }
  }, []);

  function openConceptModal() {
    if (!designerRef.current) return;
    const schemas = designerRef.current.getTemplate().schemas;
    const fields = new Set<string>();
    schemas.forEach(page => page.forEach(el => {
      // Allow targeting any element, especially borders/backgrounds for frames
      fields.add(el.name);
    }));
    setConceptAvailableFields(Array.from(fields));
    setConceptModalOpen(true);
  }

  function getElementDimensions(elementName: string) {
    if (!designerRef.current) return null;
    const schemas = designerRef.current.getTemplate().schemas;
    for (const page of schemas) {
      const el = page.find(s => s.name === elementName);
      if (el) return { width: el.width, height: el.height };
    }
    return null;
  }

  function handleApplySvg(elementName: string, svgContent: string) {
    if (!designerRef.current) return;
    const currentTpl = designerRef.current.getTemplate();
    const newSchemas = currentTpl.schemas.map(pageSchema => {
      return pageSchema.map(schema => {
        if (schema.name === elementName) {
          return { ...schema, type: 'svg', content: svgContent };
        }
        return schema;
      });
    });
    designerRef.current.updateTemplate({ ...currentTpl, schemas: newSchemas });
    showNotification('✨ SVG applied to template!', 'success');
  }

  /** Coerce AI-generated schema values to the numeric primitives pdfme expects.
   *  Gemini sometimes returns "10mm", "10%", [10,20], or nested {x:"10"} — we fix all of it here. */
  function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v) || 0;
    return 0;
  }

  type AiRawEl = Record<string, unknown>;

  function sanitizeAiSchemas(rawSchemas: AiRawEl[][]): Schema[][] {
    return rawSchemas.map(page =>
      page.map((el): Schema => {
        // Normalise position — handle { x, y }, [x, y], or flat x/y at root level
        let posX = 0, posY = 0;
        const pos = el.position;
        if (pos && typeof pos === 'object' && !Array.isArray(pos)) {
          const p = pos as Record<string, unknown>;
          posX = toNum(p.x);
          posY = toNum(p.y);
        } else if (Array.isArray(pos)) {
          posX = toNum(pos[0]);
          posY = toNum(pos[1]);
        } else if ('x' in el) {
          // Gemini sometimes returns x/y at root and omits position
          posX = toNum(el.x);
          posY = toNum(el.y);
        }

        const sanitised: AiRawEl = {
          ...el,
          position: { x: posX, y: posY },
          width: toNum(el.width),
          height: toNum(el.height),
        };

        // Clean up root-level x/y if Gemini added them directly
        delete sanitised.x;
        delete sanitised.y;

        if (el.fontSize !== undefined) sanitised.fontSize = toNum(el.fontSize);

        return sanitised as unknown as Schema;
      })
    );
  }

  async function handleMagicDesign() {
    if (!designerRef.current) return;
    const currentTpl = designerRef.current.getTemplate();
    const isHorizontal = typeof currentTpl.basePdf === 'object' && 'width' in currentTpl.basePdf
      ? currentTpl.basePdf.width > currentTpl.basePdf.height
      : cardWidth > cardHeight;
    
    const userPrompt = window.prompt(
      'Describe your dream theme to the AI (e.g. "Cyberpunk Neon", "Dark Fantasy", "Minimalist Elegant") or leave blank for a random surprise:',
      isHorizontal ? 'Horizontal format layout. Classic card game.' : 'Minimalist clean layout. Classic poker style.'
    );
    if (userPrompt === null) return; // cancelled

    setGeneratingLayout(true);
    try {
      const publicHost = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
      
      // Extract required fields from current template to pass to AI
      const frontElements = currentTpl.schemas[0] ? currentTpl.schemas[0].map(s => ({
        name: s.name,
        type: s.type,
      })) : [];
      
      const backElements = currentTpl.schemas[1] ? currentTpl.schemas[1].map(s => ({
        name: s.name,
        type: s.type,
      })) : [];

      const res = await fetch(`${publicHost}/functions/v1/baraja-magic-layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          cardWidth,
          cardHeight,
          frontElements,
          backElements,
          prompt: userPrompt
        })
      });
      
      if (!res.ok) {
        const errData = await res.text();
        throw new Error(`API Error ${res.status}: ${errData}`);
      }
      
      const data = await res.json() as { schemas: AiRawEl[][] };
      if (!data.schemas || data.schemas.length < 1) {
         throw new Error("Invalid schema array returned from AI.");
      }

      // Sanitise before passing to pdfme — Gemini sometimes returns strings or arrays
      const cleanSchemas = sanitizeAiSchemas(data.schemas);
      designerRef.current.updateTemplate({ ...currentTpl, schemas: cleanSchemas });
      showNotification('✨ Magical Theme applied!', 'success');
      
    } catch (e: unknown) {
      const err = e as Error;
      showNotification(`Error generating layout: ${err.message}`, 'error');
      console.error(e);
    } finally {
      setGeneratingLayout(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: '#0e0e0e' }}>
      <TemplateDesignerToolbar
        onCancel={onCancel}
        onSave={() => handleSave()}
        isNew={isNew}
        slug={slug}
        name={name}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        primaryColor={primaryColor}
        accentColor={accentColor}
        textColor={textColor}
        saving={saving}
        generatingLayout={generatingLayout}
        editions={editions}
        selectedEditionId={selectedEditionId}
        onSlugChange={setSlug}
        onNameChange={(n: string) => {
          setName(n);
          if (isNew) setSlug(n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        }}
        onCardSizeChange={updateCardSize}
        onPrimaryColorChange={setPrimaryColor}
        onAccentColorChange={setAccentColor}
        onTextColorChange={setTextColor}
        onApplyMockData={handleApplyMockData}
        onOpenSvgGeneratorModal={openConceptModal}
        onMagicDesign={handleMagicDesign}
      />

      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />

      <SvgGeneratorModal 
        isOpen={conceptModalOpen} 
        onClose={() => setConceptModalOpen(false)}
        availableFields={conceptAvailableFields}
        getElementDimensions={getElementDimensions}
        onApplySvg={handleApplySvg}
      />
      
      {notification && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 10001,
          padding: '12px 20px', borderRadius: 8,
          background: notification.type === 'success' ? '#2e7d32' : '#d32f2f',
          color: '#fff', fontSize: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'all 0.3s ease'
        }}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
