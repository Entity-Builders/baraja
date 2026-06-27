import type { DragEventHandler, PointerEventHandler } from 'react';
import type { Card, CardFace, DeckSchema } from '@eb-packages/deck-engine';
import { SessionCard } from './DigitalDeckSessionCard';
import { SessionSettings } from './DigitalDeckSessionSettings';

export function SessionStage({
  activeDeck,
  autoRevealing,
  face,
  onDragStart,
  onEndSession,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  onSoundEnabledChange,
  onTogglePause,
  onVibrationEnabledChange,
  paused,
  selectedCard,
  soundEnabled,
  vibrationEnabled,
}: {
  activeDeck: DeckSchema;
  autoRevealing: boolean;
  face: CardFace;
  onDragStart: DragEventHandler<HTMLElement>;
  onEndSession: () => void;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTogglePause: () => void;
  onVibrationEnabledChange: (enabled: boolean) => void;
  paused: boolean;
  selectedCard: Card | null;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}) {
  return (
    <div
      className="baraja-session-stage"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={onDragStart}
    >
      {paused && (
        <SessionPauseOverlay
          onEndSession={onEndSession}
          onSoundEnabledChange={onSoundEnabledChange}
          onTogglePause={onTogglePause}
          onVibrationEnabledChange={onVibrationEnabledChange}
          soundEnabled={soundEnabled}
          vibrationEnabled={vibrationEnabled}
        />
      )}
      {selectedCard && !paused && (
        <SessionCard
          card={selectedCard}
          deck={activeDeck}
          face={face}
          autoRevealing={autoRevealing}
        />
      )}
    </div>
  );
}

function SessionPauseOverlay({
  onEndSession,
  onSoundEnabledChange,
  onTogglePause,
  onVibrationEnabledChange,
  soundEnabled,
  vibrationEnabled,
}: {
  onEndSession: () => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTogglePause: () => void;
  onVibrationEnabledChange: (enabled: boolean) => void;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}) {
  return (
    <div className="baraja-session-paused">
      <p className="baraja-kicker">Pausa</p>
      <h2>La sesión queda guardada.</h2>
      <SessionSettings
        onSoundEnabledChange={onSoundEnabledChange}
        onVibrationEnabledChange={onVibrationEnabledChange}
        soundEnabled={soundEnabled}
        vibrationEnabled={vibrationEnabled}
        variant="pause"
      />
      <button className="baraja-button baraja-button-primary" type="button" onClick={onTogglePause}>
        Reanudar
      </button>
      <button className="baraja-game-plain-button" type="button" onClick={onEndSession}>
        Terminar sesión
      </button>
    </div>
  );
}
