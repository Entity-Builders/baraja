import type {
  Card,
  CardFieldPlacement,
  CardFieldPlacementKey,
  DeckSchema,
} from '@entity-builders/deck-engine';
import type { Schema, Template } from '@pdfme/common';
import {
  CARD_FIELD_DEFINITIONS,
  CARD_FIELD_KEYS,
  getCardFieldText,
  type FieldPlacementMap,
} from './cardFieldPlacements';
import {
  getCardPublicationReadiness,
  getDeckPublicationReadiness,
  getMissingRequiredFieldLabels,
} from './deckPublicationReadiness';
import {
  getDeckReverseModel,
  shouldUseLegacyFullBackTemplate,
  type DeckReverseModelInfo,
} from './reverseModel';

export type DesignPipelineStageId = 'brief' | 'proposal' | 'audit' | 'apply' | 'verify';
export type DesignPipelineStageStatus = 'not_started' | 'in_progress' | 'needs_review' | 'blocked' | 'complete';
export type DesignAuditSeverity = 'blocker' | 'warning' | 'suggestion';
export type DesignFieldRole =
  | 'identity'
  | 'primary_payload'
  | 'emotional_hook'
  | 'context'
  | 'answer'
  | 'support'
  | 'utility'
  | 'brand';
export type DesignFieldScale = 'hero' | 'large' | 'body' | 'small' | 'micro';
export type DesignFieldPosition = 'front-top' | 'front-image' | 'front-bottom' | 'back-top' | 'back-center' | 'back-lower' | 'back-footer' | 'hidden';
export type DesignFieldColorRole = 'image-led' | 'primary-text' | 'accent-text' | 'muted-text' | 'utility-muted';
export type DesignDeckMode = 'action' | 'introspection';

export interface DesignPipelineStage {
  id: DesignPipelineStageId;
  label: string;
  status: DesignPipelineStageStatus;
  summary: string;
}

export interface RepresentativeCardSample {
  id: string;
  cardId: string;
  cardIndex: number;
  label: string;
  reason: string;
  tone: DesignAuditSeverity;
}

export interface DesignDirectionField {
  fieldKey: CardFieldPlacementKey;
  label: string;
  role: DesignFieldRole;
  priority: number;
  recommendedFace: CardFieldPlacement;
  currentFace: CardFieldPlacement;
  scale: DesignFieldScale;
  position: DesignFieldPosition;
  colorRole: DesignFieldColorRole;
  rationale: string;
}

export interface DesignDirectionPlan {
  mode: DesignDeckMode;
  summary: string;
  primaryFieldKey: CardFieldPlacementKey;
  fields: DesignDirectionField[];
}

export interface DesignAuditFinding {
  id: string;
  severity: DesignAuditSeverity;
  title: string;
  description: string;
  face?: 'front' | 'back';
  fieldKey?: CardFieldPlacementKey;
  cardId?: string;
  cardIndex?: number;
  actionId?: DesignRecommendationActionId;
}

export type DesignRecommendationActionId =
  | 'run_auto_layout'
  | 'save_layout_version'
  | 'hide_field'
  | 'move_field_to_front'
  | 'move_field_to_back'
  | 'review_card'
  | 'open_background_tools';

export interface DesignRecommendation {
  id: string;
  title: string;
  description: string;
  impact: string;
  actionId: DesignRecommendationActionId;
  fieldKey?: CardFieldPlacementKey;
  cardIndex?: number;
  sourceFindingIds: string[];
}

export interface DeckDesignAudit {
  findings: DesignAuditFinding[];
  recommendations: DesignRecommendation[];
  direction: DesignDirectionPlan;
  samples: RepresentativeCardSample[];
  counts: Record<DesignAuditSeverity, number>;
  readinessLabel: string;
  nextAction: string;
}

export interface DeckDesignPipelineState {
  stages: DesignPipelineStage[];
  audit: DeckDesignAudit;
}

export interface BuildDeckDesignPipelineInput {
  deck: DeckSchema;
  template: Template | null;
  fieldPlacements: FieldPlacementMap;
  hiddenFields: Record<string, boolean>;
  activeCardIndex: number;
  activeFace: 'front' | 'back';
  cardWidth: number;
  cardHeight: number;
  savedConfigCount: number;
  selectedConfigId: string;
  hasBackgroundAsset?: boolean;
  reverseModelInfo?: DeckReverseModelInfo | null;
}

const FIELD_LENGTH_LIMITS: Record<CardFieldPlacementKey, number> = {
  number: 4,
  title: 42,
  when_to_use: 115,
  phrase: 125,
  instruction: 260,
  answer: 115,
  fun_fact: 160,
  qr: 0,
  brand: 50,
};
const PT_TO_MM = 0.352777778;

const FIELD_LABELS = CARD_FIELD_DEFINITIONS.reduce<Record<CardFieldPlacementKey, string>>((acc, field) => {
  acc[field.key] = field.label;
  return acc;
}, {} as Record<CardFieldPlacementKey, string>);
const MIN_READABLE_FONT_SIZE_BY_FIELD: Partial<Record<CardFieldPlacementKey, number>> = {
  when_to_use: 5.5,
  phrase: 8,
  instruction: 8,
  answer: 6,
  fun_fact: 5.8,
  brand: 3.8,
  title: 7,
};

