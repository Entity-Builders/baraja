import type React from 'react';
import type { GenerationResult } from '../generationResponseParsers';
import {
  generationLabelStyle,
  type GenerationLog,
} from '../generationUi';

interface GenerateEditionConsoleProps {
  logs: GenerationLog[];
  result: GenerationResult | null;
  generating: boolean;
  syncing: boolean;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  onSyncDecks: () => void;
  onReset: () => void;
}

export function GenerateEditionConsole({
  logs,
  result,
  generating,
  syncing,
  logsEndRef,
  onSyncDecks,
  onReset,
}: GenerateEditionConsoleProps) {
  return (
    <div>
      <label style={generationLabelStyle}>Generation Log</label>
      <div style={{
        background: '#0a0908',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        minHeight: '400px',
        maxHeight: '600px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        lineHeight: 1.8,
      }}>
        {logs.length === 0 && (
          <div style={{ opacity: 0.3, fontStyle: 'italic' }}>
            Waiting for action...
          </div>
        )}
        {logs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} style={getLogStyle(log)}>
            {log.message}
          </div>
        ))}
        {generating && (
          <div style={{ color: 'var(--color-gold)', opacity: 0.6, animation: 'pulse 1.5s infinite' }}>
            ▊
          </div>
        )}
        <div ref={logsEndRef} />
      </div>

      {result?.success && (
        <GenerationSuccessCard
          result={result}
          syncing={syncing}
          onReset={onReset}
          onSyncDecks={onSyncDecks}
        />
      )}

      {result && !result.success && (
        <GenerationErrorCard message={result.error} />
      )}
    </div>
  );
}

function GenerationSuccessCard({
  result,
  syncing,
  onReset,
  onSyncDecks,
}: {
  result: GenerationResult;
  syncing: boolean;
  onReset: () => void;
  onSyncDecks: () => void;
}) {
  return (
    <div style={{
      marginTop: '1.5rem',
      padding: '1.25rem',
      background: 'var(--color-surface)',
      border: '1px solid rgba(74, 222, 128, 0.2)',
      borderRadius: 'var(--radius-md)',
    }}>
      <h3 style={{ margin: '0 0 0.75rem 0', color: '#4ade80', fontSize: '1rem' }}>
        ✅ Edition Ready
      </h3>
      <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.5rem' }}>
        <strong>{result.name}</strong> — {result.card_count} cards
      </div>
      <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '1rem', fontFamily: 'monospace' }}>
        content/{result.slug}.json
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={onSyncDecks}
          disabled={syncing}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-gold)',
            color: 'var(--color-gold)',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-sm)',
            cursor: syncing ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            opacity: syncing ? 0.5 : 1,
          }}
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync Registry'}
        </button>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          🔄 Generate Another
        </button>
      </div>
    </div>
  );
}

function GenerationErrorCard({ message }: { message?: string }) {
  return (
    <div style={{
      marginTop: '1.5rem',
      padding: '1.25rem',
      background: 'var(--color-surface)',
      border: '1px solid rgba(248, 113, 113, 0.2)',
      borderRadius: 'var(--radius-md)',
    }}>
      <h3 style={{ margin: '0 0 0.5rem 0', color: '#f87171', fontSize: '1rem' }}>
        ❌ Generation Failed
      </h3>
      <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function getLogStyle(log: GenerationLog): React.CSSProperties {
  return {
    color: log.type === 'error' ? '#f87171'
      : log.type === 'success' ? '#4ade80'
      : log.type === 'progress' ? 'var(--color-gold)'
      : log.type === 'prompt' ? '#93c5fd'
      : 'var(--color-text-muted)',
    opacity: log.type === 'info' ? 0.7 : 1,
    whiteSpace: log.type === 'prompt' ? 'pre-wrap' : undefined,
    padding: log.type === 'prompt' ? '0.75rem' : undefined,
    background: log.type === 'prompt' ? 'rgba(147, 197, 253, 0.06)' : undefined,
    borderRadius: log.type === 'prompt' ? '4px' : undefined,
    margin: log.type === 'prompt' ? '0.5rem 0' : undefined,
    border: log.type === 'prompt' ? '1px solid rgba(147, 197, 253, 0.15)' : undefined,
    maxHeight: log.type === 'prompt' ? '300px' : undefined,
    overflowY: log.type === 'prompt' ? 'auto' : undefined,
  };
}
