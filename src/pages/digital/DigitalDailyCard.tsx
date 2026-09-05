import { Link, useParams } from 'react-router-dom';
import { getPreviewCards } from '@entity-builders/deck-engine';
import { findDigitalDeck } from '../../lib/digitalDeckCatalog';
import { AppTabbar } from './DigitalAppLibrary';

export default function DigitalDailyCard() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Carta no encontrada.</h1>
        <Link to="/app">Volver</Link>
      </main>
    );
  }

  const cards = getPreviewCards(deck, 4);
  const todayCard = cards[0] ?? deck.cards[0];
  const recentCards = cards.slice(1, 4);

  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content baraja-daily-card">
        <header>
          <div>
            <h1>Carta de hoy</h1>
            <p>martes 24 de junio</p>
          </div>
          <span aria-hidden="true">◷</span>
        </header>

        <article className="baraja-daily-main-card">
          {todayCard?.front.art_url && <img src={todayCard.front.art_url} alt="" />}
          <div>
            <span>{deck.name} · {String(todayCard?.front.number ?? 1).padStart(2, '0')}</span>
            <h2>{todayCard?.front.title ?? deck.name}</h2>
            <p>{todayCard?.back.phrase}</p>
          </div>
        </article>

        <div className="baraja-daily-actions">
          <button type="button">Guardar reflexión</button>
          <button type="button">Compartir</button>
        </div>

        <div className="baraja-game-history">
          <p>Cartas anteriores</p>
          <div>
            {recentCards.map((card) => (
              <button type="button" key={card.id}>
                {card.front.art_url && <img src={card.front.art_url} alt="" />}
                <span>{card.front.title}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <AppTabbar active="today" deck={deck} />
    </main>
  );
}
