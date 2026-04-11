import React from 'react';

interface CardNavigatorProps {
  activeCardIndex: number;
  totalCards: number;
  onPrev: () => void;
  onNext: () => void;
}

export function CardNavigator({ activeCardIndex, totalCards, onPrev, onNext }: CardNavigatorProps) {
  if (totalCards === 0) return null;

  const btnStyle: React.CSSProperties = {
    background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', padding: '0.3rem 0.6rem',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem', background: '#222', borderRadius: '6px', padding: '0.2rem' }}>
      <button onClick={onPrev} style={btnStyle}>◀</button>
      <span style={{ fontSize: '0.8rem', minWidth: '60px', textAlign: 'center' }}>
        Card {activeCardIndex + 1} / {totalCards}
      </span>
      <button onClick={onNext} style={btnStyle}>▶</button>
    </div>
  );
}
