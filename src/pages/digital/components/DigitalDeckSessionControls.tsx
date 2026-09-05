import type { Card, CardFace, DeckSchema } from '@entity-builders/deck-engine';
import { SessionSettings } from './DigitalDeckSessionSettings';

export function SessionControls({
  activeDeck,
  autoRevealing,
  face,
  onDrawNext,
  onDrawPrevious,
  onEndSession,
  onPrimaryAction,
  onSaveSelectedCard,
  onShareSelectedCard,
  onShuffleVisibleCards,
  onSoundEnabledChange,
  onTogglePause,
  onVibrationEnabledChange,
  primaryActionLabel,
  saved,
  selectedCard,
  selectedIndex,
  soundEnabled,
  toolsOpen,
  vibrationEnabled,
}: {
  activeDeck: DeckSchema;
  autoRevealing: boolean;
  face: CardFace;
  onDrawNext: () => void;
  onDrawPrevious: () => void;
  onEndSession: () => void;
  onPrimaryAction: () => void;
  onSaveSelectedCard: () => void;
  onShareSelectedCard: () => void;
  onShuffleVisibleCards: () => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTogglePause: () => void;
  onVibrationEnabledChange: (enabled: boolean) => void;
  primaryActionLabel: string;
  saved: boolean;
  selectedCard: Card | null;
  selectedIndex: number;
  soundEnabled: boolean;
  toolsOpen: boolean;
  vibrationEnabled: boolean;
}) {
  return (
    <aside
      className={`baraja-session-controls${toolsOpen ? ' is-tools-open' : ''}`}
      aria-label="Acciones de sesión"
    >
      <div className="baraja-session-desktop-control-copy">
        <p>{face === 'front' ? 'Frente activo' : 'Reverso activo'}</p>
        <h2>{selectedCard?.front.title ?? activeDeck.name}</h2>
      </div>
      <div className="baraja-session-draw-row">
        <button
          className="baraja-session-round-button"
          type="button"
          onClick={onDrawPrevious}
          disabled={selectedIndex <= 0 || autoRevealing}
          aria-label="Carta anterior"
        >
          ‹
        </button>

        <button
          className="baraja-app-primary-action"
          type="button"
          onClick={onPrimaryAction}
          disabled={autoRevealing}
        >
          {primaryActionLabel}
        </button>

        <button
          className="baraja-session-round-button"
          type="button"
          onClick={onDrawNext}
          disabled={!selectedCard || autoRevealing}
          aria-label="Carta siguiente"
        >
          ›
        </button>
      </div>

      {toolsOpen && (
        <div className="baraja-session-options-panel">
          <div className="baraja-session-icon-actions">
            <button type="button" onClick={onSaveSelectedCard} disabled={!selectedCard}>
              <span aria-hidden="true">{saved ? '▰' : '▱'}</span>
              {saved ? 'Guardada' : 'Guardar'}
            </button>
            <button type="button" onClick={onShareSelectedCard} disabled={!selectedCard}>
              <span aria-hidden="true">⌯</span>
              Compartir
            </button>
            <button type="button" onClick={onShuffleVisibleCards}>
              <span aria-hidden="true">⇄</span>
              Mezclar
            </button>
          </div>
          <SessionSettings
            onEndSession={onEndSession}
            onSoundEnabledChange={onSoundEnabledChange}
            onTogglePause={onTogglePause}
            onVibrationEnabledChange={onVibrationEnabledChange}
            soundEnabled={soundEnabled}
            vibrationEnabled={vibrationEnabled}
            variant="inline"
          />
        </div>
      )}
    </aside>
  );
}
