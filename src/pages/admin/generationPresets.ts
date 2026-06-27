import type {
  DeckCatalogCategoryId,
  DeckCatalogCollectionId,
} from '@eb-packages/deck-engine';
import type { DeckType } from './generationPayload';

export interface GenerationPreset {
  label: string;
  topic: string;
  context: string;
  type: DeckType;
  collection: DeckCatalogCollectionId;
  category: DeckCatalogCategoryId;
  moment: string;
  buyerSentence: string;
  landingPromise: string;
  previewPolicy: string;
  cardCount?: number;
  artStyle?: string;
}

export const GENERATION_PRESETS: GenerationPreset[] = [
  {
    label: '🧠 Introspección',
    topic: 'Mazo de introspección y autoconocimiento',
    context: 'Tono calmo, directo, sin clichés de autoayuda. Para adultos que necesitan parar y pensar.',
    type: 'introspection',
    collection: 'self-work',
    category: 'introspection',
    moment: 'La persona necesita detener ruido mental, nombrar lo que pasa y elegir una acción mínima.',
    buyerSentence: 'Necesito parar y pensar sin que me hablen como si todo estuviera bien.',
    landingPromise: 'Cartas para cortar la inercia y mirar lo que está pasando sin anestesia.',
    previewPolicy: 'Elegir 1-3 cartas que muestren intensidad, claridad y cierre seguro.',
    cardCount: 20,
  },
  {
    label: '🍷 Primera cita',
    topic: 'Mazo para romper el hielo en la primera cita',
    context: 'Divertido pero no cursi. Preguntas que revelan personalidad sin ser invasivas.',
    type: 'party',
    collection: 'couples-dating',
    category: 'first-date',
    moment: 'Dos personas quieren esquivar la entrevista laboral disfrazada de cita.',
    buyerSentence: 'Quiero conversación real sin caer en preguntas incómodas o solemnes.',
    landingPromise: 'Preguntas para romper el hielo sin convertir la cita en una entrevista.',
    previewPolicy: 'Mostrar variedad: mood, humor creativo y una interacción liviana.',
    cardCount: 20,
  },
  {
    label: '⚽ Trivia fútbol',
    topic: 'Trivia sobre la historia del fútbol argentino',
    context: 'Mezcla de dificultades. Desde clásicos hasta datos poco conocidos. Evitar likeness realista, escudos, marcas y camisetas exactas.',
    type: 'trivia',
    collection: 'trivia-games',
    category: 'football',
    moment: 'Previa, entretiempo o juntada futbolera donde todos opinan y alguien tiene que demostrar si sabe.',
    buyerSentence: 'Quiero una trivia de fútbol argentino que active discusión, memoria y chicana.',
    landingPromise: 'Trivia futbolera para cortar la discusión o prenderla de una vez.',
    previewPolicy: 'Mostrar mito, final histórica y potrero sin revelar las mejores respuestas.',
    cardCount: 30,
    artStyle: 'stylized-illustration',
  },
  {
    label: '🎬 Trivia cine',
    topic: 'Trivia sobre cine argentino y latinoamericano',
    context: 'Películas icónicas, directores, premios, behind-the-scenes. Priorizar preguntas conversables, no datos enciclopédicos.',
    type: 'trivia',
    collection: 'trivia-games',
    category: 'argentine-cinema',
    moment: 'Grupo de amigos o cinéfilos quiere jugar, discutir escenas y medir memoria cultural.',
    buyerSentence: 'Quiero una trivia local que no sea cultura general genérica.',
    landingPromise: 'Trivia de cine argentino para jugar y terminar discutiendo escenas.',
    previewPolicy: 'Mostrar preguntas reconocibles, conversables y con sabor local.',
    cardCount: 30,
    artStyle: 'cinematic',
  },
  {
    label: '🎲 Party game',
    topic: 'Juego de cartas para jugar entre amigos en una juntada',
    context: 'Retos, verdad o consecuencia, preguntas absurdas. No depender de alcohol ni exponer a nadie de forma incómoda.',
    type: 'party',
    collection: 'social-games',
    category: 'between-friends',
    moment: 'Amigos en una juntada necesitan salir de los temas de siempre sin ponerse solemnes.',
    buyerSentence: 'Necesito algo para que la noche no muera y la conversación se ponga mejor.',
    landingPromise: 'Un mazo para estirar la noche cuando la mesa ya está lista para hablar de otra cosa.',
    previewPolicy: 'Mostrar humor, confesión liviana y conversación de grupo.',
    cardCount: 40,
  },
  {
    label: '💼 Team building',
    topic: 'Mazo de team building para equipos de trabajo',
    context: 'Preguntas que generan conexión entre colegas sin ser incómodas. Evitar consultoría vacía y dinámicas infantiles.',
    type: 'party',
    collection: 'team-tools',
    category: 'office',
    moment: 'Un equipo necesita abrir una reunión, cortar rutina o conocerse sin team building forzado.',
    buyerSentence: 'Necesito una dinámica rápida que no dé vergüenza y haga hablar al equipo.',
    landingPromise: 'Dinámicas breves para que un equipo deje de ser solo una cadena de mails.',
    previewPolicy: 'Mostrar dinámicas rápidas que un facilitador pueda usar sin preparar una sesión entera.',
    cardCount: 30,
  },
];
