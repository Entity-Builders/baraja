import type { Card, CardFace, DeckSchema } from '@entity-builders/deck-engine';
import { CardCanvas } from '../../../components/cards/CardCanvas';

export function SessionCard({
  card,
  deck,
  face,
  autoRevealing,
}: {
  card: Card;
  deck: DeckSchema;
  face: CardFace;
  autoRevealing: boolean;
}) {
  const cardClassName = [
    'baraja-session-card',
    face === 'back' ? 'is-back' : 'is-front',
    autoRevealing ? 'is-revealing' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cardClassName}
      aria-label={`${face === 'front' ? 'Frente' : 'Reverso'} de ${card.front.title}`}
    >
      <CardCanvas
        card={card}
        deck={deck}
        className="baraja-session-card-canvas"
        flipped={face === 'back' || autoRevealing}
        showInfoRow={false}
        showQr={false}
      />
      {autoRevealing && <span className="baraja-auto-reveal">Revelando reverso</span>}
      <span className="sr-only">Carta renderizada con el diseño del mazo</span>
    </article>
  );
}