export function buildDeckDesignPipelineState(input: BuildDeckDesignPipelineInput): DeckDesignPipelineState {
  const audit = buildDeckDesignAudit(input);
  const hasBlockers = audit.counts.blocker > 0;
  const hasRecommendations = audit.recommendations.length > 0;
  const hasWarnings = audit.counts.warning > 0;

  return {
    audit,
    stages: [
      {
        id: 'brief',
        label: 'Brief del mazo',
        status: input.deck.cards.length > 0 ? 'complete' : 'blocked',
        summary: `${input.deck.cards.length} cartas · ${input.activeFace === 'front' ? 'frente' : 'dorso'} activo`,
      },
      {
        id: 'proposal',
        label: 'Propuesta AI',
        status: hasRecommendations ? 'needs_review' : 'complete',
        summary: hasRecommendations
          ? `${audit.recommendations.length} acciones sugeridas`
          : 'Sin cambios sugeridos',
      },
      {
        id: 'audit',
        label: 'Auditoria',
        status: hasBlockers ? 'blocked' : hasWarnings ? 'needs_review' : 'complete',
        summary: `${audit.counts.blocker} bloqueos · ${audit.counts.warning} alertas`,
      },
      {
        id: 'apply',
        label: 'Aplicar',
        status: hasRecommendations ? 'needs_review' : 'not_started',
        summary: hasRecommendations ? 'Requiere aprobacion' : 'Nada pendiente',
      },
      {
        id: 'verify',
        label: 'Verificar',
        status: hasBlockers ? 'blocked' : 'complete',
        summary: audit.readinessLabel,
      },
    ],
  };
}

export function buildDeckDesignAudit(input: BuildDeckDesignPipelineInput): DeckDesignAudit {
  const findings: DesignAuditFinding[] = [];
  const reverseModelInfo = input.reverseModelInfo ?? getDeckReverseModel(input.deck, input.template);
  const usesLegacyFullBack = shouldUseLegacyFullBackTemplate(reverseModelInfo);
  const direction = buildDesignDirectionPlan({
    deck: input.deck,
    fieldPlacements: input.fieldPlacements,
    hiddenFields: input.hiddenFields,
  });
  const samples = selectRepresentativeCardSamples({
    deck: input.deck,
    activeCardIndex: input.activeCardIndex,
  });
  const readiness = getDeckPublicationReadiness(input.deck);

  readiness.blockers.forEach(blocker => {
    findings.push({
      id: `publication-${blocker.key}`,
      severity: 'blocker',
      title: blocker.label,
      description: blocker.detail,
      actionId: blocker.key === 'front-art' ? 'review_card' : undefined,
    });
  });

  input.deck.cards.forEach((card, cardIndex) => {
    const cardReadiness = getCardPublicationReadiness(input.deck, card);
    if (cardReadiness.missingRequiredFields.length > 0) {
      findings.push({
        id: `required-content-${card.id}`,
        severity: 'blocker',
        title: `Carta ${formatCardNumber(card)} incompleta`,
        description: `Falta ${getMissingRequiredFieldLabels(cardReadiness.missingRequiredFields)}.`,
        face: 'back',
        cardId: card.id,
        cardIndex,
        actionId: 'review_card',
      });
    }

    if (!hasText(card.front.art_url)) {
      findings.push({
        id: `front-art-${card.id}`,
        severity: 'blocker',
        title: `Carta ${formatCardNumber(card)} sin arte frontal`,
        description: 'La landing y el PDF necesitan una imagen frontal real para esta carta.',
        face: 'front',
        cardId: card.id,
        cardIndex,
        actionId: 'review_card',
      });
    }

    if (!hasText(card.back.back_image_url) && !cardReadiness.hasCompleteContent) {
      findings.push({
        id: `renderable-back-${card.id}`,
        severity: 'blocker',
        title: `Carta ${formatCardNumber(card)} sin dorso renderizable`,
        description: 'Necesita contenido requerido completo o una imagen IA de reverso.',
        face: 'back',
        cardId: card.id,
        cardIndex,
        actionId: 'review_card',
      });
    }
  });

  if (usesLegacyFullBack) {
    findings.push({
      id: `reverse-model-${reverseModelInfo.model}`,
      severity: reverseModelInfo.model === 'mixed' ? 'blocker' : 'warning',
      title: reverseModelInfo.model === 'mixed'
        ? 'Dorso mixto: revisar migracion'
        : 'Dorso completo heredado',
      description: reverseModelInfo.model === 'mixed'
        ? `${reverseModelInfo.fullBackCardCount}/${reverseModelInfo.totalCards} cartas tienen imagen completa de dorso. Antes de editar tipografia, unificá el mazo como legacy o migrá a layout editable.`
        : 'Este mazo usa una imagen completa por dorso; Studio no debe superponer campos de texto hasta preparar una migracion editable.',
      face: 'back',
    });
  } else if (!input.template) {
    findings.push({
      id: 'missing-template',
      severity: 'blocker',
      title: 'Sin layout activo',
      description: 'El Studio necesita una plantilla activa antes de auditar lectura y margenes.',
      actionId: 'run_auto_layout',
    });
  } else {
    findings.push(...auditTemplate({
      template: input.template,
      deck: input.deck,
      fieldPlacements: input.fieldPlacements,
      hiddenFields: input.hiddenFields,
      cardWidth: input.cardWidth,
      cardHeight: input.cardHeight,
    }));
  }

  if (input.hasBackgroundAsset === false) {
    findings.push({
      id: 'missing-background-asset',
      severity: 'warning',
      title: 'Fondo sin asset activo',
      description: 'Generar o seleccionar un fondo antes de cerrar el layout ayuda a auditar lectura real.',
      actionId: 'open_background_tools',
    });
  }

  if (input.savedConfigCount === 0) {
    findings.push({
      id: 'no-saved-version',
      severity: 'warning',
      title: 'No hay version guardada',
      description: 'Guarda una version antes de aplicar cambios grandes para poder comparar o volver atras.',
      actionId: 'save_layout_version',
    });
  }

  if (!input.selectedConfigId && input.savedConfigCount > 0) {
    findings.push({
      id: 'current-layout-not-versioned',
      severity: 'suggestion',
      title: 'Comparar contra versiones',
      description: 'Hay versiones guardadas disponibles para comparar antes de publicar.',
    });
  }

  if (!usesLegacyFullBack) {
    findings.push(...auditDesignDirection({
      template: input.template,
      direction,
    }));
  }

  const recommendations = buildRecommendations(findings, input.fieldPlacements);
  const counts = countFindings(findings);

  return {
    findings,
    recommendations,
    direction,
    samples,
    counts,
    readinessLabel: readiness.isPublishable
      ? `Listo: ${readiness.readyCardCount}/${readiness.totalCards}`
      : `Pendiente: ${readiness.readyCardCount}/${readiness.totalCards}`,
    nextAction: getNextAction(counts, recommendations.length),
  };
}

