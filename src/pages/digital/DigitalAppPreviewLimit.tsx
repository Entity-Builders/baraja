import { Link, useParams } from 'react-router-dom';
import { getPreviewCards } from '@eb-packages/deck-engine';
import { findDigitalDeck, formatDeckPrice } from '../../lib/digitalDeckCatalog';

export default function DigitalAppPreviewLimit() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Vista previa no encontrada.</h1>
        <Link to="/app">Volver</Link>
      </main>
    );
  }

  const playedCards = getPreviewCards(deck, 5);
  const lockedCount = Math.max(0, deck.card_count - playedCards.length);

  return (
    <main className="baraja-mobile-app baraja-preview-limit">
      <section className="baraja-mobile-content">
        <Link to={`/app/decks/${deck.slug}/session`} className="baraja-mobile-back">
          {deck.name}
          <span>Vista previa · {playedCards.length} de {deck.card_count} cartas</span>
        </Link>

        <h1>Jugadas · {playedCards.length}</h1>
        <div className="baraja-played-strip">
          {playedCards.map((card) => (
            <article key={card.id}>
              {card.front.art_url && <img src={card.front.art_url} alt="" />}
              <span>{card.front.title}</span>
            </article>
          ))}
        </div>

        <h2>Bloqueadas · {lockedCount} cartas</h2>
        <div className="baraja-locked-grid" aria-label="Cartas bloqueadas">
          {Array.from({ length: Math.min(20, lockedCount) }).map((_, index) => (
            <span key={index}>▢</span>
          ))}
        </div>
      </section>

      <aside className="baraja-preview-cta">
        <Link to={`/app/decks/${deck.slug}/access`}>
          Desbloquear mazo completo — {formatDeckPrice(deck)}
        </Link>
        <p>Acceso digital · PDF imprimible · Sin envío</p>
      </aside>
    </main>
  );
}
