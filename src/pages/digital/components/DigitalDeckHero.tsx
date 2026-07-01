import { useCallback, useEffect, useMemo, useState } from 'react';
import { EbWhatsAppButton } from '@eb-packages/ui-web';
import {
  getPreviewCards,
  type Card,
  type DeckSchema,
} from '@eb-packages/deck-engine';
import { CardCanvas } from '../../../components/cards/CardCanvas';
import {
  FullscreenCardPreview,
  type FullscreenPreviewMode,
} from '../../../components/decks/FullscreenCardPreview';
import {
  HERO_ROTATION_CONFIG_EVENT,
  getHeroRotationItems,
  type HeroRotationItem,
  type HeroRotationSlot,
} from '../../../lib/heroRotationConfig';
import { trackBarajaEvent } from '../../../services/analytics';

const HERO_ROTATION_INTERVAL_MS = 6800;

interface DigitalDeckHeroProps {
  decks: DeckSchema[];
  featuredDeck: DeckSchema;
  inquiryUrl: string;
  onInquiryClick?: () => void;
}

export function DigitalDeckHero({
  decks,
  featuredDeck,
  inquiryUrl,
  onInquiryClick,
}: DigitalDeckHeroProps) {
  const [heroItems, setHeroItems] = useState(() => getHeroRotationItems(decks));
  const [selectedSlotId, setSelectedSlotId] = useState(heroItems[0]?.slot.id ?? featuredDeck.id);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const selectedItem = heroItems.find((item) => item.slot.id === selectedSlotId) ?? heroItems[0];
  const selectedDeck = selectedItem?.deck ?? featuredDeck;
  const selectedCard = selectedItem?.card ?? getPreviewCards(selectedDeck, 1)[0] ?? selectedDeck.cards[0] ?? null;
  const selectedGenre = selectedItem?.slot ?? {
    label: 'Baraja',
    claim: 'elegir una carta y dejar que haga su trabajo',
    tone: 'conversation',
  };

  useEffect(() => {
    function refreshHeroItems() {
      setHeroItems(getHeroRotationItems(decks));
    }

    refreshHeroItems();
    window.addEventListener('storage', refreshHeroItems);
    window.addEventListener(HERO_ROTATION_CONFIG_EVENT, refreshHeroItems);

    return () => {
      window.removeEventListener('storage', refreshHeroItems);
      window.removeEventListener(HERO_ROTATION_CONFIG_EVENT, refreshHeroItems);
    };
  }, [decks]);

  useEffect(() => {
    if (heroItems.length > 0 && !heroItems.some((item) => item.slot.id === selectedSlotId)) {
      const nextSlotId = heroItems[0].slot.id;
      const frame = window.requestAnimationFrame(() => {
        setSelectedSlotId(nextSlotId);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    return undefined;
  }, [heroItems, selectedSlotId]);

  const visibleHeroItems: HeroRotationItem[] = useMemo(() => (
    heroItems.length > 0
      ? heroItems
      : selectedCard ? [{
        slot: {
          id: selectedSlotId,
          label: selectedGenre.label,
          claim: selectedGenre.claim,
          tone: selectedGenre.tone as HeroRotationSlot['tone'],
          deckSlug: selectedDeck.slug,
          enabled: true,
        },
        deck: selectedDeck,
        card: selectedCard,
      }] : []
  ), [heroItems, selectedCard, selectedDeck, selectedGenre.claim, selectedGenre.label, selectedGenre.tone, selectedSlotId]);

  const selectedIndex = Math.max(
    0,
    visibleHeroItems.findIndex((item) => item.slot.id === selectedSlotId)
  );

  const selectSlot = useCallback((slotId: string) => {
    setSelectedSlotId(slotId);
  }, []);

  const selectRelativeSlot = useCallback((direction: -1 | 1) => {
    const nextIndex = (selectedIndex + direction + visibleHeroItems.length) % visibleHeroItems.length;
    const nextSlotId = visibleHeroItems[nextIndex]?.slot.id;

    if (nextSlotId) {
      selectSlot(nextSlotId);
    }
  }, [selectedIndex, selectSlot, visibleHeroItems]);

  useEffect(() => {
    if (isAutoPaused || visibleHeroItems.length < 2) {
      return undefined;
    }

    if (window.matchMedia('(max-width: 680px), (prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      selectRelativeSlot(1);
    }, HERO_ROTATION_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [isAutoPaused, selectRelativeSlot, visibleHeroItems.length]);

  if (!selectedCard) {
    return null;
  }

  return (
    <section className="baraja-hero">
      <div className="baraja-hero-bloom" aria-hidden="true" />
      <div className="baraja-hero-copy">
        <p className="baraja-kicker baraja-hero-kicker">Online + PDF imprimible</p>
        <h1>Mazos digitales en español</h1>
        <HeroCategoryTabs
          activeSlotId={selectedSlotId}
          items={visibleHeroItems}
          onSelect={selectSlot}
        />
        <p className="baraja-hero-mobile-summary" key={`mobile-${selectedSlotId}`}>
          Para {selectedGenre.claim}
        </p>
        <p className="baraja-lead baraja-lead-dynamic">
          <span className="baraja-lead-static baraja-lead-static--intro">Cartas listas para</span>
          <span className="baraja-lead-claim" key={selectedSlotId}>{selectedGenre.claim}</span>
          <span className="baraja-lead-static baraja-lead-static--details">
            Jugá online. Bajá el PDF cuando quieras llevarlas a la mesa.
          </span>
        </p>
        <div className="baraja-actions baraja-hero-actions">
          <a href="#mazos" className="baraja-button baraja-button-primary">Ver barajas</a>
          <EbWhatsAppButton
            href={inquiryUrl}
            className="baraja-button baraja-button-outline"
            onClick={onInquiryClick}
          >
            Consultar
          </EbWhatsAppButton>
        </div>
      </div>

      <HeroCardCarousel
        activeSlotId={selectedSlotId}
        isAutoPaused={isAutoPaused}
        items={visibleHeroItems}
        onInteractionEnd={() => setIsAutoPaused(false)}
        onInteractionStart={() => setIsAutoPaused(true)}
        onNext={() => selectRelativeSlot(1)}
        onPrevious={() => selectRelativeSlot(-1)}
      />
    </section>
  );
}

function HeroCategoryTabs({
  activeSlotId,
  items,
  onSelect,
}: {
  activeSlotId: string;
  items: HeroRotationItem[];
  onSelect: (slotId: string) => void;
}) {
  if (items.length < 2) {
    return null;
  }

  return (
    <div className="baraja-hero-category-tabs" aria-label="Categorías de mazos">
      {items.map((item) => {
        const isActive = item.slot.id === activeSlotId;

        return (
          <button
            aria-pressed={isActive}
            className={`baraja-hero-deck-tab baraja-hero-deck-tab--${item.slot.tone}${
              isActive ? ' baraja-hero-deck-tab--active' : ''
            }`}
            key={item.slot.id}
            type="button"
            onClick={() => onSelect(item.slot.id)}
          >
            {item.slot.label}
          </button>
        );
      })}
    </div>
  );
}

function HeroCardCarousel({
  activeSlotId,
  isAutoPaused,
  items,
  onInteractionEnd,
  onInteractionStart,
  onNext,
  onPrevious,
}: {
  activeSlotId: string;
  isAutoPaused: boolean;
  items: HeroRotationItem[];
  onInteractionEnd: () => void;
  onInteractionStart: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.slot.id === activeSlotId));
  const activeItem = items[activeIndex] ?? items[0];

  if (!activeItem) {
    return null;
  }

  return (
    <div
      className={`baraja-hero-carousel${isAutoPaused ? ' baraja-hero-carousel--paused' : ''}`}
      aria-label="Carrusel de categorías"
      onBlur={onInteractionEnd}
      onFocus={onInteractionStart}
      onPointerDown={onInteractionStart}
      onPointerEnter={onInteractionStart}
      onPointerLeave={onInteractionEnd}
    >
      <div className="baraja-hero-carousel-stage" key={activeItem.slot.id}>
        <HeroCardPreview
          selectedCard={activeItem.card}
          selectedDeck={activeItem.deck}
        />
      </div>
      {items.length > 1 && (
        <div className="baraja-hero-carousel-controls">
          <button
            aria-label="Categoría anterior"
            className="baraja-hero-carousel-arrow"
            type="button"
            onClick={onPrevious}
          >
            ‹
          </button>
          <div className="baraja-hero-carousel-dots" aria-hidden="true">
            {items.map((item, index) => (
              <span
                className={`baraja-hero-carousel-dot${
                  index === activeIndex ? ' baraja-hero-carousel-dot--active' : ''
                }`}
                key={item.slot.id}
              />
            ))}
          </div>
          <button
            aria-label="Siguiente categoría"
            className="baraja-hero-carousel-arrow"
            type="button"
            onClick={onNext}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function HeroCardPreview({
  selectedCard,
  selectedDeck,
}: {
  selectedCard: Card;
  selectedDeck: DeckSchema;
}) {
  const [fullscreenPreviewMode, setFullscreenPreviewMode] = useState<FullscreenPreviewMode | null>(null);
  const openPreview = (face: FullscreenPreviewMode) => {
    trackBarajaEvent('baraja_preview_opened', {
      card_id: selectedCard.id,
      card_number: selectedCard.front.number,
      deck_id: selectedDeck.id,
      deck_slug: selectedDeck.slug,
      face,
      source: 'hero_card',
      surface: 'landing_hero',
    });
    setFullscreenPreviewMode(face);
  };

  return (
    <>
      <div
        className="baraja-hero-card-demo baraja-hero-card-demo--clean"
        id="probar-carta"
        aria-label={`Frente y reverso de ${selectedCard.front.title}`}
      >
        <div className="baraja-hero-card-spread">
          <figure className="baraja-hero-card-face baraja-hero-card-face--front">
            <button
              aria-label={`Ver frente de ${selectedCard.front.title} de ${selectedDeck.name} en pantalla completa`}
              className="baraja-hero-card-face-button"
              data-preview-label="Ver frente"
              type="button"
              onClick={() => openPreview('front')}
            >
              <CardCanvas
                card={selectedCard}
                deck={selectedDeck}
                flipped={false}
                showInfoRow={false}
                showQr={false}
              />
            </button>
            <figcaption>Frente</figcaption>
          </figure>
          <figure className="baraja-hero-card-face baraja-hero-card-face--back">
            <button
              aria-label={`Ver reverso de ${selectedCard.front.title} de ${selectedDeck.name} en pantalla completa`}
              className="baraja-hero-card-face-button"
              data-preview-label="Ver reverso"
              type="button"
              onClick={() => openPreview('back')}
            >
              <CardCanvas
                card={selectedCard}
                deck={selectedDeck}
                flipped
                showInfoRow={false}
                showQr={false}
              />
            </button>
            <figcaption>Reverso</figcaption>
          </figure>
        </div>
      </div>
      {fullscreenPreviewMode && (
        <FullscreenCardPreview
          card={selectedCard}
          deck={selectedDeck}
          initialMode={fullscreenPreviewMode}
          onClose={() => setFullscreenPreviewMode(null)}
        />
      )}
    </>
  );
}