export function buildDesignDirectionPlan({
  deck,
  fieldPlacements,
  hiddenFields,
}: {
  deck: DeckSchema;
  fieldPlacements: FieldPlacementMap;
  hiddenFields: Record<string, boolean>;
}): DesignDirectionPlan {
  const mode = inferDesignDeckMode(deck);
  const primaryFieldKey: CardFieldPlacementKey = mode === 'introspection' ? 'phrase' : 'instruction';

  const plannedFields = CARD_FIELD_DEFINITIONS.map(definition => {
    const recommended = getRecommendedDirectionForField(deck, definition.key, mode);
    return {
      fieldKey: definition.key,
      label: definition.label,
      currentFace: getCurrentFace(definition.key, fieldPlacements, hiddenFields),
      ...recommended,
    };
  }).sort((a, b) => a.priority - b.priority);

  return {
    mode,
    primaryFieldKey,
    summary: mode === 'introspection'
      ? 'Frente como identidad visual; dorso como pausa emocional con frase dominante e instruccion accionable.'
      : 'Frente como identidad visual; dorso como juego: pregunta/instruccion primero, contexto y extras despues.',
    fields: plannedFields,
  };
}

function getRecommendedDirectionForField(
  deck: DeckSchema,
  fieldKey: CardFieldPlacementKey,
  mode: DesignDeckMode,
): Omit<DesignDirectionField, 'fieldKey' | 'label' | 'currentFace'> {
  const hasAnswer = deck.cards.some(card => hasText(card.back.answer));
  const hasFunFact = deck.cards.some(card => hasText(card.back.fun_fact));
  const hasQr = deck.cards.some(card => hasText(card.back.qr_url));

  if (fieldKey === 'number') {
    return {
      role: 'identity',
      priority: 10,
      recommendedFace: 'front',
      scale: 'micro',
      position: 'front-top',
      colorRole: 'accent-text',
      rationale: 'El numero orienta sin competir con la imagen ni el titulo.',
    };
  }

  if (fieldKey === 'title') {
    return {
      role: 'identity',
      priority: 20,
      recommendedFace: 'front',
      scale: 'body',
      position: 'front-bottom',
      colorRole: 'primary-text',
      rationale: 'El titulo identifica la carta; en el frente acompana al arte.',
    };
  }

  if (fieldKey === 'phrase') {
    return mode === 'introspection'
      ? {
          role: 'primary_payload',
          priority: 30,
          recommendedFace: 'back',
          scale: 'large',
          position: 'back-center',
          colorRole: 'primary-text',
          rationale: 'En mazos introspectivos la frase puede ser la entrada emocional principal.',
        }
      : {
          role: 'emotional_hook',
          priority: 50,
          recommendedFace: 'back',
          scale: 'body',
          position: 'back-top',
          colorRole: 'accent-text',
          rationale: 'La frase da tono, pero no debe competir con la pregunta o accion.',
        };
  }

  if (fieldKey === 'instruction') {
    return mode === 'introspection'
      ? {
          role: 'support',
          priority: 40,
          recommendedFace: 'back',
          scale: 'body',
          position: 'back-lower',
          colorRole: 'primary-text',
          rationale: 'La instruccion debe seguir siendo clara y accionable.',
        }
      : {
          role: 'primary_payload',
          priority: 30,
          recommendedFace: 'back',
          scale: 'large',
          position: 'back-center',
          colorRole: 'primary-text',
          rationale: 'En mazos jugables la pregunta, accion o mecanica es el centro del dorso.',
        };
  }

  if (fieldKey === 'when_to_use') {
    return {
      role: 'context',
      priority: 45,
      recommendedFace: 'back',
      scale: 'small',
      position: 'back-top',
      colorRole: 'muted-text',
      rationale: 'El contexto ayuda a entrar en la carta, pero debe leerse como apoyo.',
    };
  }

  if (fieldKey === 'answer') {
    return {
      role: 'answer',
      priority: hasAnswer ? 60 : 130,
      recommendedFace: hasAnswer ? 'back' : 'hidden',
      scale: 'body',
      position: 'back-lower',
      colorRole: 'primary-text',
      rationale: hasAnswer
        ? 'La respuesta debe estar disponible sin dominar la pregunta.'
        : 'Si el mazo no tiene respuestas, ocultar el campo reduce ruido.',
    };
  }

  if (fieldKey === 'fun_fact') {
    return {
      role: 'support',
      priority: hasFunFact ? 70 : 140,
      recommendedFace: hasFunFact ? 'back' : 'hidden',
      scale: 'small',
      position: 'back-lower',
      colorRole: 'muted-text',
      rationale: hasFunFact
        ? 'El dato extra suma textura despues del payload principal.'
        : 'Si no hay datos extra, el campo no deberia ocupar layout.',
    };
  }

  if (fieldKey === 'qr') {
    return {
      role: 'utility',
      priority: hasQr ? 90 : 150,
      recommendedFace: hasQr ? 'back' : 'hidden',
      scale: 'micro',
      position: hasQr ? 'back-footer' : 'hidden',
      colorRole: 'utility-muted',
      rationale: hasQr
        ? 'El QR es utilitario y debe vivir al pie sin romper la jerarquia.'
        : 'Sin URLs de QR, ocultarlo simplifica todo el mazo.',
    };
  }

  return {
    role: 'brand',
    priority: 100,
    recommendedFace: 'back',
    scale: 'micro',
    position: 'back-footer',
    colorRole: 'utility-muted',
    rationale: 'La marca firma el dorso, pero debe quedar silenciosa.',
  };
}

