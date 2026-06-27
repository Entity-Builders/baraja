import type { CSSProperties } from 'react';

export const aiPanelInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  padding: '0.6rem',
  borderRadius: '4px',
  fontSize: '0.85rem',
};

export const aiPanelSectionLabel: CSSProperties = {
  fontSize: '0.72rem',
  opacity: 0.55,
  display: 'block',
  marginBottom: '0.35rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const aiPanelDetailsStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '6px',
  padding: '0.65rem 0.75rem',
  background: 'rgba(255,255,255,0.025)',
};

export const aiPanelSummaryStyle: CSSProperties = {
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.72)',
  fontSize: '0.78rem',
  fontWeight: 600,
};
