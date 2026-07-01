import type { ReactNode } from 'react';
import type {
  DeckDesignPipelineState,
  DesignDirectionField,
  DesignAuditFinding,
  DesignAuditSeverity,
  DesignFieldColorRole,
  DesignFieldPosition,
  DesignFieldRole,
  DesignFieldScale,
  DesignPipelineStageStatus,
  DesignRecommendation,
} from '../../../lib/deckDesignPipeline';
import { ScopeMetric } from './DesignScopePanel';

interface DesignPipelineWorkspaceProps {
  deckName: string;
  activeFace: 'front' | 'back';
  activeCardIndex: number;
  totalCards: number;
  cardWidth: number;
  cardHeight: number;
  hiddenFieldCount: number;
  savedConfigCount: number;
  activeLayoutLabel: string;
  pipeline: DeckDesignPipelineState;
  rejectedRecommendationIds: string[];
  applyingRecommendationId: string | null;
  advancedOpen: boolean;
  analyzing: boolean;
  autoLayoutUnavailableReason?: string;
  onToggleAdvanced: () => void;
  onAutoLayout: () => void;
  onJumpToCard: (cardIndex: number) => void;
  onApplyRecommendation: (recommendation: DesignRecommendation) => void;
  onRejectRecommendation: (recommendationId: string) => void;
  fieldInventory: ReactNode;
  backgroundTools: ReactNode;
  layoutTools: ReactNode;
  savedConfigTools: ReactNode;
}

const severityCopy: Record<DesignAuditSeverity, string> = {
  blocker: 'Bloqueos',
  warning: 'Alertas',
  suggestion: 'Sugerencias',
};

const severityTone: Record<DesignAuditSeverity, { border: string; bg: string; color: string }> = {
  blocker: { border: 'rgba(248,113,113,0.36)', bg: 'rgba(248,113,113,0.1)', color: '#fca5a5' },
  warning: { border: 'rgba(251,191,36,0.36)', bg: 'rgba(251,191,36,0.1)', color: '#fde68a' },
  suggestion: { border: 'rgba(96,165,250,0.34)', bg: 'rgba(96,165,250,0.1)', color: '#bfdbfe' },
};

const stageTone: Record<DesignPipelineStageStatus, { label: string; border: string; bg: string; color: string }> = {
  not_started: { label: 'Pendiente', border: 'rgba(255,255,255,0.11)', bg: 'rgba(255,255,255,0.035)', color: 'rgba(255,255,255,0.55)' },
  in_progress: { label: 'En curso', border: 'rgba(96,165,250,0.38)', bg: 'rgba(96,165,250,0.11)', color: '#bfdbfe' },
  needs_review: { label: 'Revisar', border: 'rgba(251,191,36,0.38)', bg: 'rgba(251,191,36,0.11)', color: '#fde68a' },
  blocked: { label: 'Bloqueado', border: 'rgba(248,113,113,0.42)', bg: 'rgba(248,113,113,0.11)', color: '#fca5a5' },
  complete: { label: 'OK', border: 'rgba(53,208,127,0.36)', bg: 'rgba(53,208,127,0.1)', color: '#86efac' },
};