function auditDesignDirection({
  template,
  direction,
}: {
  template: Template | null;
  direction: DesignDirectionPlan;
}): DesignAuditFinding[] {
  const findings: DesignAuditFinding[] = [];
  const pages = template ? getTemplatePages(template) : null;

  direction.fields.forEach(field => {
    if (field.currentFace !== field.recommendedFace) {
      const actionId = field.recommendedFace === 'hidden'
        ? 'hide_field'
        : field.recommendedFace === 'front'
          ? 'move_field_to_front'
          : 'move_field_to_back';
      findings.push({
        id: `direction-face-${field.fieldKey}`,
        severity: field.role === 'primary_payload' ? 'warning' : 'suggestion',
        title: `${field.label}: ${getPlacementLabel(field.currentFace)} vs ${getPlacementLabel(field.recommendedFace)}`,
        description: `${field.rationale} Recomendacion deck-wide: ${getPlacementLabel(field.recommendedFace)}.`,
        face: field.currentFace === 'hidden' ? undefined : field.currentFace,
        fieldKey: field.fieldKey,
        actionId,
      });
    }
  });

  if (!pages) return findings;

  const visibleFields = direction.fields.filter(field => field.currentFace !== 'hidden');
  const primary = visibleFields.find(field => field.fieldKey === direction.primaryFieldKey);
  if (!primary || primary.currentFace === 'hidden') return findings;

  const primaryFace = primary.currentFace;
  const primarySchema = getSchemaForField(pages, primary.fieldKey, primaryFace);
  const primaryFontSize = primarySchema ? getNumber(getSchemaValue(primarySchema, 'fontSize')) : null;
  if (!primarySchema || primaryFontSize === null) return findings;

  visibleFields
    .filter(field => field.fieldKey !== primary.fieldKey && field.role !== 'identity')
    .forEach(field => {
      const schema = getSchemaForField(pages, field.fieldKey, field.currentFace);
      const fontSize = schema ? getNumber(getSchemaValue(schema, 'fontSize')) : null;
      if (fontSize !== null && fontSize > primaryFontSize + 1) {
        findings.push({
          id: `direction-scale-${primary.fieldKey}-${field.fieldKey}`,
          severity: 'warning',
          title: `${FIELD_LABELS[primary.fieldKey]} no domina la jerarquia`,
          description: `${FIELD_LABELS[field.fieldKey]} aparece con mayor escala que el payload principal. ${primary.rationale}`,
          face: primaryFace,
          fieldKey: primary.fieldKey,
          actionId: 'run_auto_layout',
        });
      }
    });

  const primaryColor = primarySchema ? getSchemaValue(primarySchema, 'fontColor') : undefined;
  if (typeof primaryColor === 'string' && isLowContrastColor(primaryColor)) {
    findings.push({
      id: `direction-color-${primary.fieldKey}`,
      severity: 'warning',
      title: `${FIELD_LABELS[primary.fieldKey]} con color poco dominante`,
      description: 'El campo principal deberia usar el color de texto de mayor contraste en el dorso.',
      face: primaryFace,
      fieldKey: primary.fieldKey,
      actionId: 'run_auto_layout',
    });
  }

  return findings;
}

export function selectRepresentativeCardSamples({
  deck,
  activeCardIndex,
}: {
  deck: DeckSchema;
  activeCardIndex: number;
}): RepresentativeCardSample[] {
  const samples: RepresentativeCardSample[] = [];

  function addSample(sample: RepresentativeCardSample): void {
    if (samples.some(existing => existing.cardId === sample.cardId && existing.reason === sample.reason)) return;
    samples.push(sample);
  }

  const activeCard = deck.cards[activeCardIndex];
  if (activeCard) {
    addSample({
      id: `active-${activeCard.id}`,
      cardId: activeCard.id,
      cardIndex: activeCardIndex,
      label: `Carta ${formatCardNumber(activeCard)}`,
      reason: 'Muestra activa',
      tone: 'suggestion',
    });
  }

  const longest = deck.cards
    .map((card, cardIndex) => ({ card, cardIndex, length: getBackTextLength(card) }))
    .sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > 0) {
    addSample({
      id: `longest-${longest.card.id}`,
      cardId: longest.card.id,
      cardIndex: longest.cardIndex,
      label: `Carta ${formatCardNumber(longest.card)}`,
      reason: 'Texto mas largo',
      tone: 'warning',
    });
  }

  const missingContent = deck.cards.findIndex(card => !getCardPublicationReadiness(deck, card).hasCompleteContent);
  if (missingContent >= 0) {
    const card = deck.cards[missingContent];
    if (card) {
      addSample({
        id: `missing-content-${card.id}`,
        cardId: card.id,
        cardIndex: missingContent,
        label: `Carta ${formatCardNumber(card)}`,
        reason: 'Contenido incompleto',
        tone: 'blocker',
      });
    }
  }

  const missingFrontArt = deck.cards.findIndex(card => !hasText(card.front.art_url));
  if (missingFrontArt >= 0) {
    const card = deck.cards[missingFrontArt];
    if (card) {
      addSample({
        id: `missing-front-${card.id}`,
        cardId: card.id,
        cardIndex: missingFrontArt,
        label: `Carta ${formatCardNumber(card)}`,
        reason: 'Falta arte frontal',
        tone: 'blocker',
      });
    }
  }

  const missingBackImage = deck.cards.findIndex(card => !hasText(card.back.back_image_url));
  if (missingBackImage >= 0) {
    const card = deck.cards[missingBackImage];
    if (card) {
      addSample({
        id: `missing-back-${card.id}`,
        cardId: card.id,
        cardIndex: missingBackImage,
        label: `Carta ${formatCardNumber(card)}`,
        reason: 'Sin reverso IA',
        tone: 'warning',
      });
    }
  }

  return samples.slice(0, 6);
}

