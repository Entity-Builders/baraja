import { Link } from 'react-router-dom';
import { EbWhatsAppButton } from '@entity-builders/ui-web';
import {
  getPreviewCards,
  type Card,
  type DeckSchema,
} from '@entity-builders/deck-engine';
import { CardCanvas } from '../../../components/cards/CardCanvas';
import {
  getDeckCatalogFacet,
  hasPrintablePdf,
} from '../../../lib/digitalDeckCatalog';
import {
  formatCatalogPlayerCount,
  type CatalogFilterId,
  type CatalogFilterSummary,
} from '../../../lib/catalogFilters';
import type { FullscreenPreviewMode } from '../../../components/decks/FullscreenCardPreview';

export interface DeckCardPreviewSelection {
  deck: DeckSchema;
  card: Card;
  initialMode: FullscreenPreviewMode;
}

interface DeckCatalogFilterBarProps {
  activeFilter: CatalogFilterId;
  filters: CatalogFilterSummary[];
  inquiryUrl: string;
  onFilterChange: (filterId: CatalogFilterId) => void;
  onInquiryClick?: () => void;
}

export function DeckCatalogFilterBar({
  activeFilter,
  filters,
  inquiryUrl,
  onFilterChange,
  onInquiryClick,
}: DeckCatalogFilterBarProps) {
  return (
    <div className="baraja-catalog-controls">
      <div className="baraja-filter-row" aria-label="Filtrar mazos">
        {filters.map((filter) => {
          const isActive = filter.id === activeFilter;

          return (
            <button
              aria-pressed={isActive}
              className={`baraja-filter-chip${isActive ? ' baraja-filter-chip-active' : ''}`}
              key={filter.id}
              type="button"
              onClick={() => onFilterChange(filter.id)}
            >
              <span>{filter.label}</span>
              <small>{filter.count}</small>
            </button>
          );
        })}
      </div>
      <EbWhatsAppButton
        className="baraja-catalog-marketplace"
        href={inquiryUrl}
        onClick={onInquiryClick}
      >
        Consultar por una baraja
      </EbWhatsAppButton>
    </div>
  );
}

interface DeckCatalogGridProps {
  decks: DeckSchema[];
  featuredDeckId: string;
  onPreview: (selection: DeckCardPreviewSelection) => void;
}

export function DeckCatalogGrid({
  decks,
  featuredDeckId,
  onPreview,
}: DeckCatalogGridProps) {
  return (
    <div className="baraja-public-deck-grid">
      {decks.map((deck) => (
        <DeckCatalogCard
          deck={deck}
          isFeatured={deck.id === featuredDeckId}
          key={deck.id}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

interface DeckCatalogCardProps {
  deck: DeckSchema;
  isFeatured: boolean;
  onPreview: (selection: DeckCardPreviewSelection) => void;
}

function DeckCatalogCard({
  deck,
  isFeatured,
  onPreview,
}: DeckCatalogCardProps) {
  const previewCard = getPreviewCards(deck, 1)[0] ?? deck.cards[0];
  const catalogFacet = getDeckCatalogFacet(deck);
  const deckFacts = [
    catalogFacet.subcategory,
    formatCatalogPlayerCount(deck.metadata.player_count),
    `${deck.card_count} cartas`,
  ];

  return (
    <article
      className={`baraja-public-deck-card${isFeatured ? ' baraja-public-deck-card--featured' : ''}`}
    >
      <div className="baraja-public-deck-art">
        {previewCard ? (
          <button
            aria-label={`Ver frente de ${previewCard.front.title} de ${deck.name} en pantalla completa`}
            className="baraja-public-deck-preview-button"
            type="button"
            onClick={() => onPreview({ deck, card: previewCard, initialMode: 'front' })}
          >
            <span className="baraja-public-deck-preview-card">
              <CardCanvas
                card={previewCard}
                deck={deck}
                flipped={false}
                showInfoRow={false}
                showQr={false}
              />
            </span>
            <span className="baraja-public-deck-preview-label">Ver frente</span>
          </button>
        ) : (
          <strong>{deck.name}</strong>
        )}
        {isFeatured && (
          <span className="baraja-public-deck-trial-badge">Muestra disponible</span>
        )}
      </div>
      <div className="baraja-public-deck-copy">
        <div className="baraja-public-deck-meta">
          <p>{catalogFacet.familyLabel}</p>
          <span className="baraja-public-deck-count">{catalogFacet.subcategory}</span>
        </div>
        <h3>
          <Link to={`/decks/${deck.slug}`}>{deck.name}</Link>
        </h3>
        <p className="baraja-public-deck-summary">{catalogFacet.summary}</p>
        <p className="baraja-public-deck-facts">{deckFacts.join(' · ')}</p>
        <p className="baraja-public-deck-note">
          {hasPrintablePdf(deck) ? 'Digital + PDF imprimible' : 'Acceso digital consultable'}
        </p>
        <div className="baraja-public-deck-actions">
          <Link to={`/decks/${deck.slug}`}>Explorar mazo</Link>
        </div>
      </div>
    </article>
  );
}

interface MarketplaceBandProps {
  inquiryUrl: string;
  onInquiryClick?: () => void;
}

export function MarketplaceBand({ inquiryUrl, onInquiryClick }: MarketplaceBandProps) {
  return (
    <div className="baraja-marketplace-band">
      <div>
        <p className="baraja-kicker">Consulta</p>
        <h3>¿Querés usar una baraja o pedir una edición?</h3>
      </div>
      <EbWhatsAppButton
        className="baraja-button baraja-button-outline"
        href={inquiryUrl}
        onClick={onInquiryClick}
      >
        Escribir a Baraja
      </EbWhatsAppButton>
    </div>
  );
}
