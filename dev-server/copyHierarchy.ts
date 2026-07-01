import { cleanOptionalString, isRecord } from './contentUtils';

const INSTRUCTION_FIRST_FRAME_TYPES = new Set(['trivia', 'party', 'game']);
const INSTRUCTION_FIRST_EDITION_IDS = new Set(['trivia', 'juegos', 'rompelo']);
const INSTRUCTION_FIRST_DIGITAL_CATEGORIES = new Set([
  'conversation',
  'trivia',
  'language-learning',
  'team-building',
  'coaching',
  'creative-prompts',
]);
const INSTRUCTION_FIRST_CATALOG_COLLECTIONS = new Set([
  'social-games',
  'couples-dating',
  'team-tools',
  'trivia-games',
  'learning',
]);

export function shouldPrioritizeInstructionCopy(cardType?: unknown, editionId?: unknown): boolean {
  const safeCardType = cleanOptionalString(cardType);
  const safeEditionId = cleanOptionalString(editionId);

  return Boolean(
    (safeCardType && INSTRUCTION_FIRST_FRAME_TYPES.has(safeCardType)) ||
    (safeEditionId && INSTRUCTION_FIRST_EDITION_IDS.has(safeEditionId)),
  );
}

export function shouldPrioritizeInstructionForRawDeck(deckRaw: unknown): boolean {
  const digital = isRecord(deckRaw) && isRecord(deckRaw.digital) ? deckRaw.digital : undefined;
  const catalog = digital && isRecord(digital.catalog) ? digital.catalog : undefined;
  const category = cleanOptionalString(digital?.category);
  const collection = cleanOptionalString(catalog?.collection);

  return Boolean(
    (category && INSTRUCTION_FIRST_DIGITAL_CATEGORIES.has(category)) ||
    (collection && INSTRUCTION_FIRST_CATALOG_COLLECTIONS.has(collection)),
  );
}

export function buildCopyHierarchyNote(instructionFirst: boolean): string[] {
  if (instructionFirst) {
    return [
      'COPY HIERARCHY:',
      '- PRIMARY FIELD: instruction. It should receive the largest or clearest readable zone.',
      '- SECONDARY FIELD: phrase. Treat it as a short editorial hook, not the main payload.',
      '- when_to_use is a compact header. answer and fun_fact are supporting footer/meta fields.',
    ];
  }

  return [
    'COPY HIERARCHY:',
    '- PRIMARY FIELD: phrase may carry the strongest emotional hook for therapeutic/introspective decks.',
    '- instruction still needs a readable body zone because it tells the user what to do.',
    '- when_to_use is a compact header. answer and fun_fact are supporting footer/meta fields.',
  ];
}