function auditTemplate({
  template,
  deck,
  fieldPlacements,
  hiddenFields,
  cardWidth,
  cardHeight,
}: {
  template: Template;
  deck: DeckSchema;
  fieldPlacements: FieldPlacementMap;
  hiddenFields: Record<string, boolean>;
  cardWidth: number;
  cardHeight: number;
}): DesignAuditFinding[] {
  const findings: DesignAuditFinding[] = [];
  const pages = getTemplatePages(template);

  CARD_FIELD_KEYS.forEach(fieldKey => {
    const placement = fieldPlacements[fieldKey];
    const hidden = placement === 'hidden' || hiddenFields[fieldKey] || (fieldKey === 'when_to_use' && hiddenFields.whenToUse);
    if (hidden) return;

    const schema = getSchemaForField(pages, fieldKey, placement);
    const label = FIELD_LABELS[fieldKey];

    if (!schema) {
      findings.push({
        id: `schema-missing-${fieldKey}`,
        severity: fieldKey === 'qr' || fieldKey === 'brand' ? 'suggestion' : 'warning',
        title: `${label} sin caja en el layout`,
        description: `El campo esta marcado para ${getPlacementLabel(placement)}, pero no aparece en la plantilla.`,
        face: placement,
        fieldKey,
        actionId: placement === 'back' ? 'run_auto_layout' : undefined,
      });
      return;
    }

    const bounds = getSchemaBounds(schema);
    if (bounds && isOutsideCard(bounds, cardWidth, cardHeight)) {
      findings.push({
        id: `schema-outside-${fieldKey}`,
        severity: 'blocker',
        title: `${label} fuera del area de carta`,
        description: 'La caja sale del area renderizable y puede cortarse en PDF o preview.',
        face: placement,
        fieldKey,
        actionId: 'run_auto_layout',
      });
    } else if (bounds && isNearSafeEdge(bounds, cardWidth, cardHeight)) {
      findings.push({
        id: `schema-safe-margin-${fieldKey}`,
        severity: 'warning',
        title: `${label} cerca del margen`,
        description: 'El campo queda cerca del borde seguro de impresion; conviene revisarlo antes de exportar.',
        face: placement,
        fieldKey,
        actionId: 'run_auto_layout',
      });
    }

    if (fieldKey === 'qr') {
      const hasAnyQr = deck.cards.some(card => hasText(card.back.qr_url));
      if (!hasAnyQr) {
        findings.push({
          id: 'qr-visible-without-content',
          severity: 'suggestion',
          title: 'QR visible sin contenido',
          description: 'Ninguna carta tiene URL de QR; ocultarlo simplifica el dorso y evita ruido visual.',
          face: placement,
          fieldKey,
          actionId: 'hide_field',
        });
      } else if (bounds && Math.min(bounds.width, bounds.height) < 7) {
        findings.push({
          id: 'qr-too-small',
          severity: 'warning',
          title: 'QR demasiado chico',
          description: 'El QR puede perder legibilidad impresa si baja de 7mm.',
          face: placement,
          fieldKey,
          actionId: 'run_auto_layout',
        });
      }
    }

    const overflow = getOverflowCandidate(deck, fieldKey, schema);
    if (overflow) {
      findings.push({
        id: `overflow-${fieldKey}-${overflow.card.id}`,
        severity: 'warning',
        title: `${label} con riesgo de desborde`,
        description: `La carta ${formatCardNumber(overflow.card)} tiene ${overflow.length} caracteres para una caja estimada en ${overflow.limit}.`,
        face: placement,
        fieldKey,
        cardId: overflow.card.id,
        cardIndex: overflow.cardIndex,
        actionId: 'run_auto_layout',
      });
    }

    const longestText = getLongestFieldText(deck, fieldKey);
    const fontSize = getEffectiveReadableFontSize(schema, longestText);
    const minimumFontSize = MIN_READABLE_FONT_SIZE_BY_FIELD[fieldKey];
    if (fontSize !== null && minimumFontSize !== undefined && fontSize < minimumFontSize) {
      findings.push({
        id: `tiny-font-${fieldKey}`,
        severity: 'warning',
        title: `${label} con fuente muy chica`,
        description: `El campo puede caer a ${fontSize}pt con el texto mas largo; para lectura humana conviene sostener al menos ${minimumFontSize}pt o darle mas area.`,
        face: placement,
        fieldKey,
        actionId: 'run_auto_layout',
      });
    }

    const fontWeight = getFontWeightNumber(getSchemaValue(schema, 'fontWeight'));
    if (
      fontSize !== null &&
      fontWeight !== null &&
      fontWeight < getMinimumReadableWeight(fieldKey) &&
      fieldKey !== 'brand' &&
      fieldKey !== 'qr'
    ) {
      findings.push({
        id: `weak-font-weight-${fieldKey}`,
        severity: 'warning',
        title: `${label} con peso tipografico debil`,
        description: `El campo usa peso ${fontWeight}. Sobre fondos con textura o lineas finas, la lectura humana necesita mas peso visual.`,
        face: placement,
        fieldKey,
        actionId: 'run_auto_layout',
      });
    }
  });

  findings.push(...auditGenericTextContainers(pages[1], cardWidth, cardHeight));

  const importantBackFields: CardFieldPlacementKey[] = ['phrase', 'instruction'];
  importantBackFields.forEach(fieldKey => {
    if (fieldPlacements[fieldKey] !== 'back') {
      findings.push({
        id: `important-field-not-back-${fieldKey}`,
        severity: 'warning',
        title: `${FIELD_LABELS[fieldKey]} fuera del dorso`,
        description: 'Los mazos jugables necesitan que el payload principal sea visible en el dorso.',
        fieldKey,
        actionId: 'move_field_to_back',
      });
    }
  });

  return findings;
}