export function DesignPipelineWorkspace({
  deckName,
  activeFace,
  activeCardIndex,
  totalCards,
  cardWidth,
  cardHeight,
  hiddenFieldCount,
  savedConfigCount,
  activeLayoutLabel,
  pipeline,
  rejectedRecommendationIds,
  applyingRecommendationId,
  advancedOpen,
  analyzing,
  autoLayoutUnavailableReason,
  onToggleAdvanced,
  onAutoLayout,
  onJumpToCard,
  onApplyRecommendation,
  onRejectRecommendation,
  fieldInventory,
  backgroundTools,
  layoutTools,
  savedConfigTools,
}: DesignPipelineWorkspaceProps) {
  const visibleRecommendations = pipeline.audit.recommendations.filter(
    recommendation => !rejectedRecommendationIds.includes(recommendation.id),
  );
  const autoLayoutDisabled = analyzing || Boolean(autoLayoutUnavailableReason);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,100,0.14), rgba(255,255,255,0.035))',
          border: '1px solid rgba(212,175,100,0.25)',
          borderRadius: '8px',
          padding: '0.95rem',
          display: 'grid',
          gap: '0.85rem',
        }}
      >
        <div>
          <p style={{ margin: '0 0 0.25rem', color: '#f3d58c', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Pipeline de diseno
          </p>
          <h2 style={{ margin: 0, fontSize: '1rem', lineHeight: 1.25, color: 'white' }}>
            {deckName}
          </h2>
          <p style={{ margin: '0.35rem 0 0', color: 'rgba(255,255,255,0.66)', fontSize: '0.76rem', lineHeight: 1.45 }}>
            {pipeline.audit.nextAction}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
          <ScopeMetric label="Cara activa" value={activeFace === 'front' ? 'Frente' : 'Dorso'} />
          <ScopeMetric label="Carta muestra" value={totalCards > 0 ? `${activeCardIndex + 1}/${totalCards}` : '--'} />
          <ScopeMetric label="Tamaño" value={`${cardWidth}x${cardHeight}mm`} />
          <ScopeMetric label="Campos ocultos" value={String(hiddenFieldCount)} />
          <ScopeMetric label="Versiones" value={String(savedConfigCount)} />
          <ScopeMetric label="Layout" value={activeLayoutLabel} />
        </div>
      </section>

      <section
        id="baraja-background-inspector"
        style={{
          ...panelStyle,
          border: '1px solid rgba(96,165,250,0.28)',
          background: 'linear-gradient(180deg, rgba(96,165,250,0.08), rgba(255,255,255,0.032))',
        }}
      >
        <PanelHeading title="Herramientas AI" subtitle="Fondo contextual y lectura auditada para la cara activa." />
        <button
          type="button"
          onClick={onAutoLayout}
          disabled={autoLayoutDisabled}
          title={autoLayoutUnavailableReason || 'Optimizar posiciones, fuentes, tamanos y contraste contra el fondo activo'}
          style={{
            minHeight: '44px',
            width: '100%',
            border: `1px solid ${autoLayoutDisabled ? 'rgba(255,255,255,0.12)' : 'rgba(96,165,250,0.45)'}`,
            background: autoLayoutDisabled ? 'rgba(255,255,255,0.045)' : 'linear-gradient(135deg, rgba(96,165,250,0.22), rgba(212,175,100,0.16))',
            color: autoLayoutDisabled ? 'rgba(255,255,255,0.5)' : '#e8f1ff',
            borderRadius: '7px',
            cursor: autoLayoutDisabled ? 'not-allowed' : 'pointer',
            fontSize: '0.82rem',
            fontWeight: 850,
            marginBottom: autoLayoutUnavailableReason ? '0.35rem' : '0.75rem',
          }}
        >
          {analyzing ? 'AI analizando texto...' : 'AI texto + contraste'}
        </button>
        {autoLayoutUnavailableReason ? (
          <p style={{ margin: '0 0 0.75rem', color: 'rgba(255,255,255,0.48)', fontSize: '0.68rem', lineHeight: 1.35 }}>
            {autoLayoutUnavailableReason}
          </p>
        ) : null}
        {backgroundTools}
      </section>

      <section style={panelStyle}>
        <PanelHeading title="Recomendaciones" subtitle="Nada se aplica sin aprobacion." />
        {visibleRecommendations.length === 0 ? (
          <EmptyLine text="No hay recomendaciones pendientes." />
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {visibleRecommendations.map(recommendation => {
              const applying = applyingRecommendationId === recommendation.id;
              return (
                <div
                  key={recommendation.id}
                  style={{
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.18)',
                    borderRadius: '7px',
                    padding: '0.7rem',
                    display: 'grid',
                    gap: '0.45rem',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', color: 'white', fontSize: '0.8rem' }}>{recommendation.title}</strong>
                    <span style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', lineHeight: 1.42, marginTop: '0.22rem' }}>
                      {recommendation.description}
                    </span>
                    <span style={{ display: 'block', color: '#f3d58c', fontSize: '0.68rem', lineHeight: 1.35, marginTop: '0.25rem' }}>
                      {recommendation.impact}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => onApplyRecommendation(recommendation)}
                      disabled={applying}
                      style={primaryButtonStyle(applying)}
                    >
                      {applying ? 'Aplicando...' : 'Aplicar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectRecommendation(recommendation.id)}
                      disabled={applying}
                      style={secondaryButtonStyle}
                    >
                      Omitir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ToolDetails title="Diagnostico detallado">
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <section style={diagnosticBlockStyle}>
            <PanelHeading title="Carta activa" subtitle="Inventario visible de frente y dorso para la muestra actual." />
            {fieldInventory}
          </section>

          <section style={diagnosticBlockStyle}>
            <PanelHeading title="Etapas" subtitle="Estado del flujo antes de tocar controles tecnicos." />
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {pipeline.stages.map(stage => {
                const tone = stageTone[stage.status];
                return (
                  <div
                    key={stage.id}
                    style={{
                      border: `1px solid ${tone.border}`,
                      background: tone.bg,
                      borderRadius: '7px',
                      padding: '0.62rem',
                      display: 'grid',
                      gap: '0.2rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
                      <strong style={{ color: 'white', fontSize: '0.78rem' }}>{stage.label}</strong>
                      <span style={{ color: tone.color, fontSize: '0.66rem', fontWeight: 800 }}>{tone.label}</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem' }}>{stage.summary}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={diagnosticBlockStyle}>
            <PanelHeading title="Muestras" subtitle="Cartas que explican los riesgos del mazo." />
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {pipeline.audit.samples.map(sample => {
                const tone = severityTone[sample.tone];
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onJumpToCard(sample.cardIndex)}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${tone.border}`,
                      background: tone.bg,
                      borderRadius: '7px',
                      padding: '0.6rem',
                      cursor: 'pointer',
                      color: 'white',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800 }}>{sample.label}</span>
                    <span style={{ display: 'block', color: tone.color, fontSize: '0.68rem', marginTop: '0.18rem' }}>{sample.reason}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={diagnosticBlockStyle}>
            <PanelHeading title="Direccion de layout" subtitle={pipeline.audit.direction.summary} />
            <div style={{ display: 'grid', gap: '0.7rem' }}>
              {(['front', 'back', 'hidden'] as const).map(face => (
                <DirectionGroup
                  key={face}
                  face={face}
                  fields={pipeline.audit.direction.fields.filter(field => field.recommendedFace === face)}
                />
              ))}
            </div>
          </section>

          <section style={diagnosticBlockStyle}>
            <PanelHeading title="Auditoria" subtitle="Hallazgos reproducibles desde datos del mazo." />
            {(['blocker', 'warning', 'suggestion'] as const).map(severity => (
              <FindingGroup
                key={severity}
                severity={severity}
                findings={pipeline.audit.findings.filter(finding => finding.severity === severity)}
                onJumpToCard={onJumpToCard}
              />
            ))}
          </section>
        </div>
      </ToolDetails>

      <section style={panelStyle}>
        <button
          type="button"
          onClick={onToggleAdvanced}
          style={{
            width: '100%',
            minHeight: '38px',
            background: advancedOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: '7px',
            color: advancedOpen ? 'white' : 'rgba(255,255,255,0.72)',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 800,
          }}
        >
          {advancedOpen ? 'Ocultar campos y versiones' : 'Mostrar campos y versiones'}
        </button>

        {advancedOpen && (
          <div style={{ display: 'grid', gap: '1rem', marginTop: '0.9rem' }}>
            <ToolDetails title="Campos y layout" open>
              {layoutTools}
            </ToolDetails>
            <ToolDetails title="Versiones guardadas" open>
              {savedConfigTools}
            </ToolDetails>
          </div>
        )}
      </section>
    </div>
  );
}

function DirectionGroup({
  face,
  fields,
}: {
  face: 'front' | 'back' | 'hidden';
  fields: DesignDirectionField[];
}) {
  if (fields.length === 0) return null;

  const title = face === 'front' ? 'Frente' : face === 'back' ? 'Dorso' : 'Oculto';
  return (
    <div style={{ display: 'grid', gap: '0.45rem' }}>
      <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 850 }}>
        {title}
      </div>
      {fields.map(field => (
        <div
          key={field.fieldKey}
          style={{
            border: `1px solid ${field.currentFace === field.recommendedFace ? 'rgba(53,208,127,0.2)' : 'rgba(251,191,36,0.35)'}`,
            background: field.currentFace === field.recommendedFace ? 'rgba(255,255,255,0.025)' : 'rgba(251,191,36,0.08)',
            borderRadius: '7px',
            padding: '0.62rem',
            display: 'grid',
            gap: '0.42rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong style={{ color: 'white', fontSize: '0.77rem' }}>{field.label}</strong>
            <span style={{ color: field.currentFace === field.recommendedFace ? '#86efac' : '#fde68a', fontSize: '0.64rem', fontWeight: 850 }}>
              {field.currentFace === field.recommendedFace ? 'alineado' : `hoy: ${faceLabel(field.currentFace)}`}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem' }}>
            <DirectionPill label={roleLabel(field.role)} />
            <DirectionPill label={`orden ${field.priority}`} />
            <DirectionPill label={scaleLabel(field.scale)} />
            <DirectionPill label={positionLabel(field.position)} />
            <DirectionPill label={colorRoleLabel(field.colorRole)} />
          </div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '0.69rem', lineHeight: 1.38 }}>
            {field.rationale}
          </p>
        </div>
      ))}
    </div>
  );
}

function DirectionPill({ label }: { label: string }) {
  return (
    <span
      style={{
        border: '1px solid rgba(255,255,255,0.11)',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '999px',
        padding: '0.16rem 0.42rem',
        color: 'rgba(255,255,255,0.64)',
        fontSize: '0.62rem',
        fontWeight: 750,
      }}
    >
      {label}
    </span>
  );
}

function FindingGroup({
  severity,
  findings,
  onJumpToCard,
}: {
  severity: DesignAuditSeverity;
  findings: DesignAuditFinding[];
  onJumpToCard: (cardIndex: number) => void;
}) {
  const tone = severityTone[severity];
  return (
    <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ color: tone.color, fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 850 }}>
          {severityCopy[severity]}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.68rem' }}>{findings.length}</span>
      </div>

      {findings.length === 0 ? (
        <EmptyLine text="Sin hallazgos." />
      ) : findings.slice(0, 6).map(finding => (
        <div
          key={finding.id}
          style={{
            border: `1px solid ${tone.border}`,
            background: tone.bg,
            borderRadius: '7px',
            padding: '0.62rem',
            display: 'grid',
            gap: '0.35rem',
          }}
        >
          <strong style={{ color: 'white', fontSize: '0.76rem' }}>{finding.title}</strong>
          <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.7rem', lineHeight: 1.4 }}>
            {finding.description}
          </span>
          <FindingEvidence finding={finding} onJumpToCard={onJumpToCard} />
        </div>
      ))}

      {findings.length > 6 && (
        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.68rem' }}>
          {findings.length - 6} hallazgos mas quedan resumidos por el contador.
        </span>
      )}
    </div>
  );
}

function FindingEvidence({
  finding,
  onJumpToCard,
}: {
  finding: DesignAuditFinding;
  onJumpToCard: (cardIndex: number) => void;
}) {
  const parts = [
    finding.face ? (finding.face === 'front' ? 'Frente' : 'Dorso') : null,
    finding.fieldKey ?? null,
    typeof finding.cardIndex === 'number' ? `Carta ${finding.cardIndex + 1}` : null,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.66rem' }}>
        {parts.length > 0 ? parts.join(' · ') : 'Nivel mazo'}
      </span>
      {typeof finding.cardIndex === 'number' && (
        <button
          type="button"
          onClick={() => onJumpToCard(finding.cardIndex!)}
          style={{
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.74)',
            borderRadius: '5px',
            padding: '0.25rem 0.42rem',
            cursor: 'pointer',
            fontSize: '0.66rem',
            fontWeight: 750,
          }}
        >
          Ver
        </button>
      )}
    </div>
  );
}

function faceLabel(face: 'front' | 'back' | 'hidden') {
  return face === 'front' ? 'frente' : face === 'back' ? 'dorso' : 'oculto';
}

function roleLabel(role: DesignFieldRole) {
  const labels: Record<DesignFieldRole, string> = {
    identity: 'identidad',
    primary_payload: 'payload principal',
    emotional_hook: 'gancho',
    context: 'contexto',
    answer: 'respuesta',
    support: 'apoyo',
    utility: 'utilidad',
    brand: 'marca',
  };
  return labels[role];
}

function scaleLabel(scale: DesignFieldScale) {
  const labels: Record<DesignFieldScale, string> = {
    hero: 'hero',
    large: 'grande',
    body: 'lectura',
    small: 'pequeno',
    micro: 'micro',
  };
  return labels[scale];
}

function positionLabel(position: DesignFieldPosition) {
  const labels: Record<DesignFieldPosition, string> = {
    'front-top': 'arriba frente',
    'front-image': 'imagen frente',
    'front-bottom': 'pie frente',
    'back-top': 'arriba dorso',
    'back-center': 'centro dorso',
    'back-lower': 'abajo dorso',
    'back-footer': 'pie dorso',
    hidden: 'sin caja',
  };
  return labels[position];
}

function colorRoleLabel(role: DesignFieldColorRole) {
  const labels: Record<DesignFieldColorRole, string> = {
    'image-led': 'imagen manda',
    'primary-text': 'alto contraste',
    'accent-text': 'acento',
    'muted-text': 'bajo contraste',
    'utility-muted': 'utilitario',
  };
  return labels[role];
}

function PanelHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.24rem', color: '#d4af64', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </p>
      <p style={{ margin: 0, color: 'rgba(255,255,255,0.58)', fontSize: '0.72rem', lineHeight: 1.42 }}>
        {subtitle}
      </p>
    </div>
  );
}

function ToolDetails({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.18)',
        borderRadius: '7px',
        padding: '0.65rem',
      }}
    >
      <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.78)', fontSize: '0.76rem', fontWeight: 800 }}>
        {title}
      </summary>
      <div style={{ marginTop: '0.75rem' }}>{children}</div>
    </details>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div
      style={{
        border: '1px dashed rgba(255,255,255,0.11)',
        borderRadius: '7px',
        padding: '0.65rem',
        color: 'rgba(255,255,255,0.45)',
        fontSize: '0.72rem',
      }}
    >
      {text}
    </div>
  );
}

const panelStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '8px',
  padding: '0.9rem',
  display: 'grid',
  gap: '0.8rem',
} as const;

const diagnosticBlockStyle = {
  borderTop: '1px solid rgba(255,255,255,0.08)',
  paddingTop: '0.85rem',
  display: 'grid',
  gap: '0.75rem',
} as const;

function primaryButtonStyle(disabled: boolean) {
  return {
    minHeight: '34px',
    background: disabled ? '#444' : 'var(--color-gold)',
    color: '#111',
    border: 'none',
    borderRadius: '6px',
    cursor: disabled ? 'wait' : 'pointer',
    fontSize: '0.72rem',
    fontWeight: 850,
  } as const;
}

const secondaryButtonStyle = {
  minHeight: '34px',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 800,
} as const;
