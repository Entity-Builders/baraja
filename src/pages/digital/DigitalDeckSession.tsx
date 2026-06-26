import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getDefaultSessionMode,
  getPreviewCards,
  getShareableCardPayload,
  shuffleCards,
  type Card,
  type CardFace,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import { trackBarajaEvent } from '../../services/analytics';
import { usePwaStatus } from '../../hooks/usePwaStatus';
import { CardCanvas } from '../../components/cards/CardCanvas';
import { useDeck } from '../../hooks/useDeck';

const AUTO_REVEAL_DELAY_MS = 520;
const RECENT_CARD_LIMIT = 5;
const SWIPE_THRESHOLD_PX = 48;

interface StoredSessionSnapshot {
  selectedCardId: string | null;
  face: CardFace;
  drawIndex: number;
  shuffleSeed: string | null;
  playedCardIds: string[];
  recentCardIds: string[];
  lastCardId: string | null;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export default function DigitalDeckSession() {
  const { slug } = useParams();
  const { deck, loading } = useDeck(slug);
  const fullAccess = hasVerifiedDeckAccess();
  const { isStandalone } = usePwaStatus();
  const storageKey = `baraja:pwa:session:${slug ?? 'unknown'}`;
  const initialSession = useMemo(() => readStoredSession(storageKey), [storageKey]);
  const [drawIndex, setDrawIndex] = useState(initialSession?.drawIndex ?? 0);
  const [shuffleSeed, setShuffleSeed] = useState<string | null>(
    initialSession?.shuffleSeed ?? null
  );
  const [face, setFace] = useState<CardFace>(initialSession?.face ?? 'front');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    initialSession?.selectedCardId ?? null
  );
  const [playedCardIds, setPlayedCardIds] = useState<string[]>(
    initialSession?.playedCardIds ?? []
  );
  const [recentCardIds, setRecentCardIds] = useState<string[]>(
    initialSession?.recentCardIds ?? []
  );
  const [lastCardId, setLastCardId] = useState<string | null>(
    initialSession?.lastCardId ?? null
  );
  const [soundEnabled, setSoundEnabled] = useState(initialSession?.soundEnabled ?? true);
  const [vibrationEnabled, setVibrationEnabled] = useState(
    initialSession?.vibrationEnabled ?? true
  );
  const [paused, setPaused] = useState(false);
  const [autoRevealing, setAutoRevealing] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const startTrackedRef = useRef(false);
  const { savedCardIds, toggleSaved } = useSavedCards(slug ?? 'unknown');

  const visibleCards = useMemo(() => {
    if (!deck) {
      return [];
    }

    return fullAccess ? deck.cards : getPreviewCards(deck, deck.cards.length);
  }, [deck, fullAccess]);

  const orderedCards = useMemo(() => {
    return shuffleSeed ? shuffleCards(visibleCards, shuffleSeed) : visibleCards;
  }, [shuffleSeed, visibleCards]);

  useEffect(() => {
    if (!deck || startTrackedRef.current) {
      return;
    }

    startTrackedRef.current = true;
    trackBarajaEvent('baraja_session_started', {
      deck_id: deck.id,
      deck_slug: deck.slug,
      access_state: fullAccess ? 'active' : 'preview',
      preview_card_count: visibleCards.length,
      session_mode: getDefaultSessionMode(deck),
      standalone: isStandalone,
      surface: 'deck_session',
    });

    if (initialSession?.selectedCardId) {
      trackBarajaEvent('baraja_pwa_session_resumed', {
        deck_id: deck.id,
        deck_slug: deck.slug,
        played_count: initialSession.playedCardIds.length,
        recent_count: initialSession.recentCardIds.length,
        surface: 'deck_session',
      });
    }
  }, [deck, fullAccess, initialSession, isStandalone, visibleCards.length]);

