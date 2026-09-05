import assert from 'node:assert/strict';
import type { DeckSchema } from '@entity-builders/deck-engine';
import type { Template } from '@pdfme/common';
import {
  buildDeckDesignAudit,
  buildDeckDesignPipelineState,
  buildDesignDirectionPlan,
  selectRepresentativeCardSamples,
} from '../src/lib/deckDesignPipeline';
import {
  applyFieldPlacementsToTemplate,
  normalizeFieldPlacements,
} from '../src/lib/cardFieldPlacements';
import { resolveReadableSchemaColorOverrides } from '../src/lib/cardReadability';
import { fitTypographyHintsToContent, mergeLongestTextByField } from '../src/lib/typographyFit';
import { getTemplateForDeck } from '../src/lib/pdfmeConfig';
import {
  getDeckReverseModel,
  shouldUseLegacyFullBackTemplate,
} from '../src/lib/reverseModel';

const baseDeck: DeckSchema = {
  id: 'test-deck',
  edition: 'test-edition',
  name: 'Test Deck',
  slug: 'test-deck',
  description: 'A test deck',
  language: 'es',
  card_count: 3,
  metadata: {
    topic: 'Testing',
    tone: 'Clear',
    target_audience: 'Operators',
    player_count: '1',
  },
  print_specs: {
    paper_weight: '300g',
    finish: 'matte',
    rounded_corners: true,
    dimensions: { width: 70, height: 120, unit: 'mm' },
    bleed: 3,
    color_profile: 'RGB',
  },
  design: {
    template_id: 'default',
    primary_color: '#111111',
    accent_color: '#d4af64',
    font_heading: 'serif',
    font_body: 'sans',
  },
  pricing: { amount: 1000, currency: 'ars' },
  cards: [
    {
      id: 'card-1',
      front: {
        art_prompt: 'art',
        art_url: '/art-1.png',
        title: 'One',
        number: 1,
      },
      back: {
        phrase: 'Short phrase',
        when_to_use: 'Now',
        instruction: 'Do a small thing.',
      },
    },
    {
      id: 'card-2',
      front: {
        art_prompt: 'art',
        title: 'Two',
        number: 2,
      },
      back: {
        phrase: '',
        when_to_use: '',
        instruction: '',
      },
    },
    {
      id: 'card-3',
      front: {
        art_prompt: 'art',
        art_url: '/art-3.png',
        title: 'Three',
        number: 3,
      },
      back: {
        phrase: 'A very long phrase that should be considered risky when the box is tiny.',
        when_to_use: 'When the card needs a stress test.',
        instruction: 'This instruction is intentionally long enough to exercise representative sample selection and approximate overflow logic in the design pipeline audit.',
      },
    },
  ],
};

const template: Template = {
  basePdf: { width: 70, height: 120, padding: [0, 0, 0, 0] },
  schemas: [
    [
      textSchema('number', 4, 4, 14, 7, 8),
      textSchema('title', 18, 105, 34, 8, 8),
    ],
    [
      textSchema('phrase', 8, 10, 54, 8, 12),
      textSchema('when_to_use', 8, 25, 54, 7, 8),
      textSchema('instruction', 8, 37, 20, 8, 8),
      qrSchema('qr', 32, 104, 6),
      textSchema('brand', 15, 113, 40, 5, 5),
    ],
  ],
};

const placements = normalizeFieldPlacements(null);
const misplacedInstructionPlacements = {
  ...placements,
  instruction: 'front',
} as typeof placements;

const samples = selectRepresentativeCardSamples({
  deck: baseDeck,
  activeCardIndex: 0,
});

assert.equal(samples[0]?.reason, 'Muestra activa');
assert.ok(samples.some(sample => sample.reason === 'Texto mas largo'));
assert.ok(samples.some(sample => sample.reason === 'Contenido incompleto'));
assert.ok(samples.some(sample => sample.reason === 'Falta arte frontal'));