function auditGenericTextContainers(
  backSchemas: Schema[],
  cardWidth: number,
  cardHeight: number,
): DesignAuditFinding[] {
  const genericBands = backSchemas.filter(schema => isGenericOpaqueTextBand(schema, cardWidth, cardHeight));
  if (genericBands.length < 2) return [];

  return [{
    id: 'generic-opaque-text-bands',
    severity: 'warning',
    title: 'Dorso con bandas rectangulares genericas',
    description: 'El layout depende de varios fondos opacos apilados para leer el texto. Conviene recalcular texto/contraste o generar un fondo con zonas mas limpias.',
    face: 'back',
    actionId: 'run_auto_layout',
  }];
}

function isGenericOpaqueTextBand(
  schema: Schema,
  cardWidth: number,
  cardHeight: number,
): boolean {
  const name = getSchemaName(schema);
  if (!name?.endsWith('_container_bg')) return false;
  if (getSchemaValue(schema, 'type') !== 'svg') return false;

  const bounds = getSchemaBounds(schema);
  if (!bounds) return false;
  const spansLikeBand = bounds.width >= cardWidth * 0.52 && bounds.height <= cardHeight * 0.28;
  if (!spansLikeBand) return false;

  const content = getSchemaValue(schema, 'content');
  if (typeof content !== 'string') return false;
  const lower = content.toLowerCase();
  const isMostlyRect = lower.includes('<rect') && !/<(path|circle|ellipse|polygon|lineargradient|radialgradient)\b/.test(lower);
  const hasOpaqueFill = /rgba\([^)]*,\s*(0\.[3-9]|1(?:\.0+)?)\)/.test(lower) || /opacity="0\.[4-9]/.test(lower);

  return isMostlyRect && hasOpaqueFill;
}

function buildRecommendations(
  findings: DesignAuditFinding[],
  fieldPlacements: FieldPlacementMap,
): DesignRecommendation[] {
  const recommendations: DesignRecommendation[] = [];

  function addRecommendation(recommendation: DesignRecommendation): void {
    if (recommendations.some(existing => existing.id === recommendation.id)) return;
    recommendations.push(recommendation);
  }

  const autoLayoutFindings = findings.filter(finding => finding.actionId === 'run_auto_layout');
  if (autoLayoutFindings.length > 0) {
    addRecommendation({
      id: 'run-auto-layout',
      title: 'Recalcular auto-layout',
      description: 'Usar la lectura del fondo activo y el contenido real para proponer una distribucion mas limpia.',
      impact: `${autoLayoutFindings.length} problemas de cajas, margenes o desborde pueden mejorar.`,
      actionId: 'run_auto_layout',
      sourceFindingIds: autoLayoutFindings.map(finding => finding.id),
    });
  }

  const saveVersionFindings = findings.filter(finding => finding.actionId === 'save_layout_version');
  if (saveVersionFindings.length > 0) {
    addRecommendation({
      id: 'save-layout-version',
      title: 'Guardar version antes de cambiar',
      description: 'Crear una version del layout actual para comparar o volver atras.',
      impact: 'Reduce riesgo antes de aplicar cambios globales.',
      actionId: 'save_layout_version',
      sourceFindingIds: saveVersionFindings.map(finding => finding.id),
    });
  }

  const hideFieldFindings = findings.filter(finding => finding.actionId === 'hide_field' && finding.fieldKey);
  hideFieldFindings.forEach(finding => {
    if (!finding.fieldKey) return;
    addRecommendation({
      id: `hide-${finding.fieldKey}`,
      title: `Ocultar ${FIELD_LABELS[finding.fieldKey]}`,
      description: finding.description,
      impact: 'Simplifica el layout sin borrar el contenido del mazo.',
      actionId: 'hide_field',
      fieldKey: finding.fieldKey,
      sourceFindingIds: [finding.id],
    });
  });

  const moveFrontFindings = findings.filter(finding => finding.actionId === 'move_field_to_front' && finding.fieldKey);
  moveFrontFindings.forEach(finding => {
    if (!finding.fieldKey || fieldPlacements[finding.fieldKey] === 'front') return;
    addRecommendation({
      id: `move-${finding.fieldKey}-front`,
      title: `Mover ${FIELD_LABELS[finding.fieldKey]} al frente`,
      description: finding.description,
      impact: 'Alinea la identidad visual del frente en todo el mazo.',
      actionId: 'move_field_to_front',
      fieldKey: finding.fieldKey,
      sourceFindingIds: [finding.id],
    });
  });

  const moveBackFindings = findings.filter(finding => finding.actionId === 'move_field_to_back' && finding.fieldKey);
  moveBackFindings.forEach(finding => {
    if (!finding.fieldKey || fieldPlacements[finding.fieldKey] === 'back') return;
    addRecommendation({
      id: `move-${finding.fieldKey}-back`,
      title: `Mover ${FIELD_LABELS[finding.fieldKey]} al dorso`,
      description: finding.description,
      impact: 'Mejora jerarquia jugable y mantiene frente/dorso consistentes.',
      actionId: 'move_field_to_back',
      fieldKey: finding.fieldKey,
      sourceFindingIds: [finding.id],
    });
  });

  const cardReviewFindings = findings.filter(finding => finding.actionId === 'review_card' && typeof finding.cardIndex === 'number');
  const firstCardReview = cardReviewFindings[0];
  if (firstCardReview && typeof firstCardReview.cardIndex === 'number') {
    addRecommendation({
      id: 'review-risk-card',
      title: 'Revisar carta con riesgo',
      description: firstCardReview.description,
      impact: 'Lleva la muestra a una carta que explica el bloqueo.',
      actionId: 'review_card',
      cardIndex: firstCardReview.cardIndex,
      sourceFindingIds: [firstCardReview.id],
    });
  }

  const backgroundFindings = findings.filter(finding => finding.actionId === 'open_background_tools');
  if (backgroundFindings.length > 0) {
    addRecommendation({
      id: 'open-background-tools',
      title: 'Revisar fondo AI',
      description: 'Abrir las herramientas de fondo para generar o elegir un background antes de auditar fino.',
      impact: 'Mejora la confianza de lectura porque el layout se prueba contra arte real.',
      actionId: 'open_background_tools',
      sourceFindingIds: backgroundFindings.map(finding => finding.id),
    });
  }

  return recommendations;
}

