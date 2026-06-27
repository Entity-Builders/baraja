import { Link } from 'react-router-dom';
import type { Card, CardFace, DeckSchema } from '@eb-packages/deck-engine';

export function SessionTopbar({
  activeDeck,
  onToggleSessionTools,
  paused,
  toolsOpen,
}: {
  activeDeck: DeckSchema;
  onToggleSessionTools: () => void;
  paused: boolean;
  toolsOpen: boolean;
}) {
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
      </div>
      <button
        className="baraja-game-plain-button"
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
