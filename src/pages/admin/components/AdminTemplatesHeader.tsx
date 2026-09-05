import { Link } from 'react-router-dom';
import type { RawDeckContent } from '@entity-builders/deck-engine';
import type { SavedConfigRow } from '../../../lib/deckRepository';
import { CardNavigator } from '../features/deck-studio/CardNavigator';

interface AdminTemplatesHeaderProps {
  decks: RawDeckContent[];
  selectedDeckId: string;
  activeDeck: RawDeckContent | null;
  activeCardIndex: number;
  totalCards: number;
  savedConfigs: SavedConfigRow[];
  selectedConfigId: string;
  savingConfig: boolean;
  isEmbedded: boolean;
  showProductionTools: boolean;
  showTuckBox: boolean;
  canSaveConfig: boolean;
  onSelectDeck: (deckId: string) => void;
  onSelectConfig: (configId: string) => void;
  onSaveConfig: () => void;
  onToggleProductionTools: () => void;
  onToggleTuckBox: () => void;
  onPrevCard: () => void;
  onNextCard: () => void;
  onJumpToCard: (index: number) => void;
}

export function AdminTemplatesHeader({
  decks,
  selectedDeckId,
  activeDeck,
  activeCardIndex,
  totalCards,
  savedConfigs,
  selectedConfigId,
  savingConfig,
  isEmbedded,
  showProductionTools,
  showTuckBox,
  canSaveConfig,
  onSelectDeck,
  onSelectConfig,
  onSaveConfig,
  onToggleProductionTools,
  onToggleTuckBox,
  onPrevCard,
  onNextCard,
  onJumpToCard,
}: AdminTemplatesHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div>
        <Link to="/admin" style={{ color: '#d4af64', textDecoration: 'none', fontSize: '0.85rem' }}>← Dashboard</Link>
        <h1 style={{ margin: '0.5rem 0 0', fontFamily: 'var(--font-serif)', fontSize: '1.4rem' }}>
          {activeDeck ? `${activeDeck.name} · Diseño del mazo` : 'Diseño del mazo'}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!isEmbedded ? (
          <>
            <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Seleccionar mazo:</label>
            <select
              value={selectedDeckId}
              onChange={event => onSelectDeck(event.target.value)}
              style={{
                background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--color-gold)',
                borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.9rem', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">-- Elige un mazo para editar --</option>
              {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
            </select>
          </>
        ) : (
          <span
            style={{
              border: '1px solid rgba(212,175,100,0.26)',
              background: 'rgba(212,175,100,0.1)',
              color: '#f3d58c',
              borderRadius: '999px',
              padding: '0.4rem 0.65rem',
              fontSize: '0.76rem',
              fontWeight: 700,
            }}
          >
            Alcance: todo el mazo
          </span>
        )}

        {activeDeck && savedConfigs.length > 0 && (
          <>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
            <label style={{ fontSize: '0.8rem', opacity: 0.6 }}>Layout activo:</label>
            <select
              value={selectedConfigId}
              onChange={event => onSelectConfig(event.target.value)}
              style={{
                background: 'rgba(0,0,0,0.5)', color: 'white',
                border: `1px solid ${selectedConfigId ? '#4a90e2' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.85rem',
                cursor: 'pointer', outline: 'none', maxWidth: '220px',
              }}
            >
              <option value="">Actual del mazo</option>
              {savedConfigs.map(config => (
                <option key={config.id} value={config.id}>
                  {config.name} ({config.card_width}×{config.card_height}mm)
                </option>
              ))}
            </select>
          </>
        )}

        {activeDeck && canSaveConfig && (
          <button
            onClick={onSaveConfig}
            disabled={savingConfig}
            style={{
              background: 'linear-gradient(135deg, #1e3c72, #2a5298)', border: '1px solid #4a90e2',
              color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
              cursor: savingConfig ? 'not-allowed' : 'pointer', fontWeight: 'bold',
              opacity: savingConfig ? 0.6 : 1,
            }}
            title="Crea una copia reusable en el historial. Para aplicar lo que ves al mazo usá Guardar layout en el canvas."
          >
            {savingConfig ? 'Guardando...' : 'Guardar copia'}
          </button>
        )}

        {activeDeck && (
          <button
            onClick={onToggleProductionTools}
            style={{
              background: showProductionTools ? 'rgba(212,175,100,0.15)' : 'transparent',
              border: `1px solid ${showProductionTools ? '#d4af64' : 'rgba(255,255,255,0.2)'}`,
              color: showProductionTools ? '#d4af64' : 'white',
              padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
              cursor: 'pointer', fontWeight: showProductionTools ? 700 : 400,
              transition: 'all 0.2s',
            }}
          >
            Producción
          </button>
        )}

        {activeDeck && showProductionTools && (
          <>
            <button
              onClick={onToggleTuckBox}
              style={{
                background: showTuckBox ? 'rgba(212,175,100,0.15)' : 'transparent',
                border: `1px solid ${showTuckBox ? '#d4af64' : 'rgba(255,255,255,0.2)'}`,
                color: showTuckBox ? '#d4af64' : 'white',
                padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                cursor: 'pointer', fontWeight: showTuckBox ? 700 : 400,
                transition: 'all 0.2s',
              }}
            >
              Caja
            </button>

            <Link
              to={`/admin/${encodeURIComponent(activeDeck.slug || activeDeck.id)}?studio=output`}
              style={{
                background: '#d4af64', color: '#000', padding: '0.5rem 1rem',
                borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              Publicar / PDF
            </Link>
          </>
        )}

        {totalCards > 0 && (
          <CardNavigator
            activeCardIndex={activeCardIndex}
            totalCards={totalCards}
            onPrev={onPrevCard}
            onNext={onNextCard}
            onJump={onJumpToCard}
          />
        )}
      </div>
    </div>
  );
}
