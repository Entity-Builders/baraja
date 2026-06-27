export function GenerationAnimationStyles() {
  return (
    <style>{`
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.15; }
      }
      .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(12, 11, 9, 0.3);
        border-top-color: #0c0b09;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
    `}</style>
  );
}
