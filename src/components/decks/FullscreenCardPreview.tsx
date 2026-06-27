import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card, DeckSchema } from '@eb-packages/deck-engine';
import { CardCanvas } from '../cards/CardCanvas';

export type FullscreenPreviewMode = 'front' | 'back' | 'both';

const FULLSCREEN_PREVIEW_MODES: Array<{ id: FullscreenPreviewMode; label: string }> = [
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Reverso' },
  { id: 'both', label: 'Ambas' },
];

interface FullscreenCardPreviewProps {
  card: Card;
  deck: DeckSchema;
  initialMode?: FullscreenPreviewMode;
  onClose: () => void;
}

export function FullscreenCardPreview({
  card,
  deck,
  initialMode = 'front',
  onClose,
}: FullscreenCardPreviewProps) {
  const [mode, setMode] = useState<FullscreenPreviewMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const visibleFaces: Array<'front' | 'back'> = mode === 'both' ? ['front', 'back'] : [mode];
  const panelVariant = mode === 'both' ? 'both' : 'single';

  const renderFace = (face: 'front' | 'back') => (
    <figure className={`baraja-fullscreen-card-face baraja-fullscreen-card-face--${face}`} key={face}>
      <CardCanvas
        card={card}
        deck={deck}
        flipped={face === 'back'}
        showInfoRow={false}
        showQr={false}
      />
      <figcaption>{face === 'front' ? 'Frente' : 'Reverso'}</figcaption>
    </figure>
  );

  return createPortal(
    <div
      aria-labelledby="baraja-card-preview-title"
      aria-modal="true"
      className="baraja-fullscreen-card-preview"
      role="dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`baraja-fullscreen-card-panel baraja-fullscreen-card-panel--${panelVariant}`}>
        <div className="baraja-fullscreen-card-header">
          <div className="baraja-fullscreen-card-title">
            <p className="baraja-kicker">{deck.name}</p>
            <h3 id="baraja-card-preview-title">{card.front.title}</h3>
          </div>
          <div className="baraja-fullscreen-card-mode" role="group" aria-label="Vista de carta">
            {FULLSCREEN_PREVIEW_MODES.map((previewMode) => (
              <button
                aria-pressed={mode === previewMode.id}
                className={mode === previewMode.id ? 'baraja-fullscreen-card-mode-active' : ''}
                key={previewMode.id}
                type="button"
                onClick={() => setMode(previewMode.id)}
              >
                {previewMode.label}
              </button>
            ))}
          </div>
          <button
            aria-label="Cerrar vista de carta"
            className="baraja-fullscreen-card-close"
            type="button"
            autoFocus
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className={`baraja-fullscreen-card-spread baraja-fullscreen-card-spread--${mode}`}>
          {visibleFaces.map(renderFace)}
        </div>
      </div>
    </div>,
    document.body
  );
}
