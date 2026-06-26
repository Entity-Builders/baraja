import React from 'react';

interface CardNavigatorProps {
  activeCardIndex: number;
  totalCards: number;
  onPrev: () => void;
  onNext: () => void;
  onJump?: (index: number) => void;
}

export function CardNavigator({ activeCardIndex, totalCards, onPrev, onNext, onJump }: CardNavigatorProps) {
  if (totalCards === 0) return null;

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    padding: '0.45rem 0.65rem',
    minWidth: '36px',
    minHeight: '36px',
  };

  return (
    <div
      aria-label="Navegación de cartas"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: '#222',
        borderRadius: '6px',
        padding: '0.2rem',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <button onClick={onPrev} style={btnStyle} aria-label="Carta anterior">◀</button>
      {onJump ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.78)' }}>
          Carta
          <select
            value={activeCardIndex}
            onChange={event => onJump(Number(event.target.value))}
            style={{
              background: 'rgba(0,0,0,0.35)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '4px',
              padding: '0.35rem 0.45rem',
              fontSize: '0.8rem',
            }}
          >
            {Array.from({ length: totalCards }, (_, index) => (
              <option key={index} value={index}>{index + 1}</option>
            ))}
          </select>
          <span style={{ opacity: 0.68 }}>de {totalCards}</span>
        </label>
      ) : (
        <span style={{ fontSize: '0.8rem', minWidth: '78px', textAlign: 'center' }}>
          Carta {activeCardIndex + 1} / {totalCards}
        </span>
      )}
      <button onClick={onNext} style={btnStyle} aria-label="Carta siguiente">▶</button>
    </div>
  );
}