function countFindings(findings: DesignAuditFinding[]): Record<DesignAuditSeverity, number> {
  return {
    blocker: findings.filter(finding => finding.severity === 'blocker').length,
    warning: findings.filter(finding => finding.severity === 'warning').length,
    suggestion: findings.filter(finding => finding.severity === 'suggestion').length,
  };
}

function getNextAction(counts: Record<DesignAuditSeverity, number>, recommendationCount: number): string {
  if (counts.blocker > 0) return 'Resolver bloqueos antes de publicar o exportar.';
  if (recommendationCount > 0) return 'Revisar recomendaciones y aplicar solo las que convengan.';
  if (counts.warning > 0) return 'Revisar alertas de lectura antes de guardar version final.';
  return 'Guardar version y continuar a Publicar / PDF.';
}

function getTemplatePages(template: Template): [Schema[], Schema[]] {
  return [
    Array.isArray(template.schemas?.[0]) ? template.schemas[0] : [],
    Array.isArray(template.schemas?.[1]) ? template.schemas[1] : [],
  ];
}

function getSchemaForField(
  pages: [Schema[], Schema[]],
  fieldKey: CardFieldPlacementKey,
  placement: CardFieldPlacement,
): Schema | undefined {
  if (placement === 'hidden') return undefined;
  const page = pages[placement === 'front' ? 0 : 1];
  return page.find(schema => getSchemaName(schema) === fieldKey);
}

function getSchemaName(schema: Schema): string | undefined {
  const value = getSchemaValue(schema, 'name');
  return typeof value === 'string' ? value : undefined;
}

interface SchemaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getSchemaBounds(schema: Schema): SchemaBounds | null {
  const position = getSchemaValue(schema, 'position');
  if (!isRecord(position)) return null;

