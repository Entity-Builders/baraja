import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getPreviewCards,
  type Card,
  type DeckSchema,
} from '@entity-builders/deck-engine';
import { CardCanvas } from '../../components/cards/CardCanvas';
import {
  FEATURED_DIGITAL_DECK,
  getBarajaInquiryHref,
} from '../../lib/digitalDeckCatalog';
import { trackBarajaEvent } from '../../services/analytics';

type BriefField =
  | 'format'
  | 'purpose'
  | 'audience'
  | 'scope'
  | 'tone'
  | 'deadline'
  | 'useCase'
  | 'context';

interface BriefState {
  format: string;
  purpose: string;
  audience: string;
  scope: string;
  tone: string;
  deadline: string;
  useCase: string;
  context: string;
}

const INITIAL_BRIEF: BriefState = {
  format: '',
  purpose: '',
  audience: '',
  scope: '',
  tone: '',
  deadline: '',
  useCase: '',
  context: '',
};

const FORMAT_OPTIONS = [
  'Bingo musical personalizado',
  'Bingo musical prearmado',
  'Trivia o cartas para bar',
  'Mazo personalizado',
  'No sé todavía',
];

const PURPOSE_OPTIONS = [
  'Fiesta, cumple o juntada',
  'Bar o evento comercial',
  'Fútbol o noche temática',
  'Facilitación o coaching',
  'Terapia o educación',
  'Marca o comunidad',
];

const SCOPE_OPTIONS = [
  'Bingo breve · 15 a 30 cartones',
  'Bingo/evento · 50 a 100 cartones',
  'Mazo breve · 24 a 32 cartas',
  'Mazo completo · 40 a 60 cartas',
  'No sé todavía',
];

const TONE_OPTIONS = [
  'Popular y festivo',
  'Futbolero y competitivo',
  'Sobrio y profesional',
  'Íntimo y emocional',
  'Lúdico y social',
  'Editorial de marca',
];

const DEADLINE_OPTIONS = [
  'Sin urgencia',
  'Este mes',
  'Para una fecha concreta',
  'Estoy explorando',
];

const USE_CASE_OPTIONS = [
  'Fiesta privada',
  'Bar o evento público',
  'Uso personal',
  'Sesiones o talleres',
  'Equipo interno',
  'Campaña o comunidad',
  'Venta o distribución',
];

const SERVICE_EXAMPLES = [
  {
    title: 'Bingo musical personalizado',
    text: 'Cartones, lista sugerida y guía de dinámica a partir de tus canciones o temática.',
  },
  {
    title: 'Bingos prearmados',
    text: 'Rock argentino, cumbia retro, hits 2000, fiesta latina o noches temáticas listas para adaptar.',
  },
  {
    title: 'Fútbol y bar',
    text: 'Trivia, desafíos y cartas para previa, entretiempo, post-partido o noches de bar.',
  },
  {
    title: 'Métodos de trabajo',
    text: 'Convertí un marco de coaching, terapia o educación en cartas usables en sesiones.',
  },
];

const PILOT_PACKAGES = [
  'Brief guiado y propuesta manual',
  'PDF listo para imprimir con cartones, cartas o piezas del juego',
  'Guía de dinámica para preparar, conducir y cerrar la partida',
  'Lista sugerida de canciones o consignas cuando aplica',
  'Una ronda de ajustes incluida',
  'Superficie digital opcional si el proyecto lo pide',
];

const BOUNDARIES = [
  'No vendemos música, audio ni derechos de reproducción',
  'No prometemos playlists oficiales como parte del producto pago',
  'No imprimimos ni enviamos mazos físicos',
  'No integramos imprentas ni tracking',
  'No prometemos editor self-service',
  'Reventa o sublicencia requiere propuesta aparte',
];

const REQUIRED_FIELDS: BriefField[] = [
  'format',
  'purpose',
  'audience',
  'scope',
  'tone',
  'deadline',
  'useCase',
  'context',
];

const FIELD_LABELS: Record<BriefField, string> = {
  format: 'formato',
  purpose: 'propósito',
  audience: 'destinatario',
  scope: 'tamaño aproximado',
  tone: 'tono',
  deadline: 'plazo',
  useCase: 'uso previsto',
  context: 'historia o intención',
};

function getMissingFields(brief: BriefState): BriefField[] {
  return REQUIRED_FIELDS.filter((field) => brief[field].trim().length === 0);
}

function buildBriefMessage(brief: BriefState): string {
  return [
    'Hola, quiero solicitar una propuesta para un juego imprimible o mazo personalizado de Baraja.',
    '',
    `Formato: ${brief.format}`,
    `Propósito: ${brief.purpose}`,
    `Para quién es: ${brief.audience}`,
    `Tamaño aproximado: ${brief.scope}`,
    `Tono visual/editorial: ${brief.tone}`,
    `Plazo: ${brief.deadline}`,
    `Uso previsto: ${brief.useCase}`,
    '',
    'Contexto:',
    brief.context,
  ].join('\n');
}