  useEffect(() => {
    if (!deck) {
      return;
    }

    const snapshot: StoredSessionSnapshot = {
      selectedCardId,
      face,
      drawIndex,
      shuffleSeed,
      playedCardIds,
      recentCardIds,
      lastCardId,
      soundEnabled,
      vibrationEnabled,
    };

    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [
    deck,
    drawIndex,
    face,
    lastCardId,
    playedCardIds,
    recentCardIds,
    selectedCardId,
    shuffleSeed,
    soundEnabled,
    storageKey,
    vibrationEnabled,
  ]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  if (loading && !deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Cargando sesión</p>
        <h1>Preparando el mazo.</h1>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="digital-shell digital-centered">
        <p className="digital-kicker">Mazo no encontrado</p>
        <h1>No encontramos esa sesión.</h1>
        <Link className="btn-primary" to="/">Volver a la biblioteca</Link>
      </main>
    );
  }

  const activeDeck = deck;

  const effectiveSelectedCardId =
    selectedCardId && orderedCards.some((card) => card.id === selectedCardId)
      ? selectedCardId
      : orderedCards[0]?.id ?? null;
  const selectedCard =
    orderedCards.find((card) => card.id === effectiveSelectedCardId) ?? null;
  const saved = selectedCard ? savedCardIds.includes(selectedCard.id) : false;
  const selectedIndex = selectedCard
    ? orderedCards.findIndex((card) => card.id === selectedCard.id)
    : -1;
  const playedCount = playedCardIds.length;
  const sessionMode = getDefaultSessionMode(activeDeck);
  const lockedCardCount = Math.max(0, activeDeck.card_count - visibleCards.length);
  const primaryActionLabel = autoRevealing
    ? 'Revelando'
    : face === 'front'
      ? 'Revelar'
      : 'Siguiente carta';

  function clearRevealTimer() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function presentCard(card: Card) {
    clearRevealTimer();
    setSelectedCardId(card.id);
    setFace('front');
    setAutoRevealing(false);
    setLastCardId((currentLastCardId) => (
      selectedCardId && selectedCardId !== card.id ? selectedCardId : currentLastCardId
    ));

    trackBarajaEvent('baraja_card_front_viewed', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      card_id: card.id,
      card_number: card.front.number,
      access_state: fullAccess ? 'active' : 'preview',
      played_count: playedCount + 1,
      session_mode: sessionMode,
      surface: 'deck_session',
    });

  }

  function revealSelectedCard() {
    if (!selectedCard || face === 'back' || autoRevealing) {
      return;
    }

    clearRevealTimer();
    setAutoRevealing(true);
    setPlayedCardIds((current) => (
      current.includes(selectedCard.id) ? current : [...current, selectedCard.id]
    ));
    setRecentCardIds((current) => [
      selectedCard.id,
      ...current.filter((cardId) => cardId !== selectedCard.id),
    ].slice(0, RECENT_CARD_LIMIT));

    revealTimerRef.current = window.setTimeout(() => {
      setFace('back');
      setAutoRevealing(false);
      revealTimerRef.current = null;

      if (vibrationEnabled && navigator.vibrate) {
        navigator.vibrate(18);
      }

      trackBarajaEvent('baraja_card_revealed', {
        deck_id: activeDeck.id,
        deck_slug: activeDeck.slug,
        card_id: selectedCard.id,
        card_number: selectedCard.front.number,
        access_state: fullAccess ? 'active' : 'preview',
        played_count: playedCount + 1,
        session_mode: sessionMode,
        sound_enabled: soundEnabled,
        vibration_enabled: vibrationEnabled,
        surface: 'deck_session',
      });
    }, AUTO_REVEAL_DELAY_MS);
  }

  function handlePrimaryAction() {
    if (!selectedCard || face === 'back') {
      drawNextCard();
      return;
    }

    revealSelectedCard();
  }

  function shuffleVisibleCards() {
    const nextSeed = `${activeDeck.slug}-shuffle-${Date.now()}-${drawIndex}`;
    const shuffled = shuffleCards(visibleCards, nextSeed);

    clearRevealTimer();
    setShuffleSeed(nextSeed);
    setDrawIndex(0);
    setSelectedCardId(shuffled[0]?.id ?? null);
    setFace('front');
    setAutoRevealing(false);
    setToolsOpen(false);
  }

  function drawNextCard() {
    if (!orderedCards.length) {
      return;
    }

    const nextIndex =
      face === 'back' && selectedIndex >= 0 ? selectedIndex + 1 : drawIndex;
    const next = orderedCards[nextIndex % orderedCards.length];

    if (!next) {
      return;
    }

    setDrawIndex(nextIndex + 1);
    trackBarajaEvent('baraja_card_next_requested', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      access_state: fullAccess ? 'active' : 'preview',
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
    trackBarajaEvent('baraja_sample_drawn', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      card_id: next.id,
      card_number: next.front.number,
      access_state: fullAccess ? 'active' : 'preview',
      surface: 'deck_session',
    });
    presentCard(next);
  }

