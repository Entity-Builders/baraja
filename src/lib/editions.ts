// ─── Baraja Edition Config ────────────────────────────────────────────────────
// Single source of truth for per-edition visual config, card schema and sample data.
// Used by: AdminFrameGenerator, DeckSettingsModal, CardCanvas (via deck.slug lookup).
//
// Adding a new edition:
//   1. Add an entry here with all required fields.
//   2. Set qrFgColor if the background is dark and gold won't read well.
//   3. Populate sampleCard with realistic content + a real QR URL.

export interface DeckField {
  key: string;
  label: string;
  description: string;
  typicalLength: 'short' | 'medium' | 'long';
  required: boolean;
}

export interface DeckEdition {
  id: string;
  /** slug(s) in the deck-engine that belong to this edition */
  deckEngineIds?: string[];
  label: string;
  emoji: string;
  description: string;
  /** Pure visual/aesthetic keywords for AI image generation — NO content words */
  visualMood: string;
  fields: DeckField[];
  /** Representative card content used for TemplateDesigner preview and AI frame generation */
  sampleCard: Record<string, string>;
}

export const DECK_EDITIONS: DeckEdition[] = [
  {
    id: 'barometro',
    deckEngineIds: ['barometro', 'cable-a-tierra'],
    label: 'Barómetro',
    emoji: '🧠',
    description: 'Cartas terapéuticas / regulación emocional. Frase de impacto + técnica corporal.',
    visualMood: 'calm therapeutic wellness, soft warm gradients, gentle aurora light, serene teal and amber tones, smooth organic curves, zen garden aesthetic, minimal and soothing',
    fields: [
      { key: 'when_to_use', label: 'cuando usarla (header)', description: 'Contexto o situación emocional. Corto, mayúsculas.', typicalLength: 'short', required: true },
      { key: 'phrase',      label: 'frase de anclaje',      description: 'Una frase poderosa y concisa. Puede tener protagonismo en mazos de regulación.', typicalLength: 'medium', required: true },
      { key: 'instruction', label: 'instrucción / técnica', description: 'Pasos de la técnica corporal o ejercicio regulatorio.', typicalLength: 'long', required: true },
      { key: 'answer',      label: 'respuesta (opcional)', description: 'Raramente usada en esta edición.', typicalLength: 'short', required: false },
    ],
    sampleCard: {
      when_to_use: 'PARA CUANDO LA EMOCIÓN ES UN INCENDIO Y NO PODÉS PENSAR.',
      phrase: 'Tu sistema nervioso no discute con la temperatura.',
      instruction: 'Sostené un hielo en la mano hasta que sea muy intenso. O llená un bol con agua fría y hielo y sumergí la cara por 15 segundos. Sentí el cambio. Respirá.',
      answer: '',
      qr: 'https://baraja.cards/c/barometro/01',
      brand: 'Baraja · Barómetro',
    },
  },
  {
    id: 'trivia',
    deckEngineIds: ['trivia-sobre-cine-argentino', 'trivia-sobre-peliculas-de-comedia-romantica'],
    label: 'Trivia',
    emoji: '🎯',
    description: 'Preguntas y respuestas. Header de categoría, hook breve, pregunta principal y respuesta.',
    visualMood: 'bold quiz energy, electric blue and gold accents, sharp geometric shapes, clean modern graphic design, knowledge competition vibes, bright accent highlights, crisp minimal layout',
    fields: [
      { key: 'when_to_use', label: 'categoría (header)',    description: 'Categoría de la pregunta. Ej: HISTORIA, CIENCIA, POP.', typicalLength: 'short', required: true },
      { key: 'phrase',      label: 'gancho / clima',       description: 'Frase breve que prepara la pregunta sin revelar la respuesta.', typicalLength: 'short', required: true },
      { key: 'instruction', label: 'pregunta principal',   description: 'La pregunta que el jugador debe responder. Es el payload jugable.', typicalLength: 'medium', required: true },
      { key: 'answer',      label: 'respuesta',            description: 'La respuesta, generalmente en la parte inferior. Puede estar oculta.', typicalLength: 'short', required: true },
    ],
    sampleCard: {
      when_to_use: 'HISTORIA ARGENTINA',
      phrase: 'Una fecha que cambió todo.',
      instruction: '¿En qué año se declaró la independencia argentina?',
      answer: 'Rta: 9 de Julio de 1816.',
      qr: 'https://baraja.cards/c/trivia-sobre-cine-argentino/01',
      brand: 'Baraja · Trivia',
    },
  },
  {
    id: 'juegos',
    deckEngineIds: ['mazo-para-romper-el-hielo-en-la-primera-cita'],
    label: 'Juegos / Dinámicas',
    emoji: '🎲',
    description: 'Dinámicas de grupo, juegos sociales, retos y actividades.',
    visualMood: 'playful colorful energy, vibrant rainbow accents, fun pop-art style, bouncy rounded shapes, modern illustration, bright cheerful palette, clean flat design',
    fields: [
      { key: 'when_to_use', label: 'contexto / rango etario', description: 'Para quién o cuándo se usa. Ej: PARA ROMPER EL HIELO.', typicalLength: 'short', required: true },
      { key: 'phrase',      label: 'gancho / título breve',    description: 'Nombre o clima del reto. Secundario frente a las reglas.', typicalLength: 'short', required: true },
      { key: 'instruction', label: 'reglas / acción principal', description: 'Cómo se juega o qué debe hacer el jugador. Es el payload jugable.', typicalLength: 'long', required: true },
      { key: 'answer',      label: 'variante / puntos',        description: 'Variante del juego o sistema de puntuación.', typicalLength: 'short', required: false },
    ],
    sampleCard: {
      when_to_use: 'PARA ROMPER EL HIELO. 4+ JUGADORES.',
      phrase: '¿Quién soy?',
      instruction: 'Cada jugador escribe en un papel el nombre de un personaje famoso y lo pega en la frente del compañero de la derecha. Hacé preguntas de sí/no para adivinar quién sos. El que adivina primero gana.',
      answer: 'Variante: el que pierde hace una verdad o reto.',
      qr: 'https://baraja.cards/c/mazo-para-romper-el-hielo-en-la-primera-cita/01',
      brand: 'Baraja · ¿Quién soy?',
    },
  },
  {
    id: 'rompelo',
    deckEngineIds: ['juego-de-cartas-para-jugar-entre-amigos-en-una-juntada', 'mazo-sobre-futbol-de-argentina'],
    label: 'Rompelo',
    emoji: '🧨',
    description: 'Humor y situaciones incómodas / financieras. Frase irónica + historia corta a contar.',
    visualMood: 'bold vibrant party energy, hot pink and electric purple gradients, fun and irreverent pop style, modern graphic design, playful bold shapes, bright saturated colors',
    fields: [
      { key: 'when_to_use', label: 'contexto del error',   description: 'La categoría del momento vergonzoso. Ej: ERRORES FINANCIEROS.', typicalLength: 'short', required: true },
      { key: 'phrase',      label: 'gancho irónico',       description: 'Frase breve o golpe de humor. Acompaña la mecánica, no la reemplaza.', typicalLength: 'medium', required: true },
      { key: 'instruction', label: 'mecánica principal',   description: 'Lo que el jugador debe hacer o contar. Es el payload jugable.', typicalLength: 'long', required: true },
      { key: 'answer',      label: 'penalidad / premio',   description: 'Consecuencia del reto.', typicalLength: 'short', required: false },
    ],
    sampleCard: {
      when_to_use: 'PARA ESTIRAR LA IMAGINACIÓN.',
      phrase: 'La alta cocina se atreve a todo. Vos también.',
      instruction: 'Inventá un menú de tres pasos (entrada, plato principal, postre) usando las combinaciones de comida más asquerosas que se te ocurran. Tenés que describirlo con lenguaje de chef profesional.',
      answer: '',
      qr: 'https://baraja.cards/c/juego-de-cartas-para-jugar-entre-amigos-en-una-juntada/01',
      brand: 'Baraja · Rompelo',
    },
  },
  {
    id: 'custom',
    label: 'Edición personalizada',
    emoji: '✍️',
    description: 'Completá los campos manualmente para tu edición.',
    visualMood: 'elegant minimalist, clean background, subtle accents, modern and refined, simple geometric layout, premium packaging feel',
    fields: [
      { key: 'when_to_use', label: 'campo 1 (header)',   description: 'Texto corto de cabecera.', typicalLength: 'short', required: false },
      { key: 'phrase',      label: 'campo 2 (hook)',      description: 'Gancho editorial breve o clima de la carta.', typicalLength: 'medium', required: true },
      { key: 'instruction', label: 'campo 3 (acción)',    description: 'Instrucción, pregunta o contenido principal de uso.', typicalLength: 'long', required: false },
      { key: 'answer',      label: 'campo 4 (pie)',      description: 'Texto de pie de carta.', typicalLength: 'short', required: false },
    ],
    sampleCard: {
      when_to_use: '',
      phrase: '',
      instruction: '',
      answer: '',
      qr: 'https://baraja.cards',
      brand: 'Baraja',
    },
  },
];

/**
 * Finds the DeckEdition config for a given deck slug.
 * Checks deckEngineIds first, then falls back to id match.
 */
export function getEditionBySlug(slug: string): DeckEdition | undefined {
  return DECK_EDITIONS.find(
    e => e.deckEngineIds?.includes(slug) || e.id === slug
  );
}