  const x = getNumber(position.x);
  const y = getNumber(position.y);
  const width = getNumber(getSchemaValue(schema, 'width'));
  const height = getNumber(getSchemaValue(schema, 'height'));

  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

function getSchemaValue(schema: Schema, key: string): unknown {
  return isRecord(schema) ? schema[key] : undefined;
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isOutsideCard(bounds: SchemaBounds, cardWidth: number, cardHeight: number): boolean {
  return bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > cardWidth ||
    bounds.y + bounds.height > cardHeight;
}

function isNearSafeEdge(bounds: SchemaBounds, cardWidth: number, cardHeight: number): boolean {
  const safeMargin = 3;
  return bounds.x < safeMargin ||
    bounds.y < safeMargin ||
    bounds.x + bounds.width > cardWidth - safeMargin ||
    bounds.y + bounds.height > cardHeight - safeMargin;
}

function getOverflowCandidate(
  deck: DeckSchema,
  fieldKey: CardFieldPlacementKey,
  schema: Schema,
): { card: Card; cardIndex: number; length: number; limit: number } | null {
  if (fieldKey === 'qr') return null;

  const limit = estimateFieldLimit(fieldKey, schema);
  const candidates = deck.cards
    .map((card, cardIndex) => ({
      card,
      cardIndex,
      length: getCardFieldText(card, deck.name, fieldKey).length,
    }))
    .sort((a, b) => b.length - a.length);

  const candidate = candidates[0];
  if (!candidate || candidate.length <= limit) return null;
  return { ...candidate, limit };
}

function estimateFieldLimit(fieldKey: CardFieldPlacementKey, schema: Schema): number {
  const defaultLimit = FIELD_LENGTH_LIMITS[fieldKey];
  const bounds = getSchemaBounds(schema);
  const fontSize = getNumber(getSchemaValue(schema, 'fontSize')) ?? 9;
  if (!bounds || fontSize <= 0) return defaultLimit;

  const boxCapacity = Math.max(18, Math.floor((bounds.width * bounds.height) / (fontSize * 0.18)));
  return Math.min(defaultLimit, boxCapacity);
}

function getEffectiveReadableFontSize(schema: Schema, text: string): number | null {
  const maxFontSize = getNumber(getSchemaValue(schema, 'fontSize')) ?? getDynamicFontSizeLimit(schema, 'max') ?? null;
  if (maxFontSize === null) return null;

  const minFontSize = getDynamicFontSizeLimit(schema, 'min') ?? Math.max(3, maxFontSize * 0.5);
  const fit = getDynamicFontSizeFit(schema);
  if (fit !== 'vertical' || text.trim().length === 0) return roundToTenth(maxFontSize);

  const bounds = getSchemaBounds(schema);
  if (!bounds) return roundToTenth(maxFontSize);

  const lineHeight = getNumber(getSchemaValue(schema, 'lineHeight')) ?? 1.15;
  let low = Math.min(minFontSize, maxFontSize);
  let high = maxFontSize;

  for (let i = 0; i < 14; i += 1) {
    const mid = (low + high) / 2;
    if (doesTextFitSchemaBox(text, mid, lineHeight, bounds, getSchemaValue(schema, 'fontWeight'))) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return roundToTenth(low);
}

function getDynamicFontSizeLimit(schema: Schema, key: 'min' | 'max'): number | null {
  const dynamicFontSize = getSchemaValue(schema, 'dynamicFontSize');
  if (!isRecord(dynamicFontSize)) return null;
  return getNumber(dynamicFontSize[key]);
}

function getDynamicFontSizeFit(schema: Schema): string | null {
  const dynamicFontSize = getSchemaValue(schema, 'dynamicFontSize');
  if (!isRecord(dynamicFontSize)) return null;
  return typeof dynamicFontSize.fit === 'string' ? dynamicFontSize.fit : null;
}

function doesTextFitSchemaBox(
  text: string,
  fontSize: number,
  lineHeight: number,
  bounds: SchemaBounds,
  fontWeight: unknown,
): boolean {
  const charWidthMm = Math.max(0.9, fontSize * PT_TO_MM * getAverageCharWidthFactor(fontWeight));
  const charsPerLine = Math.max(4, Math.floor(bounds.width / charWidthMm));
  const lineCount = Math.max(1, Math.ceil(text.replace(/\s+/g, ' ').trim().length / charsPerLine));
  const estimatedHeightMm = lineCount * fontSize * PT_TO_MM * lineHeight;
  return estimatedHeightMm <= bounds.height * 0.9;
}

function getAverageCharWidthFactor(fontWeight: unknown): number {
  const numeric = getFontWeightNumber(fontWeight);
  if (numeric !== null && numeric >= 700) return 0.54;
  if (numeric !== null && numeric <= 400) return 0.48;
  return 0.51;
}

function getFontWeightNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'bold') return 700;
  if (value === 'regular') return 500;
  if (value === 'thin') return 300;
  return null;
}

function getMinimumReadableWeight(fieldKey: CardFieldPlacementKey): number {
  if (fieldKey === 'phrase' || fieldKey === 'instruction') return 650;
  if (fieldKey === 'when_to_use' || fieldKey === 'answer') return 600;
  return 500;
}

function getLongestFieldText(deck: DeckSchema, fieldKey: CardFieldPlacementKey): string {
  return deck.cards
    .map(card => getCardFieldText(card, deck.name, fieldKey))
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function getBackTextLength(card: Card): number {
  return [
    card.back.when_to_use,
    card.back.phrase,
    card.back.instruction,
    card.back.answer,
    card.back.fun_fact,
  ].filter(hasText).join(' ').length;
}

function getPlacementLabel(placement: CardFieldPlacement): string {
  switch (placement) {
    case 'front':
      return 'el frente';
    case 'back':
      return 'el dorso';
    case 'hidden':
      return 'oculto';
  }
}

function getCurrentFace(
  fieldKey: CardFieldPlacementKey,
  fieldPlacements: FieldPlacementMap,
  hiddenFields: Record<string, boolean>,
): CardFieldPlacement {
  if (fieldPlacements[fieldKey] === 'hidden' || hiddenFields[fieldKey] || (fieldKey === 'when_to_use' && hiddenFields.whenToUse)) {
    return 'hidden';
  }

  return fieldPlacements[fieldKey];
}

function inferDesignDeckMode(deck: DeckSchema): DesignDeckMode {
  const category = deck.digital?.category;
  if (category === 'introspection' || category === 'emotional-regulation') {
    return 'introspection';
  }

  const text = [
    deck.slug,
    deck.edition,
    deck.name,
    deck.description,
    deck.metadata?.topic,
    deck.metadata?.tone,
    deck.digital?.catalog?.category,
    deck.digital?.catalog?.collection,
  ].filter(hasText).join(' ').toLowerCase();

  if (
    text.includes('introspe') ||
    text.includes('autoconocimiento') ||
    text.includes('emocional') ||
    text.includes('regulacion') ||
    text.includes('regulación') ||
    text.includes('ansiedad') ||
    text.includes('grounding') ||
    text.includes('cable a tierra')
  ) {
    return 'introspection';
  }

  return 'action';
}

function isLowContrastColor(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent') return true;
  if (!normalized.startsWith('#')) return false;

  const hex = normalized.length === 4
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;
  if (!/^#[0-9a-f]{6}$/.test(hex)) return false;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.42 && luminance < 0.68;
}

function formatCardNumber(card: Card): string {
  return `#${String(card.front.number).padStart(2, '0')}`;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