function trackCustomServiceAction(ctaId: string) {
  trackBarajaEvent('baraja_inquiry_started', {
    cta_id: ctaId,
    cta_kind: 'whatsapp',
    href_type: 'wa_me',
    source: ctaId,
    surface: 'custom_deck_service',
  });
}

export default function CustomDeckService() {
  const [brief, setBrief] = useState<BriefState>(INITIAL_BRIEF);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const missingFields = useMemo(() => getMissingFields(brief), [brief]);

  const featuredDeck = FEATURED_DIGITAL_DECK;
  const previewCards = featuredDeck
    ? getPreviewCards(featuredDeck, 2)
    : [];

  function updateBrief(field: BriefField, value: string) {
    setBrief((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleBriefHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptedSubmit(true);

    if (missingFields.length > 0) {
      return;
    }

    trackCustomServiceAction('custom_brief_submit');
    window.location.assign(getBarajaInquiryHref(buildBriefMessage(brief)));
  }

  return (
    <main className="baraja-landing">
      <CustomServiceNav />
      <section className="baraja-custom-hero">
        <div className="baraja-custom-hero-copy">
          <p className="baraja-kicker">Juegos imprimibles y mazos a medida</p>
          <h1>Tu idea convertida en un juego imprimible.</h1>
          <p className="baraja-lead">
            Para bingos musicales, noches de bar, fútbol, talleres, marcas,
            comunidades e historias personales. Vos traés la intención; Baraja
            la convierte en piezas editadas, diseñadas y listas para llevar a la
            mesa.
          </p>
          <div className="baraja-actions">
            <a href="#brief" className="baraja-button baraja-button-primary">
              Armar mi juego
            </a>
            <Link to="/bingo-musical" className="baraja-button baraja-button-outline">
              Ver bingo musical
            </Link>
            <Link to="/#mazos" className="baraja-button baraja-button-outline">
              Ver ejemplos
            </Link>
          </div>
          <div className="baraja-hero-pill-row">
            <span>PDF print-ready</span>
            <span>Guía de dinámica</span>
            <span>Digital opcional</span>
          </div>
        </div>
        <CustomDeckPreview deck={featuredDeck} cards={previewCards} />
      </section>

      <section className="baraja-custom-section">
        <div className="baraja-section-header">
          <p className="baraja-kicker">Casos de uso</p>
          <h2>Para quienes necesitan resolver una noche, una mesa o una sesión.</h2>
        </div>
        <div className="baraja-custom-example-grid">
          {SERVICE_EXAMPLES.map((example) => (
            <article key={example.title}>
              <h3>{example.title}</h3>
              <p>{example.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="baraja-custom-section baraja-custom-process">
        <div>
          <p className="baraja-kicker">Piloto acompañado</p>
          <h2>El entregable no es solo el archivo: es saber cómo jugarlo.</h2>
          <p>
            Empezamos con paquetes cerrados y una propuesta manual. El objetivo
            es validar demanda real con PDF, reglas, guía de dinámica y límites
            legales claros antes de automatizar o abrir marketplace.
          </p>
        </div>
        <div className="baraja-custom-list-panel">
          <h3>Incluye</h3>
          <ul>
            {PILOT_PACKAGES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="baraja-custom-list-panel">
          <h3>No incluye</h3>
          <ul>
            {BOUNDARIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="baraja-custom-section baraja-custom-legal-note">
        <div>
          <p className="baraja-kicker">Música y bares</p>
          <h2>Vendemos el juego, no la música.</h2>
        </div>
        <p>
          En bingos musicales podemos incluir una lista de canciones sugeridas y
          una guía para armar la dinámica. No entregamos archivos de audio,
          derechos de reproducción pública ni una playlist oficial como parte
          del producto pago. Si el juego se usa en un bar, evento público o
          comercio, la plataforma musical y las licencias corresponden al
          organizador.
        </p>
      </section>

      <BriefForm
        attemptedSubmit={attemptedSubmit}
        brief={brief}
        missingFields={missingFields}
        onBriefHandoff={handleBriefHandoff}
        onUpdate={updateBrief}
      />

      <footer className="baraja-footer">
        <Link to="/" className="baraja-brand">Baraja</Link>
        <span>© 2026 Baraja · Juegos imprimibles y mazos personalizados</span>
        <div>
          <Link to="/#mazos">Colección</Link>
          <a href="#brief">Solicitar propuesta</a>
        </div>
      </footer>
    </main>
  );
}

function CustomServiceNav() {
  return (
    <nav className="baraja-nav">
      <Link to="/" className="baraja-brand">Baraja</Link>
      <div className="baraja-nav-links">
        <Link to="/#mazos">Colección</Link>
        <Link to="/bingo-musical">Bingo musical</Link>
        <a href="#brief">Brief</a>
        <Link to="/app">Abrir app</Link>
        <a href="#brief" className="baraja-nav-cta">Crear juego</a>
      </div>
    </nav>
  );
}

function CustomDeckPreview({
  cards,
  deck,
}: {
  cards: Card[];
  deck: DeckSchema | null;
}) {
  return (
    <div className="baraja-custom-preview" aria-label="Vista del servicio de juego imprimible personalizado">
      <div className="baraja-custom-preview-note">
        <span>Entrega piloto</span>
        <strong>PDF print-ready + guía</strong>
        <small>Digital opcional según propuesta</small>
      </div>
      <div className="baraja-custom-card-spread">
        {deck && cards.length > 0 ? (
          cards.map((card, index) => (
            <figure key={card.id} className={`baraja-custom-card baraja-custom-card-${index + 1}`}>
              <CardCanvas
                card={card}
                deck={deck}
                flipped={index === 1}
                showInfoRow={false}
                showQr={false}
              />
              <figcaption>{index === 1 ? 'Reverso editable' : 'Frente visual'}</figcaption>
            </figure>
          ))
        ) : (
          <div className="baraja-custom-placeholder-card">Baraja</div>
        )}
      </div>
    </div>
  );
}

function BriefForm({
  attemptedSubmit,
  brief,
  missingFields,
  onBriefHandoff,
  onUpdate,
}: {
  attemptedSubmit: boolean;
  brief: BriefState;
  missingFields: BriefField[];
  onBriefHandoff: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: BriefField, value: string) => void;
}) {
  const missingLabels = missingFields.map((field) => FIELD_LABELS[field]).join(', ');

  return (
    <section className="baraja-custom-brief" id="brief">
      <div className="baraja-section-header baraja-section-header-centered">
        <p className="baraja-kicker">Brief inicial</p>
        <h2>Contanos qué juego o mazo querés crear.</h2>
        <p>
          El resumen se abre en WhatsApp para conversar con contexto. En esta
          primera versión no guardamos el brief en una base de datos.
        </p>
      </div>

      <form className="baraja-custom-form" onSubmit={onBriefHandoff}>
        <BriefChoiceGroup
          label="Formato"
          options={FORMAT_OPTIONS}
          value={brief.format}
          onChange={(value) => onUpdate('format', value)}
        />

        <BriefChoiceGroup
          label="Propósito"
          options={PURPOSE_OPTIONS}
          value={brief.purpose}
          onChange={(value) => onUpdate('purpose', value)}
        />

        <label className="baraja-custom-field">
          <span>Para quién es</span>
          <input
            value={brief.audience}
            onChange={(event) => onUpdate('audience', event.target.value)}
            placeholder="Ej. participantes de mis talleres, equipo interno, una persona concreta"
          />
        </label>

        <div className="baraja-custom-form-row">
          <label className="baraja-custom-field">
            <span>Tamaño aproximado</span>
            <select
              value={brief.scope}
              onChange={(event) => onUpdate('scope', event.target.value)}
            >
              <option value="">Elegir tamaño</option>
              {SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="baraja-custom-field">
            <span>Tono</span>
            <select
              value={brief.tone}
              onChange={(event) => onUpdate('tone', event.target.value)}
            >
              <option value="">Elegir tono</option>
              {TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="baraja-custom-form-row">
          <label className="baraja-custom-field">
            <span>Plazo</span>
            <select
              value={brief.deadline}
              onChange={(event) => onUpdate('deadline', event.target.value)}
            >
              <option value="">Elegir plazo</option>
              {DEADLINE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="baraja-custom-field">
            <span>Uso previsto</span>
            <select
              value={brief.useCase}
              onChange={(event) => onUpdate('useCase', event.target.value)}
            >
              <option value="">Elegir uso</option>
              {USE_CASE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="baraja-custom-field">
          <span>Historia, método o intención</span>
          <textarea
            value={brief.context}
            onChange={(event) => onUpdate('context', event.target.value)}
            placeholder="Contanos qué debería pasar en la mesa, qué canciones o temas tenés, qué material ya existe y qué tono conviene evitar."
            rows={6}
          />
        </label>

        {attemptedSubmit && missingFields.length > 0 && (
          <p className="baraja-custom-form-error" role="alert">
            Falta completar: {missingLabels}.
          </p>
        )}

        <div className="baraja-custom-form-actions">
          <button
            className="baraja-button baraja-button-primary"
            data-incomplete={missingFields.length > 0}
            type="submit"
          >
            Enviar brief por WhatsApp
          </button>
          <p>
            Si el proyecto encaja, seguimos con propuesta manual, alcance y
            precio antes de producir.
          </p>
        </div>
      </form>
    </section>
  );
}

function BriefChoiceGroup({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <fieldset className="baraja-custom-choice-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={value === option ? 'baraja-custom-choice-active' : ''}
            key={option}
            type="button"
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
