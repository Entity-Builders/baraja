import { useMemo, useState } from 'react';
import type { DeckCardLike } from './cardFieldInventory';

type InventoryFilter = 'all' | 'issues' | 'missing-back';

interface BarajaStudioInventoryPanelProps {
  activeCardIndex: number;
  activeFace: 'front' | 'back';
  cards: DeckCardLike[];
  deckName: string;
  onJumpToCard: (cardIndex: number) => void;
}

interface CardInventoryItem {
  backReady: boolean;
  contentReady: boolean;
  frontReady: boolean;
  index: number;
  label: string;
  title: string;
}

export function BarajaStudioInventoryPanel({
  activeCardIndex,
  activeFace,
  cards,
  deckName,
  onJumpToCard,
}: BarajaStudioInventoryPanelProps) {
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const items = useMemo(() => cards.map(buildInventoryItem), [cards]);
  const frontReadyCount = items.filter(item => item.frontReady).length;
  const backReadyCount = items.filter(item => item.backReady).length;
  const issueCount = items.filter(item => !item.frontReady || !item.backReady || !item.contentReady).length;
  const visibleItems = items.filter(item => {
    if (filter === 'issues') return !item.frontReady || !item.backReady || !item.contentReady;
    if (filter === 'missing-back') return !item.backReady;
    return true;
  });

  return (
    <section style={{ display: 'grid', gap: '0.85rem' }}>
      <div>
        <p style={eyebrowStyle}>Inventario</p>
        <h2 style={{ margin: 0, color: 'white', fontSize: '0.98rem', lineHeight: 1.25 }}>
          {deckName}
        </h2>
        <p style={{ margin: '0.35rem 0 0', color: 'rgba(255,255,255,0.56)', fontSize: '0.74rem', lineHeight: 1.4 }}>
          Carta {cards.length > 0 ? activeCardIndex + 1 : 0} de {cards.length} · {activeFace === 'front' ? 'Frente' : 'Dorso'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.42rem' }}>
        <Metric label="Frente" value={`${frontReadyCount}/${items.length}`} tone="#86efac" />
        <Metric label="Dorso" value={`${backReadyCount}/${items.length}`} tone="#f3d58c" />
        <Metric label="Revisar" value={String(issueCount)} tone={issueCount > 0 ? '#fca5a5' : '#86efac'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
        <FilterButton active={filter === 'all'} label="Todas" onClick={() => setFilter('all')} />
        <FilterButton active={filter === 'issues'} label="Problemas" onClick={() => setFilter('issues')} />
        <FilterButton active={filter === 'missing-back'} label="Sin dorso" onClick={() => setFilter('missing-back')} />
      </div>

      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {visibleItems.length === 0 ? (
          <div style={emptyStyle}>No hay cartas para este filtro.</div>
        ) : visibleItems.map(item => (
          <button
            key={`${item.index}-${item.label}`}
            type="button"
            onClick={() => onJumpToCard(item.index)}
            style={{
              display: 'grid',
              gap: '0.35rem',
              width: '100%',
              minHeight: '58px',
              padding: '0.58rem',
              border: `1px solid ${activeCardIndex === item.index ? 'rgba(212,175,100,0.42)' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: '7px',
              background: activeCardIndex === item.index ? 'rgba(212,175,100,0.1)' : 'rgba(255,255,255,0.025)',
              color: 'white',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem', alignItems: 'center' }}>
              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>
                {item.label} · {item.title || 'Sin titulo'}
              </strong>
              <span style={{ color: activeCardIndex === item.index ? '#f3d58c' : 'rgba(255,255,255,0.42)', fontSize: '0.64rem', fontWeight: 850 }}>
                {activeCardIndex === item.index ? 'Activa' : 'Ver'}
              </span>
            </span>
            <span style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <StatusPill ready={item.frontReady} label="Frente" />
              <StatusPill ready={item.backReady} label="Dorso" />
              <StatusPill ready={item.contentReady} label="Texto" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function buildInventoryItem(card: DeckCardLike, index: number): CardInventoryItem {
  const frontReady = Boolean(card.front?.art_url);
  const fullBackReady = Boolean(card.back?.back_image_url);
  const contentReady = Boolean(
    card.back?.when_to_use ||
    card.back?.phrase ||
    card.back?.instruction ||
    card.back?.answer ||
    card.back?.fun_fact,
  );
  const backReady = fullBackReady || contentReady;
  const number = card.front?.number == null ? index + 1 : card.front.number;

  return {
    backReady,
    contentReady,
    frontReady,
    index,
    label: `#${String(number).padStart(2, '0')}`,
    title: card.front?.title || '',
  };
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: '32px',
        border: `1px solid ${active ? 'rgba(212,175,100,0.42)' : 'rgba(255,255,255,0.1)'}`,
        background: active ? 'rgba(212,175,100,0.12)' : 'rgba(255,255,255,0.035)',
        color: active ? '#f3d58c' : 'rgba(255,255,255,0.62)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.66rem',
        fontWeight: 850,
      }}
    >
      {label}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '7px',
        padding: '0.5rem 0.4rem',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ color: tone, fontSize: '0.8rem', fontWeight: 850, marginTop: '0.18rem' }}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      style={{
        border: `1px solid ${ready ? 'rgba(53,208,127,0.3)' : 'rgba(248,113,113,0.32)'}`,
        background: ready ? 'rgba(53,208,127,0.08)' : 'rgba(248,113,113,0.08)',
        borderRadius: '999px',
        color: ready ? '#86efac' : '#fca5a5',
        fontSize: '0.6rem',
        fontWeight: 850,
        padding: '0.14rem 0.38rem',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

const eyebrowStyle = {
  margin: '0 0 0.25rem',
  color: '#d4af64',
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const;

const emptyStyle = {
  border: '1px dashed rgba(255,255,255,0.12)',
  borderRadius: '7px',
  padding: '0.8rem',
  color: 'rgba(255,255,255,0.45)',
  fontSize: '0.75rem',
  lineHeight: 1.4,
} as const;