const audit = buildDeckDesignAudit({
  deck: baseDeck,
  template,
  fieldPlacements: placements,
  hiddenFields: {},
  activeCardIndex: 0,
  activeFace: 'back',
  cardWidth: 70,
  cardHeight: 120,
  savedConfigCount: 0,
  selectedConfigId: '',
});

assert.ok(audit.findings.some(finding => finding.id === 'publication-front-art'));
assert.ok(audit.findings.some(finding => finding.id === 'qr-visible-without-content'));
assert.ok(audit.findings.some(finding => finding.id.startsWith('overflow-instruction')));
assert.equal(audit.direction.mode, 'action');
assert.equal(audit.direction.primaryFieldKey, 'instruction');
assert.equal(audit.direction.fields.find(field => field.fieldKey === 'instruction')?.recommendedFace, 'back');
assert.ok(audit.recommendations.some(recommendation => recommendation.actionId === 'hide_field'));
assert.ok(audit.recommendations.some(recommendation => recommendation.actionId === 'run_auto_layout'));
assert.ok(audit.recommendations.some(recommendation => recommendation.actionId === 'save_layout_version'));

const misplacedAudit = buildDeckDesignAudit({
  deck: baseDeck,
  template,
  fieldPlacements: misplacedInstructionPlacements,
  hiddenFields: {},
  activeCardIndex: 0,
  activeFace: 'back',
  cardWidth: 70,
  cardHeight: 120,
  savedConfigCount: 1,
  selectedConfigId: '',
});

assert.ok(misplacedAudit.findings.some(finding => finding.id === 'direction-face-instruction'));
assert.ok(misplacedAudit.recommendations.some(recommendation => recommendation.id === 'move-instruction-back'));

const introspectionDeck: DeckSchema = {
  ...baseDeck,
  id: 'introspection-deck',
  slug: 'mazo-de-introspeccion',
  digital: {
    category: 'introspection',
  },
};
const introspectionDirection = buildDesignDirectionPlan({
  deck: introspectionDeck,
  fieldPlacements: placements,
  hiddenFields: {},
});
assert.equal(introspectionDirection.mode, 'introspection');
assert.equal(introspectionDirection.primaryFieldKey, 'phrase');
assert.equal(introspectionDirection.fields.find(field => field.fieldKey === 'phrase')?.scale, 'large');

const pipeline = buildDeckDesignPipelineState({
  deck: baseDeck,
  template,
  fieldPlacements: placements,
  hiddenFields: {},
  activeCardIndex: 0,
  activeFace: 'back',
  cardWidth: 70,
  cardHeight: 120,
  savedConfigCount: 0,
  selectedConfigId: '',
});

assert.equal(pipeline.stages.find(stage => stage.id === 'audit')?.status, 'blocked');
assert.equal(pipeline.stages.find(stage => stage.id === 'proposal')?.status, 'needs_review');

const fittedTypography = fitTypographyHintsToContent({
  phrase: {
    fontSize: 16,
    fontFamily: 'DM Sans',
    fontWeight: '500',
    lineHeight: 1.2,
    color: '#2C3E50',
    topPct: 16,
    heightPct: 8,
    leftPct: 10,
    widthPct: 80,
  },
  instruction: {
    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
    lineHeight: 1.15,
    color: '#2C3E50',
    topPct: 28,
    heightPct: 35,
    leftPct: 10,
    widthPct: 80,
  },
}, {
  cardHeightMm: 120,
  cardWidthMm: 70,
  content: {
    phrase: 'Incluso si borras la memoria, el corazon recuerda.',
    instruction: 'Una pareja decide someterse a un procedimiento medico para borrar todos los recuerdos de su relacion. Como se llama la empresa ficticia que realiza este procedimiento?',
  },
  primaryFieldKey: 'instruction',
});

