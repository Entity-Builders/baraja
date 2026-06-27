import type { DragEventHandler, PointerEventHandler } from 'react';
import type { Card, CardFace, DeckSchema } from '@eb-packages/deck-engine';
import { SessionControls } from './DigitalDeckSessionControls';
import { SessionStage } from './DigitalDeckSessionStage';
import {
  SessionDesktopContext,
  SessionTopbar,
} from './DigitalDeckSessionTopbar';

interface DigitalDeckSessionViewProps {
  activeDeck: DeckSchema;
  autoRevealing: boolean;
  face: CardFace;
  fullAccess: boolean;
  lockedCardCount: number;
  onDrawNext: () => void;
  onDrawPrevious: () => void;
  onEndSession: () => void;
  onPrimaryAction: () => void;
  onSaveSelectedCard: () => void;
  onSessionDragStart: DragEventHandler<HTMLElement>;
  onSessionPointerCancel: PointerEventHandler<HTMLElement>;
  onSessionPointerDown: PointerEventHandler<HTMLElement>;
  onSessionPointerUp: PointerEventHandler<HTMLElement>;
  onShareSelectedCard: () => void;
  onShuffleVisibleCards: () => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTogglePause: () => void;
  onToggleSessionTools: () => void;
  onVibrationEnabledChange: (enabled: boolean) => void;
  paused: boolean;
  primaryActionLabel: string;
  saved: boolean;
  selectedCard: Card | null;
  selectedIndex: number;
  sessionMode: string;
  soundEnabled: boolean;
  toolsOpen: boolean;
  vibrationEnabled: boolean;
}

export function DigitalDeckSessionView({
  activeDeck,
  autoRevealing,
  face,
  fullAccess,
  lockedCardCount,
  onDrawNext,
  onDrawPrevious,
  onEndSession,
  onPrimaryAction,
  onSaveSelectedCard,
  onSessionDragStart,
  onSessionPointerCancel,
  onSessionPointerDown,
  onSessionPointerUp,
  onShareSelectedCard,
  onShuffleVisibleCards,
  onSoundEnabledChange,
  onTogglePause,
  onToggleSessionTools,
  onVibrationEnabledChange,
  paused,
  primaryActionLabel,
  saved,
  selectedCard,
  selectedIndex,
  sessionMode,
  soundEnabled,
  toolsOpen,
  vibrationEnabled,
}: DigitalDeckSessionViewProps) {
  return (
    <main className="baraja-app-shell baraja-game-shell">
      <section className="baraja-game-phone" aria-label="Sesión de cartas">
        <SessionTopbar
          activeDeck={activeDeck}
          paused={paused}
          toolsOpen={toolsOpen}
          onToggleSessionTools={onToggleSessionTools}
        />

        <div className="baraja-game-content">
          <SessionDesktopContext
            activeDeck={activeDeck}
            face={face}
            fullAccess={fullAccess}
            lockedCardCount={lockedCardCount}
            selectedCard={selectedCard}
            sessionMode={sessionMode}
          />

          <SessionStage
            activeDeck={activeDeck}
            autoRevealing={autoRevealing}
            face={face}
            onDragStart={onSessionDragStart}
            onEndSession={onEndSession}
            onPointerCancel={onSessionPointerCancel}
            onPointerDown={onSessionPointerDown}
            onPointerUp={onSessionPointerUp}
            onSoundEnabledChange={onSoundEnabledChange}
            onTogglePause={onTogglePause}
            onVibrationEnabledChange={onVibrationEnabledChange}
            paused={paused}
            selectedCard={selectedCard}
            soundEnabled={soundEnabled}
            vibrationEnabled={vibrationEnabled}
          />

          <SessionControls
            activeDeck={activeDeck}
            autoRevealing={autoRevealing}
            face={face}
            onDrawNext={onDrawNext}
            onDrawPrevious={onDrawPrevious}
            onEndSession={onEndSession}
            onPrimaryAction={onPrimaryAction}
            onSaveSelectedCard={onSaveSelectedCard}
            onShareSelectedCard={onShareSelectedCard}
            onShuffleVisibleCards={onShuffleVisibleCards}
            onSoundEnabledChange={onSoundEnabledChange}
            onTogglePause={onTogglePause}
            onVibrationEnabledChange={onVibrationEnabledChange}
            primaryActionLabel={primaryActionLabel}
            saved={saved}
            selectedCard={selectedCard}
            selectedIndex={selectedIndex}
            soundEnabled={soundEnabled}
            toolsOpen={toolsOpen}
            vibrationEnabled={vibrationEnabled}
          />
        </div>
      </section>
    </main>
  );
}
