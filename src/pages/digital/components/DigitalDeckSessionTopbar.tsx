import { Link } from 'react-router-dom';
import type { Card, CardFace, DeckSchema } from '@entity-builders/deck-engine';

export function SessionTopbar({
  activeDeck,
  face,
  onOpenGallery,
  onToggleSessionTools,
  paused,
  playedCount,
  selectedIndex,
  totalCardCount,
  toolsOpen,
}: {
  activeDeck: DeckSchema;
  face: CardFace;
  onOpenGallery: () => void;
  onToggleSessionTools: () => void;
  paused: boolean;
  playedCount: number;
  selectedIndex: number;
  totalCardCount: number;
  toolsOpen: boolean;
}) {
  const currentCardNumber = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  return (
    <header className="baraja-game-topbar">
      <Link
        to={`/app/decks/${activeDeck.slug}`}
        className="baraja-game-back"
        aria-label="Volver al mazo"
      >
        <span>Mazos</span>
      </Link>
      <div className="baraja-game-titleblock">
        <strong>{activeDeck.name}</strong>
        <span>
          Carta {currentCardNumber}/{totalCardCount} · {playedCount} jugadas · {face === 'front' ? 'Frente' : 'Reverso'}
        </span>
      </div>
      <button
        className="baraja-game-plain-button baraja-game-gallery-button"
        type="button"
        onClick={onOpenGallery}
        aria-label="Abrir galería de cartas"
      >
        ▦
      </button>
      <button
        className="baraja-game-plain-button baraja-game-tools-button"
        type="button"
        onClick={onToggleSessionTools}
        aria-label={
          paused
            ? 'Reanudar sesión'
            : toolsOpen
              ? 'Ocultar opciones de sesión'
              : 'Mostrar opciones de sesión'
        }
      >
        {paused ? 'Reanudar' : toolsOpen ? '×' : '•••'}
      </button>
    </header>
  );
}

export function SessionDesktopContext({
  activeDeck,
  face,
  fullAccess,
  lockedCardCount,
  selectedCard,
  sessionMode,
}: {
  activeDeck: DeckSchema;
  face: CardFace;
  fullAccess: boolean;
  lockedCardCount: number;
  selectedCard: Card | null;
  sessionMode: string;
}) {
  return (
    <aside className="baraja-session-desktop-context" aria-label="Contexto de sesión">
      <p>{sessionMode} · {face === 'front' ? 'Frente' : 'Reverso'}</p>
      <h1>{selectedCard?.front.title ?? activeDeck.name}</h1>
      {!fullAccess && lockedCardCount > 0 && (
        <Link to={`/app/decks/${activeDeck.slug}/preview-limit`}>
          Desbloquear {lockedCardCount} cartas
        </Link>
      )}
    </aside>
  );
}