assert.ok((fittedTypography?.instruction as { fontSize: number }).fontSize < 11);
assert.ok((fittedTypography?.phrase as { fontSize: number }).fontSize <= 15);

const deckWideContent = mergeLongestTextByField([
  { instruction: 'Corta.', phrase: 'Una frase' },
  { instruction: 'Esta instruccion es mucho mas larga y debe gobernar el layout global del mazo.', phrase: 'F' },
], ['instruction', 'phrase']);
assert.equal(deckWideContent.instruction, 'Esta instruccion es mucho mas larga y debe gobernar el layout global del mazo.');
assert.equal(deckWideContent.phrase, 'Una frase');

const backOnlyAutoLayoutContent = mergeLongestTextByField([
  {
    number: '#01',
    title: 'El Hielo',
    brand: 'Baraja · Barometro',
    phrase: 'Frase de dorso',
  },
], ['phrase']);
assert.deepEqual(Object.keys(backOnlyAutoLayoutContent), ['phrase']);

const legacyInsetFrontTemplate: Template = {
  basePdf: { width: 70, height: 120, padding: [0, 0, 0, 0] },
  schemas: [
    [
      rectSchema('legacy_paper', 3, 6, 64, 108),
      imageSchema('art', 10, 20, 50, 76, -4),
      textSchema('number', 4, 4, 20, 8, 12),
      textSchema('title', 4, 106, 62, 8, 11),
    ],
    template.schemas[1],
  ],
};
const normalizedSimpleFront = applyFieldPlacementsToTemplate(
  legacyInsetFrontTemplate,
  placements,
  70,
  120,
);
assert.deepEqual(
  normalizedSimpleFront.schemas[0].map(schema => schema.name),
  ['art', 'number_front_plate', 'title_front_plate', 'number', 'title'],
);
const normalizedFrontArt = normalizedSimpleFront.schemas[0][0];
assert.deepEqual(normalizedFrontArt.position, { x: 0, y: 0 });
assert.equal(normalizedFrontArt.width, 70);
assert.equal(normalizedFrontArt.height, 120);
assert.equal(normalizedFrontArt.rotate, 0);

const frontPayloadPlacements = {
  ...placements,
  phrase: 'front',
  instruction: 'front',
} as typeof placements;
const normalizedPayloadFront = applyFieldPlacementsToTemplate(
  legacyInsetFrontTemplate,
  frontPayloadPlacements,
  70,
  120,
);
const payloadFrontNames = normalizedPayloadFront.schemas[0].map(schema => schema.name);
assert.ok(payloadFrontNames.includes('front_content_panel'));
assert.ok(payloadFrontNames.includes('phrase_front_plate'));
assert.ok(payloadFrontNames.includes('instruction_front_plate'));
assert.ok(payloadFrontNames.includes('phrase'));
assert.ok(payloadFrontNames.includes('instruction'));
assert.ok(!payloadFrontNames.includes('legacy_paper'));

const customFrontTemplate: Template = {
  basePdf: { width: 70, height: 120, padding: [0, 0, 0, 0] },
  schemas: [
    [
      imageSchema('art', 0, 0, 70, 120, 0),
      rectSchema('custom_frame', 4, 4, 62, 112),
      textSchema('number', 4, 4, 20, 8, 12),
      textSchema('title', 4, 106, 62, 8, 11),
    ],
    template.schemas[1],
  ],
};
const preservedCustomFront = applyFieldPlacementsToTemplate(customFrontTemplate, placements, 70, 120);
assert.ok(preservedCustomFront.schemas[0].some(schema => schema.name === 'custom_frame'));
assert.ok(!preservedCustomFront.schemas[0].some(schema => schema.name === 'title_front_plate'));

