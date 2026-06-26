import { Link, useParams } from 'react-router-dom';
import { getPreviewCards } from '@eb-packages/deck-engine';
import { findDigitalDeck } from '../../lib/digitalDeckCatalog';
import { AppTabbar } from './DigitalAppLibrary';

export default function DigitalSavedCards() {
  const { slug } = useParams();
  const deck = findDigitalDeck(slug);

  if (!deck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Guardadas no disponibles.</h1>
        <Link to="/app">Volver</Link>
      </main>
    );
  }

  const cards = getPreviewCards(deck, 3);

  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content">
        <header className="baraja-mobile-header">
          <h1>Guardadas</h1>
        </header>
        <div className="baraja-saved-grid">
          {cards.map((card) => (
            <article key={card.id}>
              {card.front.art_url && <img src={card.front.art_url} alt="" />}
              <h2>{card.front.title}</h2>
              <p>{card.back.phrase}</p>
            </article>
          ))}
        </div>
      </section>
      <AppTabbar active="saved" deck={deck} />
    </main>
  );
}
