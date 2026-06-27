import type { AdminNotice } from './editionEditorTypes';

interface EditionEditorNoticeProps {
  notice: AdminNotice;
}

export function EditionEditorNotice({ notice }: EditionEditorNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: `1px solid ${notice.kind === 'error' ? 'rgba(248,113,113,0.35)' : notice.kind === 'warning' ? 'rgba(212,175,100,0.35)' : 'rgba(116,196,147,0.35)'}`,
        background: notice.kind === 'error' ? 'rgba(248,113,113,0.08)' : notice.kind === 'warning' ? 'rgba(212,175,100,0.08)' : 'rgba(116,196,147,0.08)',
        color: notice.kind === 'error' ? '#fca5a5' : notice.kind === 'warning' ? '#d4af64' : '#9ee0b6',
        fontSize: '0.88rem',
      }}
    >
      {notice.message}
    </div>
  );
}