const manualFullBleedFrontTemplate: Template = {
  basePdf: { width: 70, height: 120, padding: [0, 0, 0, 0] },
  schemas: [
    [
      imageSchema('art', 0, 0, 70, 120, 0),
      textSchema('number', 22, 18, 16, 8, 12),
      textSchema('title', 10, 78, 50, 12, 11),
    ],
    template.schemas[1],
  ],
};
const preservedManualFront = applyFieldPlacementsToTemplate(manualFullBleedFrontTemplate, placements, 70, 120);
assert.ok(!preservedManualFront.schemas[0].some(schema => schema.name === 'title_front_plate'));
assert.deepEqual(
  preservedManualFront.schemas[0].find(schema => schema.name === 'title')?.position,
  { x: 10, y: 78 },
);

const forcedCustomFront = applyFieldPlacementsToTemplate(
  customFrontTemplate,
  placements,
  70,
  120,
  { forceFrontAutoLayout: true },
);
assert.ok(!forcedCustomFront.schemas[0].some(schema => schema.name === 'custom_frame'));
assert.ok(forcedCustomFront.schemas[0].some(schema => schema.name === 'title_front_plate'));

const stackedTypography = fitTypographyHintsToContent({
  when_to_use: { fontSize: 8, topPct: 10, heightPct: 8, leftPct: 10, widthPct: 80 },
  phrase: { fontSize: 15, topPct: 16, heightPct: 8, leftPct: 10, widthPct: 80 },
  instruction: { fontSize: 18, topPct: 20, heightPct: 16, leftPct: 10, widthPct: 72 },
  answer: { fontSize: 12, topPct: 34, heightPct: 6, leftPct: 16, widthPct: 68 },
  fun_fact: { fontSize: 7, topPct: 38, heightPct: 5, leftPct: 16, widthPct: 68 },
}, {
  cardHeightMm: 120,
  cardWidthMm: 70,
  content: {
    when_to_use: 'Despues de una ruptura que queres olvidar.',
    phrase: 'Incluso si borras la memoria, el corazon recuerda.',
    instruction: 'Una pareja decide someterse a un procedimiento medico para borrar todos los recuerdos de su relacion. Como se llama la empresa ficticia que realiza este procedimiento?',
    answer: 'Rta: Lacuna, Inc.',
    fun_fact: 'El titulo de la pelicula, Eternal Sunshine of the Spotless Mind, es una cita de un poema de Alexander Pope.',
  },
  primaryFieldKey: 'instruction',
}) as Record<string, { topPct: number; heightPct: number; fontSize: number }>;

assert.ok(stackedTypography.phrase.topPct + stackedTypography.phrase.heightPct < stackedTypography.instruction.topPct);
assert.ok(stackedTypography.instruction.topPct + stackedTypography.instruction.heightPct < stackedTypography.answer.topPct);
assert.ok(stackedTypography.answer.topPct + stackedTypography.answer.heightPct < stackedTypography.fun_fact.topPct);
assert.ok(stackedTypography.instruction.fontSize < 12);

const unsafeTopTypography = fitTypographyHintsToContent({
  when_to_use: { fontSize: 8, topPct: 2, heightPct: 5, leftPct: 4, widthPct: 92 },
  phrase: { fontSize: 16, topPct: 7, heightPct: 8, leftPct: 5, widthPct: 90 },
}, {
  cardHeightMm: 120,
  cardWidthMm: 70,
  content: {
    when_to_use: 'Para cuando todo esta demasiado cerca del borde.',
    phrase: 'La caja no deberia besar el marco superior.',
  },
  primaryFieldKey: 'phrase',
}) as Record<string, { topPct: number; heightPct: number; widthPct: number; fontSize: number }>;

assert.ok(unsafeTopTypography.when_to_use.topPct >= 12.5);
assert.ok(unsafeTopTypography.phrase.topPct > unsafeTopTypography.when_to_use.topPct + unsafeTopTypography.when_to_use.heightPct);
assert.ok(unsafeTopTypography.phrase.widthPct <= 84);

