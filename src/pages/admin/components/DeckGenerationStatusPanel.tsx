import type { RawDeckContent } from '@eb-packages/deck-engine';
import type { FieldPlacementMap } from '../../../lib/cardFieldPlacements';
import type { SavedConfigRow } from '../../../lib/deckRepository';
import { CardFieldInventoryPanel } from './CardFieldInventoryPanel';
import {
  getCardFieldInventory,
  type DeckCardLike,
} from './cardFieldInventory';
import { ScopeMetric } from './DesignScopePanel';

interface DeckGenerationStatusPanelProps {
  deck: RawDeckContent;
  cards: DeckCardLike[];
  mockData: Record<string, string>;
  activeFace: 'front' | 'back';
  activeCardIndex: number;
  cardWidth: number;
  cardHeight: number;
  hiddenFields: Record<string, boolean>;
  fieldPlacements: FieldPlacementMap;
  configs: SavedConfigRow[];
  selectedConfigId: string;
  loadingConfigs: boolean;
  savingConfig: boolean;
  applyingId: string | null;
  onSelectConfig: (configId: string) => void;
  onSaveConfig: () => void;
  onApplyConfig: (config: SavedConfigRow) => void;
}

export function DeckGenerationStatusPanel({
  deck,
  cards,
  mockData,
  activeFace,
  activeCardIndex,
  cardWidth,
  cardHeight,
  hiddenFields,
  fieldPlacements,
  configs,
  selectedConfigId,
  loadingConfigs,
  savingConfig,
  applyingId,
  onSelectConfig,
  onSaveConfig,
  onApplyConfig,
}: DeckGenerationStatusPanelProps) {
  const totalCards = cards.length;
  const frontArtCount = cards.filter(card => Boolean(card.front?.art_url)).length;
  const aiBackCount = cards.filter(card => Boolean(card.back?.back_image_url)).length;
  const hiddenCount = Object.values(hiddenFields).filter(Boolean).length;
  const selectedConfig = configs.find(config => config.id === selectedConfigId);
  const sampleCard = cards[activeCardIndex];
  const hasDeckLayout = Boolean(deck.design_template_overrides?.layout_config);
  const currentLayoutLabel = selectedConfig?.name || (hasDeckLayout ? 'Layout aplicado' : 'Layout base');

  const fieldInventory = getCardFieldInventory({
    deckName: deck.name,
    card: sampleCard,
    mockData,
    hiddenFields,
    fieldPlacements,
  });

  const shownConfigs = configs.slice(0, 3);

  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '0.9rem',
        marginBottom: '1rem',
        display: 'grid',
        gap: '0.85rem',
      }}
    >
      <div>
        <p style={{ margin: '0 0 0.22rem', color: '#d4af64', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Datos del mazo activo
        </p>
        <h2 style={{ margin: 0, color: 'white', fontSize: '0.94rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deck.name}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
        <GenerationMetric label="Arte" count={frontArtCount} total={totalCards} tone="#35d07f" />
        <GenerationMetric label="Reversos IA" count={aiBackCount} total={totalCards} tone="#a78bfa" />
        <ScopeMetric label="Versiones" value={loadingConfigs ? '...' : String(configs.length)} />
        <ScopeMetric label="Ocultos" value={String(hiddenCount)} />
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '7px',
          padding: '0.7rem',
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <DataRow label="Layout" value={currentLayoutLabel} strong={Boolean(selectedConfig)} />
          <DataRow label="Muestra" value={`${activeCardIndex + 1}/${Math.max(totalCards, 1)} · ${activeFace === 'front' ? 'Frente' : 'Dorso'}`} />
          <DataRow label="Tamaño" value={`${cardWidth}×${cardHeight}mm`} />
        </div>
      </div>

      <CardFieldInventoryPanel
        activeFace={activeFace}
        frontFields={fieldInventory.front}
        backFields={fieldInventory.back}
      />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Layouts guardados
          </div>
          <button
            type="button"
            onClick={onSaveConfig}
            disabled={savingConfig}
            style={{
              background: 'rgba(74,144,226,0.14)',
              border: '1px solid rgba(74,144,226,0.38)',
              color: '#9cc6ff',
              borderRadius: '6px',
              padding: '0.32rem 0.48rem',
              cursor: savingConfig ? 'not-allowed' : 'pointer',
              fontSize: '0.68rem',
              fontWeight: 700,
              opacity: savingConfig ? 0.55 : 1,
            }}
          >
            {savingConfig ? 'Guardando' : 'Guardar'}
          </button>
        </div>

        {loadingConfigs ? (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.76rem' }}>Cargando versiones...</div>
        ) : configs.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.11)',
              borderRadius: '7px',
              padding: '0.7rem',
              color: 'rgba(255,255,255,0.44)',
              fontSize: '0.74rem',
              lineHeight: 1.45,
            }}
          >
            Todavía no hay layouts guardados para comparar.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <button
              type="button"
              onClick={() => onSelectConfig('')}
              style={{
                textAlign: 'left',
                background: !selectedConfigId ? 'rgba(212,175,100,0.11)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${!selectedConfigId ? 'rgba(212,175,100,0.34)' : 'rgba(255,255,255,0.08)'}`,
                color: !selectedConfigId ? '#f3d58c' : 'rgba(255,255,255,0.64)',
                borderRadius: '7px',
                padding: '0.55rem 0.65rem',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 700,
              }}
            >
              Actual del mazo
            </button>

            {shownConfigs.map(config => {
              const isSelected = selectedConfigId === config.id;
              const isApplying = applyingId === config.id;
              const hiddenInConfig = Object.values(config.hidden_fields || {}).filter(Boolean).length;
              const dateLabel = formatSavedConfigDate(config.updated_at || config.created_at);

              return (
                <div
                  key={config.id}
                  style={{
                    border: `1px solid ${isSelected ? 'rgba(74,144,226,0.48)' : 'rgba(255,255,255,0.08)'}`,
                    background: isSelected ? 'rgba(74,144,226,0.12)' : 'rgba(255,255,255,0.025)',
                    borderRadius: '7px',
                    padding: '0.6rem',
                    display: 'grid',
                    gap: '0.48rem',
                  }}
                >
                  <div>
                    <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {config.name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.67rem', marginTop: '0.15rem' }}>
                      {config.card_width}×{config.card_height}mm · {hiddenInConfig} ocultos · {dateLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => onSelectConfig(config.id)}
                      style={{
                        flex: 1,
                        background: isSelected ? 'rgba(74,144,226,0.22)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isSelected ? 'rgba(74,144,226,0.5)' : 'rgba(255,255,255,0.11)'}`,
                        color: isSelected ? '#9cc6ff' : 'rgba(255,255,255,0.7)',
                        borderRadius: '5px',
                        padding: '0.35rem',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      {isSelected ? 'En vista' : 'Previsualizar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyConfig(config)}
                      disabled={isApplying}
                      style={{
                        flex: 1,
                        background: 'rgba(212,175,100,0.1)',
                        border: '1px solid rgba(212,175,100,0.32)',
                        color: '#d4af64',
                        borderRadius: '5px',
                        padding: '0.35rem',
                        cursor: isApplying ? 'not-allowed' : 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        opacity: isApplying ? 0.5 : 1,
                      }}
                    >
                      {isApplying ? 'Aplicando' : 'Aplicar'}
                    </button>
                  </div>
                </div>
              );
            })}

            {configs.length > shownConfigs.length && (
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.68rem', textAlign: 'center' }}>
                {configs.length - shownConfigs.length} más en herramientas avanzadas
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function GenerationMetric({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        padding: '0.55rem',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'baseline' }}>
        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ color: tone, fontSize: '0.68rem', fontWeight: 800 }}>{percent}%</span>
      </div>
      <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 750, marginTop: '0.18rem' }}>
        {count}/{total}
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.42rem' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: tone, borderRadius: '999px' }} />
      </div>
    </div>
  );
}

function DataRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '4.4rem 1fr', gap: '0.5rem', alignItems: 'baseline' }}>
      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ color: strong ? '#9cc6ff' : 'rgba(255,255,255,0.78)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.76rem', fontWeight: strong ? 800 : 650 }}>
        {value}
      </span>
    </div>
  );
}

function formatSavedConfigDate(value: string): string {
  if (!value) return 'sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sin fecha';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
}
