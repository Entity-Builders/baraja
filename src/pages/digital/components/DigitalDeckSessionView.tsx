import type { DragEventHandler, PointerEventHandler } from 'react';
import type { Card, CardFace, DeckSchema } from '@entity-builders/deck-engine';
import { SessionControls } from './DigitalDeckSessionControls';
import { SessionGallery } from './DigitalDeckSessionGallery';
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
  onGalleryClose: () => void;
  onGalleryOpen: () => void;
  onPrimaryAction: () => void;
  onSaveSelectedCard: () => void;
  onSelectGalleryCard: (card: Card) => void;
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
  orderedCards: Card[];
  paused: boolean;
  playedCount: number;
  playedCardIds: string[];
  primaryActionLabel: string;
  saved: boolean;
  savedCardIds: string[];
  selectedCard: Card | null;
  selectedIndex: number;
  sessionMode: string;
  soundEnabled: boolean;
  galleryOpen: boolean;
  toolsOpen: boolean;
  totalCardCount: number;
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
  onGalleryClose,
  onGalleryOpen,
  onPrimaryAction,
  onSaveSelectedCard,
  onSelectGalleryCard,
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
  orderedCards,
  paused,
  playedCount,
  playedCardIds,
  primaryActionLabel,
  saved,
  savedCardIds,
  selectedCard,
  selectedIndex,
  sessionMode,
  soundEnabled,
  galleryOpen,
  toolsOpen,
  totalCardCount,
  vibrationEnabled,
}: DigitalDeckSessionViewProps) {
  return (
    <main className="baraja-app-shell baraja-game-shell">
      <section className="baraja-game-phone" aria-label="Sesión de cartas">
        <SessionTopbar
          activeDeck={activeDeck}
          face={face}
          onOpenGallery={onGalleryOpen}
          paused={paused}
          playedCount={playedCount}
          selectedIndex={selectedIndex}
          totalCardCount={totalCardCount}
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

        <SessionGallery
          activeDeck={activeDeck}
          cards={orderedCards}
          onClose={onGalleryClose}
          onSelectCard={onSelectGalleryCard}
          open={galleryOpen}
          playedCardIds={playedCardIds}
          savedCardIds={savedCardIds}
          selectedCardId={selectedCard?.id ?? null}
        />
      </section>
    </main>
  );
}