const explicitColorOverrides = await resolveReadableSchemaColorOverrides([
  {
    name: 'paper',
    type: 'rectangle',
    position: { x: 0, y: 0 },
    width: 70,
    height: 120,
    backgroundColor: '#ffffff',
    rotate: 0,
  } as unknown as Template['schemas'][number][number],
  {
    name: 'phrase',
    type: 'text',
    position: { x: 8, y: 20 },
    width: 54,
    height: 18,
    fontColor: '#ff0000',
    rotate: 0,
  } as unknown as Template['schemas'][number][number],
], {}, { respectExplicitColors: true });
assert.deepEqual(explicitColorOverrides, {});

const flujobDeck: DeckSchema = {
  ...baseDeck,
  cards: baseDeck.cards.map(card => ({
    ...card,
    back: {
      ...card.back,
      back_image_url: `/backs/${card.id}.png`,
    },
  })),
  design: {
    ...baseDeck.design,
    layout_config: template,
  },
};
const flujobTemplate = getTemplateForDeck(flujobDeck);
const flujobModel = getDeckReverseModel(flujobDeck, flujobTemplate);
assert.equal(flujobModel.model, 'legacy-full-back');
assert.equal(flujobModel.fullBackCardCount, flujobDeck.cards.length);
assert.equal(shouldUseLegacyFullBackTemplate(flujobModel), true);
assert.deepEqual(flujobTemplate.schemas[1].map(schema => schema.name), ['back_ai_image', 'qr_overlay']);

const mixedReverseDeck: DeckSchema = {
  ...baseDeck,
  cards: baseDeck.cards.map((card, index) => ({
    ...card,
    back: {
      ...card.back,
      ...(index === 0 ? { back_image_url: `/backs/${card.id}.png` } : {}),
    },
  })),
  design: {
    ...baseDeck.design,
    layout_config: template,
  },
};
const mixedTemplate = getTemplateForDeck(mixedReverseDeck);
const mixedModel = getDeckReverseModel(mixedReverseDeck, mixedTemplate);
assert.equal(mixedModel.model, 'mixed');
assert.equal(shouldUseLegacyFullBackTemplate(mixedModel), true);
assert.deepEqual(mixedTemplate.schemas[1].map(schema => schema.name), ['back_ai_image', 'qr_overlay']);

const migratedEditableDeck: DeckSchema = {
  ...flujobDeck,
  design: {
    ...flujobDeck.design,
    reverse_model: 'editable-layout',
    reverse_migration_status: 'review',
    legacy_full_back_references: flujobDeck.cards.map(card => ({
      card_id: card.id,
      card_number: card.front.number,
      back_image_url: card.back.back_image_url ?? '',
    })),
    layout_config: template,
  },
};
const migratedTemplate = getTemplateForDeck(migratedEditableDeck);
const migratedModel = getDeckReverseModel(migratedEditableDeck, migratedTemplate);
assert.equal(migratedModel.model, 'editable-layout');
assert.equal(shouldUseLegacyFullBackTemplate(migratedModel), false);
assert.ok(migratedTemplate.schemas[1].some(schema => schema.name === 'instruction'));
assert.ok(!migratedTemplate.schemas[1].some(schema => schema.name === 'back_ai_image'));

console.log('deckDesignPipeline tests passed');

function textSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
) {
  return {
    name,
    type: 'text',
    position: { x, y },
    width,
    height,
    fontSize,
  };
}

function qrSchema(name: string, x: number, y: number, size: number) {
  return {
    name,
    type: 'qrcode',
    position: { x, y },
    width: size,
    height: size,
  };
}

function imageSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotate = 0,
) {
  return {
    name,
    type: 'image',
    position: { x, y },
    width,
    height,
    rotate,
  };
}

function rectSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    name,
    type: 'rectangle',
    position: { x, y },
    width,
    height,
    backgroundColor: '#ffffff',
    rotate: 0,
  };
}