  function drawPreviousCard() {
    if (!orderedCards.length || selectedIndex <= 0) {
      return;
    }

    const previous = orderedCards[selectedIndex - 1];

    if (!previous) {
      return;
    }

    setDrawIndex(Math.max(0, selectedIndex));
    trackBarajaEvent('baraja_card_previous_requested', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      access_state: fullAccess ? 'active' : 'preview',
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
    presentCard(previous);
  }

  function handleSessionPointerDown(event: PointerEvent<HTMLElement>) {
    swipeStartXRef.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleSessionPointerUp(event: PointerEvent<HTMLElement>) {
    const startX = swipeStartXRef.current;
    swipeStartXRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (startX === null || paused || autoRevealing) {
      return;
    }

    const deltaX = event.clientX - startX;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }

    if (deltaX < 0) {
      drawNextCard();
      return;
    }

    drawPreviousCard();
  }

  function saveSelectedCard() {
    if (!selectedCard) {
      return;
    }

    toggleSaved(selectedCard.id);
    trackBarajaEvent('baraja_card_saved', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      card_id: selectedCard.id,
      card_number: selectedCard.front.number,
      access_state: fullAccess ? 'active' : 'preview',
      surface: 'deck_session',
    });
  }

  async function shareSelectedCard() {
    if (!selectedCard) {
      return;
    }

    const payload = getShareableCardPayload(activeDeck, selectedCard.id);
    trackBarajaEvent('baraja_card_shared', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      card_id: selectedCard.id,
      card_number: selectedCard.front.number,
      previewable: Boolean(payload?.previewable),
      surface: 'deck_session',
    });

