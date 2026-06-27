import type { EnrichedItem } from '../../generationResponseParsers';
import {
  generationInputStyle,
  generationLabelStyle,
  getGenerationChipStyle,
} from '../../generationUi';

interface GenerationSeedItemsFieldProps {
  enrichedItems: EnrichedItem[];
  enriching: boolean;
  generating: boolean;
  seedItemCount: number;
  seedText: string;
  onEnrich: () => void;
  onSeedTextChange: (value: string) => void;
}

export function GenerationSeedItemsField({
  enrichedItems,
  enriching,
  generating,
  seedItemCount,
  seedText,
  onEnrich,
  onSeedTextChange,
}: GenerationSeedItemsFieldProps) {
  const disabled = generating || enriching || seedItemCount === 0;

  return (
    <div>
      <label style={generationLabelStyle}>
        📦 Seed Items (one per line) — Enriched via TMDB
      </label>
      <textarea
        value={seedText}
        onChange={(event) => onSeedTextChange(event.target.value)}
        placeholder={'El Secreto de sus Ojos\nRelatos Salvajes\nNueve Reinas\nLa Historia Oficial\nEl Hijo de la Novia'}
        disabled={generating || enriching}
        style={{ ...generationInputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onEnrich}
          disabled={disabled}
          style={{
            ...getGenerationChipStyle(false, disabled, '#4ade80'),
            color: '#4ade80',
            borderColor: 'rgba(74, 222, 128, 0.3)',
          }}
        >
          {enriching ? '⏳ Enriching...' : `🔍 Enrich ${seedItemCount} items`}
        </button>
        {enrichedItems.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#4ade80', opacity: 0.8 }}>
            ✅ {enrichedItems.length} items enriched
          </span>
        )}
      </div>

      {enrichedItems.length > 0 && (
        <EnrichedItemsPreview items={enrichedItems} />
      )}
    </div>
  );
}

function EnrichedItemsPreview({ items }: { items: EnrichedItem[] }) {
  return (
    <div style={{
      marginTop: '0.75rem',
      maxHeight: '200px',
      overflowY: 'auto',
      background: '#0a0908',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.5rem 0.75rem',
    }}>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} style={{ fontSize: '0.75rem', lineHeight: 1.6, padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: 'var(--color-gold)' }}>{item.title}</span>
          <span style={{ opacity: 0.5 }}> ({item.year})</span>
          {item.director && <span style={{ opacity: 0.6 }}> — {item.director}</span>}
          {item.imdbRating && <span style={{ color: '#facc15' }}> ⭐ {item.imdbRating}</span>}
          {item.wikiExtract && <span style={{ marginLeft: '0.5rem', background: '#93c5fd', color: '#000', padding: '0 0.4rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 'bold' }}>+ WIKI LORE</span>}
          {item.poster && <img src={item.poster} alt="" style={{ width: 24, height: 36, borderRadius: 2, marginLeft: '0.5rem', verticalAlign: 'middle', objectFit: 'cover' }} />}
        </div>
      ))}
    </div>
  );
}
