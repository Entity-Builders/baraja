interface GenerationActionButtonsProps {
  disabled: boolean;
  generating: boolean;
  onPreviewPrompt: () => void;
}

export function GenerationActionButtons({
  disabled,
  generating,
  onPreviewPrompt,
}: GenerationActionButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem' }}>
      <button
        type="button"
        onClick={onPreviewPrompt}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '0.75rem',
          background: 'transparent',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--radius-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.8rem',
          opacity: disabled ? 0.4 : 1,
          transition: 'all 0.2s',
        }}
      >
        📝 Preview Prompt
      </button>

      <button
        type="submit"
        disabled={disabled}
        className="btn-primary"
        style={{
          flex: 2,
          padding: '0.75rem',
          fontSize: '0.85rem',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {generating ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span className="spinner" />
            Generating...
          </span>
        ) : (
          '🃏 Generate Edition'
        )}
      </button>
    </div>
  );
}