    const shareUrl = `${window.location.origin}/app/decks/${activeDeck.slug}`;
    const shareTitle = `${activeDeck.name}: ${payload?.title ?? selectedCard.front.title}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
    } catch {
      await navigator.clipboard?.writeText(shareUrl);
    }
  }

  function togglePause() {
    setToolsOpen(false);
    setPaused((current) => {
      const next = !current;

      trackBarajaEvent(next ? 'baraja_session_paused' : 'baraja_session_resumed', {
        deck_id: activeDeck.id,
        deck_slug: activeDeck.slug,
        played_count: playedCount,
        session_mode: sessionMode,
        surface: 'deck_session',
      });

      return next;
    });
  }

  function toggleSessionTools() {
    if (paused) {
      togglePause();
      return;
    }

    setToolsOpen((current) => !current);
  }

  function endSession() {
    clearRevealTimer();
    window.localStorage.removeItem(storageKey);
    setDrawIndex(0);
    setShuffleSeed(null);
    setSelectedCardId(orderedCards[0]?.id ?? null);
    setFace('front');
    setPlayedCardIds([]);
    setRecentCardIds([]);
    setLastCardId(null);
    setPaused(false);
    setAutoRevealing(false);
    setToolsOpen(false);
    trackBarajaEvent('baraja_session_ended', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
  }

  return (
    <main className="baraja-app-shell baraja-game-shell">
      <section className="baraja-game-phone" aria-label="Sesión de cartas">
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
            onClick={toggleSessionTools}
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

        <div className="baraja-game-content">
          <aside className="baraja-session-desktop-context" aria-label="Contexto de sesión">
            <p>{sessionMode} · {face === 'front' ? 'Frente' : 'Reverso'}</p>
            <h1>{selectedCard?.front.title ?? activeDeck.name}</h1>
            {!fullAccess && lockedCardCount > 0 && (
              <Link to={`/app/decks/${activeDeck.slug}/preview-limit`}>
                Desbloquear {lockedCardCount} cartas
              </Link>
            )}
          </aside>

          <div
            className="baraja-session-stage"
            onPointerDown={handleSessionPointerDown}
            onPointerUp={handleSessionPointerUp}
            onPointerCancel={() => {
              swipeStartXRef.current = null;
            }}
            onDragStart={(event) => {
              event.preventDefault();
            }}
          >
            {paused && (
              <div className="baraja-session-paused">
                <p className="baraja-kicker">Pausa</p>
                <h2>La sesión queda guardada.</h2>
                <div className="baraja-pause-settings">
                  <label>
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(event) => setSoundEnabled(event.currentTarget.checked)}
                    />
                    Sonido
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={vibrationEnabled}
                      onChange={(event) => setVibrationEnabled(event.currentTarget.checked)}
                    />
                    Vibración
                  </label>
                </div>
                <button className="baraja-button baraja-button-primary" type="button" onClick={togglePause}>
                  Reanudar
                </button>
                <button className="baraja-game-plain-button" type="button" onClick={endSession}>
                  Terminar sesión
                </button>
              </div>
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
                onClick={drawPreviousCard}
                disabled={selectedIndex <= 0 || autoRevealing}
                aria-label="Carta anterior"
              >
                ‹
              </button>

              <button
                className="baraja-app-primary-action"
                type="button"
                onClick={handlePrimaryAction}
                disabled={autoRevealing}
              >
                {primaryActionLabel}
              </button>

              <button
                className="baraja-session-round-button"
                type="button"
                onClick={drawNextCard}
                disabled={!selectedCard || autoRevealing}
                aria-label="Carta siguiente"
              >
                ›
              </button>
            </div>

            {toolsOpen && (
              <div className="baraja-session-options-panel">
                <div className="baraja-session-icon-actions">
                  <button type="button" onClick={saveSelectedCard} disabled={!selectedCard}>
                    <span aria-hidden="true">{saved ? '▰' : '▱'}</span>
                    {saved ? 'Guardada' : 'Guardar'}
                  </button>
                  <button type="button" onClick={shareSelectedCard} disabled={!selectedCard}>
                    <span aria-hidden="true">⌯</span>
                    Compartir
                  </button>
                  <button type="button" onClick={shuffleVisibleCards}>
                    <span aria-hidden="true">⇄</span>
                    Mezclar
                  </button>
                </div>
                <div className="baraja-session-settings-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(event) => setSoundEnabled(event.currentTarget.checked)}
                    />
                    Sonido
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={vibrationEnabled}
                      onChange={(event) => setVibrationEnabled(event.currentTarget.checked)}
                    />
                    Vibración
                  </label>
                  <button type="button" onClick={togglePause}>Pausar</button>
                  <button type="button" onClick={endSession}>Reiniciar</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function SessionCard({
  card,
  deck,
  face,
  autoRevealing,
}: {
  card: Card;
  deck: DeckSchema;
  face: CardFace;
  autoRevealing: boolean;
}) {
  const cardClassName = [
    'baraja-session-card',
    face === 'back' ? 'is-back' : 'is-front',
    autoRevealing ? 'is-revealing' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cardClassName}
      aria-label={`${face === 'front' ? 'Frente' : 'Reverso'} de ${card.front.title}`}
    >
      <CardCanvas
        card={card}
        deck={deck}
        className="baraja-session-card-canvas"
        flipped={face === 'back' || autoRevealing}
        showInfoRow={false}
        showQr={false}
      />
      {autoRevealing && <span className="baraja-auto-reveal">Revelando reverso</span>}
      <span className="sr-only">Carta renderizada con el diseño del mazo</span>
    </article>
  );
}

function useSavedCards(deckSlug: string) {
  const storageKey = `baraja:digital:saved:${deckSlug}`;
  const [savedCardIds, setSavedCardIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed)
        ? parsed.filter((cardId): cardId is string => typeof cardId === 'string')
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(savedCardIds));
  }, [savedCardIds, storageKey]);

  function toggleSaved(cardId: string) {
    setSavedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }

      return [...current, cardId];
    });
  }

  return { savedCardIds, toggleSaved };
}

function readStoredSession(storageKey: string): StoredSessionSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);

    if (!isSessionSnapshotLike(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isSessionSnapshotLike(value: unknown): value is StoredSessionSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredSessionSnapshot>;
  const face = candidate.face;

  return (
    (candidate.selectedCardId === null || typeof candidate.selectedCardId === 'string') &&
    (face === 'front' || face === 'back') &&
    typeof candidate.drawIndex === 'number' &&
    (candidate.shuffleSeed === null || typeof candidate.shuffleSeed === 'string') &&
    Array.isArray(candidate.playedCardIds) &&
    candidate.playedCardIds.every((cardId) => typeof cardId === 'string') &&
    Array.isArray(candidate.recentCardIds) &&
    candidate.recentCardIds.every((cardId) => typeof cardId === 'string') &&
    (candidate.lastCardId === null || typeof candidate.lastCardId === 'string') &&
    typeof candidate.soundEnabled === 'boolean' &&
    typeof candidate.vibrationEnabled === 'boolean'
  );
}

function hasVerifiedDeckAccess(): boolean {
  return false;
}
