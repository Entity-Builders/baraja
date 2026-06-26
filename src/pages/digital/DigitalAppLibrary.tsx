import { Link } from 'react-router-dom';
import { getPreviewCards, type DeckSchema } from '@eb-packages/deck-engine';
import {
  FEATURED_DIGITAL_DECK,
  getDeckAudienceBadges,
  getOwnedDigitalDecks,
} from '../../lib/digitalDeckCatalog';

export default function DigitalAppLibrary() {
  const ownedDecks = getOwnedDigitalDecks();
  const fallbackDeck = ownedDecks[0] ?? FEATURED_DIGITAL_DECK;

  if (!fallbackDeck) {
    return (
      <main className="baraja-mobile-app baraja-mobile-centered">
        <h1>Baraja</h1>
        <p>Todavía no hay mazos publicados.</p>
      </main>
    );
  }

  return (
    <main className="baraja-mobile-app">
      <section className="baraja-mobile-content">
        <header className="baraja-mobile-header">
          <h1>Tu colección</h1>
          <Link className="baraja-avatar-button" to="/app/access">
            <span className="sr-only">Mi acceso</span>
          </Link>
        </header>

        {ownedDecks.length > 0 ? (
          <>
            <div className="baraja-mobile-section-label">Mazos con acceso</div>
            <div className="baraja-owned-list">
              {ownedDecks.map((deck) => {
                const previewCard = getPreviewCards(deck, 1)[0] ?? deck.cards[0];

                return (
                  <Link className="baraja-app-deck-card" to={`/app/decks/${deck.slug}/session`} key={deck.id}>
                    <div className="baraja-app-deck-thumb">
                      {previewCard?.front.art_url ? (
                        <img src={previewCard.front.art_url} alt="" />
                      ) : (
                        <strong>B</strong>
                      )}
                    </div>
                    <div>
                      <div className="baraja-app-deck-row">
                        <h2>{deck.name}</h2>
                        <span>Activo</span>
                      </div>
                      <p>{deck.description}</p>
                      <div className="baraja-deck-badges">
                        {getDeckAudienceBadges(deck).slice(0, 3).map((badge) => (
                          <small key={badge}>{badge}</small>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <section className="baraja-empty-collection">
            <p className="baraja-mobile-section-label">Tu colección</p>
            <h2>Todavía no tenés mazos activos.</h2>
            <p>
              Comprá un mazo para abrirlo desde acá, usar todas sus cartas y
              descargar el PDF imprimible incluido.
            </p>
            <Link to="/app/collections">Explorar colecciones</Link>
          </section>
        )}

        <section className="baraja-collection-shortcut">
          <div>
            <p className="baraja-mobile-section-label">Colecciones</p>
            <h2>Sumar nuevos mazos</h2>
            <p>Explorá mazos digitales con acceso completo y permiso de PDF imprimible.</p>
          </div>
          <Link to="/app/collections">Ver catálogo</Link>
        </section>
      </section>
      <AppTabbar active="decks" deck={fallbackDeck} />
    </main>
  );
}

export function AppTabbar({
  active,
  deck,
}: {
  active: 'decks' | 'today' | 'saved';
  deck?: DeckSchema | null;
}) {
  const deckSlug = deck?.slug ?? FEATURED_DIGITAL_DECK?.slug;
  const todayHref = deckSlug ? `/app/decks/${deckSlug}/today` : '/app/collections';
  const savedHref = deckSlug ? `/app/decks/${deckSlug}/saved` : '/app/collections';

  return (
    <nav className="baraja-app-tabbar" aria-label="Navegación principal">
      <Link to="/app" aria-current={active === 'decks' ? 'page' : undefined}>
        <span aria-hidden="true">▱</span>
        Colección
      </Link>
      <Link to={todayHref} aria-current={active === 'today' ? 'page' : undefined}>
        <span aria-hidden="true">◐</span>
        Hoy
      </Link>
      <Link to={savedHref} aria-current={active === 'saved' ? 'page' : undefined}>
        <span aria-hidden="true">◇</span>
        Guardadas
      </Link>
    </nav>
  );
}
