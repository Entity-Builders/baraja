import React from 'react';
import type { RawDeckContent } from '@eb-packages/deck-engine';

interface TemplateDesignerToolbarProps {
  onCancel: () => void;
  onSave: () => void;
  isNew: boolean;
  slug: string;
  name: string;
  cardWidth: number;
  cardHeight: number;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  saving: boolean;
  generatingLayout: boolean;
  editions: RawDeckContent[];
  selectedEditionId: string;
  
  onSlugChange: (val: string) => void;
  onNameChange: (val: string) => void;
  onCardSizeChange: (w: number, h: number) => void;
  onPrimaryColorChange: (val: string) => void;
  onAccentColorChange: (val: string) => void;
  onTextColorChange: (val: string) => void;
  onApplyMockData: (editionId: string) => void;
  onOpenSvgGeneratorModal: () => void;
  onMagicDesign: () => void;
}

export function TemplateDesignerToolbar({
  onCancel, onSave, isNew, slug, name, cardWidth, cardHeight, 
  primaryColor, accentColor, textColor, saving, generatingLayout,
  editions, selectedEditionId,
  onSlugChange, onNameChange, onCardSizeChange,
  onPrimaryColorChange, onAccentColorChange, onTextColorChange,
  onApplyMockData, onOpenSvgGeneratorModal, onMagicDesign
}: TemplateDesignerToolbarProps) {
  return (
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
        <input value={slug} onChange={e => onSlugChange(e.target.value)} disabled={!isNew}
          style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
            padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', width: '120px',
            opacity: isNew ? 1 : 0.5,
          }} />
      </div>

      {/* Name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <label style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Name</label>
        <input value={name} onChange={e => onNameChange(e.target.value)}
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
            onChange={e => onCardSizeChange(Number(e.target.value) || 0, cardHeight)}
            style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
              padding: '0.2rem 0.4rem', borderRadius: '3px 0 0 3px', fontSize: '0.75rem', width: '50px', textAlign: 'center'
            }} 
          />
          <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}>×</span>
          <input 
            type="number"
            value={cardHeight} 
            onChange={e => onCardSizeChange(cardWidth, Number(e.target.value) || 0)}
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
          { label: 'BG', value: primaryColor, set: onPrimaryColorChange },
          { label: 'Accent', value: accentColor, set: onAccentColorChange },
          { label: 'Text', value: textColor, set: onTextColorChange },
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

      {/* Workflow Tools */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        
        {/* Step 1: Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '1rem' }}>
          <span style={{ fontSize: '0.6rem', color: '#d946ef', textTransform: 'uppercase', fontWeight: 600 }}>1. Data Context</span>
          <select 
            value={selectedEditionId} 
            onChange={e => onApplyMockData(e.target.value)}
            style={{ 
              background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.07)',
              padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', maxWidth: '120px'
            }}
          >
            <option value="">No Mock Data</option>
            {editions.map(e => (
              <option key={e.id} value={e.id}>{e.name || e.id}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Generation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '1rem' }}>
          <span style={{ fontSize: '0.6rem', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 600 }}>2. AI Engine</span>
          
          <button type="button" disabled={saving || generatingLayout} onClick={onMagicDesign}
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #ec4899)', color: '#fff', border: 'none',
              padding: '0.35rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, opacity: generatingLayout ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.3rem',
              boxShadow: '0 0 10px rgba(236, 72, 153, 0.3)'
            }}>
            {generatingLayout ? '✨ Generating...' : '🪄 Magic Design'}
          </button>

          <button type="button" onClick={onOpenSvgGeneratorModal} disabled={saving || generatingLayout}
            style={{
              background: 'rgba(255,255,255,0.05)', color: '#d946ef', border: '1px solid rgba(217, 70, 239, 0.3)',
              padding: '0.35rem 0.6rem', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem'
            }}>✒️ Individual SVG</button>
        </div>

        {/* Action: Save */}
        <button type="button" disabled={saving || generatingLayout} onClick={onSave}
          style={{
            background: '#d4af64', color: '#000', border: 'none',
            padding: '0.35rem 1rem', borderRadius: '4px', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600, opacity: saving ? 0.5 : 1,
          }}>{saving ? 'Saving...' : isNew ? '💾 Create' : '💾 Save'}</button>
      </div>
    </div>
  );
}
