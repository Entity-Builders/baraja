import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { getDeckPublicationReadiness } from '../../../lib/deckPublicationReadiness';
import { formatCurrencyAmount } from '../../../lib/formatters';

export type DeckPrintableConfig = NonNullable<NonNullable<DeckSchema['digital']>['printable']>;

interface PublicationStatusPanelProps {
  deck: DeckSchema;
  cards: Card[];
  saving: boolean;
  onPublishChange: (nextPublished: boolean) => Promise<void>;
  onSavePrintable: (printable: DeckPrintableConfig) => Promise<void>;
}

export function PublicationStatusPanel({
  deck,
  cards,
  saving,
  onPublishChange,
  onSavePrintable,
}: PublicationStatusPanelProps) {
  const readiness = getDeckPublicationReadiness(deck, cards);
  const nextBlocker = readiness.blockers[0];
  const isPublished = deck.digital?.is_published === true;
  const printable = deck.digital?.printable;
  const [printableEnabled, setPrintableEnabled] = useState(printable?.enabled ?? false);
  const [printableFileKey, setPrintableFileKey] = useState(printable?.file_key ?? '');
  const [printableVersion, setPrintableVersion] = useState(printable?.version ?? '');

  function handlePrintableSubmit(event: FormEvent) {
    event.preventDefault();
    const licenseScopes = printable?.license_scopes?.length
      ? printable.license_scopes
      : (['personal_print'] as DeckPrintableConfig['license_scopes']);

    void onSavePrintable({
      ...printable,
      enabled: printableEnabled,
      license_scopes: licenseScopes,
      file_key: printableFileKey.trim() || undefined,
      version: printableVersion.trim() || undefined,
    });
  }

  const title = isPublished
    ? (readiness.isPublishable ? 'Landing publicada' : `Landing publicada con ${readiness.blockers.length} pendientes`)
    : (readiness.isPublishable ? 'Lista para activar landing' : 'Landing bloqueada');

  return (
    <section
      aria-labelledby="publication-panel-title"
      style={{
        border: '1px solid rgba(212,175,100,0.2)',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, rgba(212,175,100,0.08), rgba(255,255,255,0.035))',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'grid',
        gap: '1rem',
        width: '100%',
        maxWidth: 'calc(100vw - 2rem)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        alignItems: 'start',
      }}>
        <div>
          <p style={{ margin: '0 0 0.35rem', color: 'var(--color-gold)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Landing pública
          </p>
          <h2 id="publication-panel-title" style={{ margin: 0, fontSize: '1.35rem' }}>
            {title}
          </h2>
          <p style={{ margin: '0.45rem 0 0', opacity: 0.72, fontSize: '0.9rem' }}>
            {nextBlocker
              ? `Próximo paso: ${nextBlocker.label} (${nextBlocker.detail}).`
              : `Precio configurado: ${formatCurrency(deck.pricing)}.`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={() => void onPublishChange(!isPublished)}
            disabled={saving || (!isPublished && !readiness.isPublishable)}
            style={{
              background: isPublished ? 'rgba(248,113,113,0.12)' : 'var(--color-gold)',
              border: isPublished ? '1px solid rgba(248,113,113,0.35)' : '1px solid var(--color-gold)',
              color: isPublished ? '#fca5a5' : '#1a1714',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              cursor: saving || (!isPublished && !readiness.isPublishable) ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem',
              fontWeight: 700,
              opacity: saving || (!isPublished && !readiness.isPublishable) ? 0.58 : 1,
            }}
            title={!isPublished && !readiness.isPublishable ? 'Completá los requisitos antes de activar la landing.' : undefined}
          >
            {isPublished ? 'Desactivar landing' : 'Activar landing'}
          </button>
          <Link
            to={`/decks/${deck.slug}`}
            style={{
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'rgba(255,255,255,0.82)',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            Ver landing
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        <PublicationChip label="Arte frontal" ready={readiness.missingFrontArtCount === 0} detail={`${readiness.totalCards - readiness.missingFrontArtCount}/${readiness.totalCards}`} />
        <PublicationChip label="Reversos" ready={readiness.missingBackCount === 0} detail={`${readiness.totalCards - readiness.missingBackCount}/${readiness.totalCards}`} />
        <PublicationChip label="Contenido" ready={readiness.incompleteContentCount === 0} detail={`${readiness.totalCards - readiness.incompleteContentCount}/${readiness.totalCards}`} />
        <PublicationChip label="Datos landing" ready={readiness.landingDataComplete} detail={readiness.landingDataComplete ? 'listos' : 'incompletos'} />
        <PublicationChip label="Landing" ready={isPublished} detail={isPublished ? 'activa' : readiness.isPublishable ? 'lista' : 'bloqueada'} />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', opacity: 0.78, fontSize: '0.8rem' }}>
        <span>{readiness.missingFrontArtCount} sin arte frontal</span>
        <span>{readiness.missingBackCount} con reverso incompleto</span>
        <span>{readiness.incompleteContentCount} con contenido incompleto</span>
        <span>{readiness.missingBackImageCount} sin imagen IA de reverso (opcional si el layout/texto está listo)</span>
        <span>{saving ? 'Guardando cambios…' : 'Sin guardado en curso'}</span>
      </div>

      {readiness.blockers.length > 0 && (
        <div
          style={{
            border: '1px solid rgba(248,113,113,0.24)',
            borderRadius: '8px',
            background: 'rgba(248,113,113,0.07)',
            padding: '0.75rem',
            display: 'grid',
            gap: '0.35rem',
          }}
        >
          <strong style={{ color: '#fca5a5', fontSize: '0.82rem' }}>Falta para activar la landing</strong>
          {readiness.blockers.map(blocker => (
            <span key={blocker.key} style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.78rem' }}>
              {blocker.label}: {blocker.detail}
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={handlePrintableSubmit}
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '1rem',
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          alignItems: 'end',
        }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: '0.86rem', fontWeight: 700 }}>
            PDF de impresión
          </p>
          <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.76rem' }}>
            Opcional para publicar la landing. Usalo cuando tengas un PDF aprobado para compradores.
          </p>
        </div>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={printableEnabled}
            onChange={event => setPrintableEnabled(event.target.checked)}
          />
          PDF listo para entregar
        </label>
        <label htmlFor="pdf-file-key" style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', opacity: 0.86 }}>
          Archivo privado
          <input
            id="pdf-file-key"
            name="pdf-file-key"
            value={printableFileKey}
            onChange={event => setPrintableFileKey(event.target.value)}
            placeholder="prints/deck-slug/v1.pdf"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'white',
              borderRadius: '4px',
              padding: '0.5rem 0.65rem',
              fontSize: '0.85rem',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.46)', fontSize: '0.7rem', lineHeight: 1.35 }}>
            Ruta interna del PDF aprobado. No se muestra al comprador.
          </span>
        </label>
        <label htmlFor="pdf-version" style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', opacity: 0.86 }}>
          Versión
          <input
            id="pdf-version"
            name="pdf-version"
            value={printableVersion}
            onChange={event => setPrintableVersion(event.target.value)}
            placeholder="v1"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'white',
              borderRadius: '4px',
              padding: '0.5rem 0.65rem',
              fontSize: '0.85rem',
            }}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: 'transparent',
            border: '1px solid rgba(212,175,100,0.42)',
            color: 'var(--color-gold)',
            padding: '0.55rem 0.75rem',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem',
            opacity: saving ? 0.6 : 1,
          }}
        >
          Guardar PDF
        </button>
      </form>
    </section>
  );
}

function PublicationChip({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: '0.35rem',
        alignItems: 'center',
        padding: '0.35rem 0.55rem',
        borderRadius: '999px',
        border: `1px solid ${ready ? 'rgba(116,196,147,0.35)' : 'rgba(248,113,113,0.28)'}`,
        color: ready ? '#9ee0b6' : '#fca5a5',
        background: ready ? 'rgba(116,196,147,0.08)' : 'rgba(248,113,113,0.08)',
        fontSize: '0.72rem',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <strong>{label}</strong>
      <span style={{ opacity: 0.78, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>
    </span>
  );
}

function formatCurrency(pricing: DeckSchema['pricing']): string {
  return formatCurrencyAmount(pricing.amount, pricing.currency, {
    maximumFractionDigits: 0,
  });
}
