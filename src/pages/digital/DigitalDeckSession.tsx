import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getDefaultSessionMode,
  getPreviewCards,
  getShareableCardPayload,
  shuffleCards,
  type Card,
  type CardFace,
} from '@eb-packages/deck-engine';
import { trackBarajaEvent } from '../../services/analytics';
import { usePwaStatus } from '../../hooks/usePwaStatus';
import { useDeck } from '../../hooks/useDeck';
import { DigitalDeckSessionView } from './components/DigitalDeckSessionView';
import {
  clearStoredSession,
  getSessionStorageKey,
  readStoredSession,
  writeStoredSession,
  type StoredSessionSnapshot,
} from './digitalDeckSessionStorage';
import { useSavedCards } from './hooks/useSavedCards';

const AUTO_REVEAL_DELAY_MS = 520;
const RECENT_CARD_LIMIT = 5;
const SWIPE_THRESHOLD_PX = 48;

export default function DigitalDeckSession() {
  const { slug } = useParams();
  const { deck, loading } = useDeck(slug);
  const fullAccess = hasVerifiedDeckAccess();
  const { isStandalone } = usePwaStatus();
  const storageKey = getSessionStorageKey(slug);
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
  const [galleryOpen, setGalleryOpen] = useState(false);
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

    writeStoredSession(storageKey, snapshot);
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
    setGalleryOpen(false);
  }

  function openSessionGallery() {
    setToolsOpen(false);
    setGalleryOpen(true);
    trackBarajaEvent('baraja_session_gallery_opened', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      access_state: fullAccess ? 'active' : 'preview',
      card_count: orderedCards.length,
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
  }

  function closeSessionGallery() {
    setGalleryOpen(false);
  }

  function selectGalleryCard(card: Card) {
    const nextIndex = orderedCards.findIndex((candidate) => candidate.id === card.id);

    if (nextIndex < 0) {
      return;
    }

    clearRevealTimer();
    setDrawIndex(nextIndex + 1);
    setGalleryOpen(false);
    setToolsOpen(false);
    setPaused(false);
    presentCard(card);
    trackBarajaEvent('baraja_session_gallery_card_selected', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      card_id: card.id,
      card_number: card.front.number,
      access_state: fullAccess ? 'active' : 'preview',
      card_count: orderedCards.length,
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
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

  function handleSessionPointerCancel() {
    swipeStartXRef.current = null;
  }

  function handleSessionDragStart(event: DragEvent<HTMLElement>) {
    event.preventDefault();
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
    setGalleryOpen(false);
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
    clearStoredSession(storageKey);
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
    setGalleryOpen(false);
    trackBarajaEvent('baraja_session_ended', {
      deck_id: activeDeck.id,
      deck_slug: activeDeck.slug,
      played_count: playedCount,
      session_mode: sessionMode,
      surface: 'deck_session',
    });
  }

  return (
    <DigitalDeckSessionView
      activeDeck={activeDeck}
      autoRevealing={autoRevealing}
      face={face}
      fullAccess={fullAccess}
      lockedCardCount={lockedCardCount}
      onDrawNext={drawNextCard}
      onDrawPrevious={drawPreviousCard}
      onEndSession={endSession}
      onGalleryClose={closeSessionGallery}
      onGalleryOpen={openSessionGallery}
      onPrimaryAction={handlePrimaryAction}
      onSaveSelectedCard={saveSelectedCard}
      onSelectGalleryCard={selectGalleryCard}
      onSessionDragStart={handleSessionDragStart}
      onSessionPointerCancel={handleSessionPointerCancel}
      onSessionPointerDown={handleSessionPointerDown}
      onSessionPointerUp={handleSessionPointerUp}
      onShareSelectedCard={shareSelectedCard}
      onShuffleVisibleCards={shuffleVisibleCards}
      onSoundEnabledChange={setSoundEnabled}
      onTogglePause={togglePause}
      onToggleSessionTools={toggleSessionTools}
      onVibrationEnabledChange={setVibrationEnabled}
      orderedCards={orderedCards}
      paused={paused}
      playedCount={playedCount}
      playedCardIds={playedCardIds}
      primaryActionLabel={primaryActionLabel}
      saved={saved}
      savedCardIds={savedCardIds}
      selectedCard={selectedCard}
      selectedIndex={selectedIndex}
      sessionMode={sessionMode}
      soundEnabled={soundEnabled}
      galleryOpen={galleryOpen}
      toolsOpen={toolsOpen}
      totalCardCount={orderedCards.length}
      vibrationEnabled={vibrationEnabled}
    />
  );
}

function hasVerifiedDeckAccess(): boolean {
  return false;
}
