import type { DeckType, TriviaDifficulty } from '../../generationPayload';
import {
  ART_STYLE_OPTIONS,
  CARD_COUNT_OPTIONS,
  DECK_TYPE_OPTIONS,
  TRIVIA_DIFFICULTY_OPTIONS,
  generationInputStyle,
  generationLabelStyle,
  getDifficultyHint,
  getGenerationChipStyle,
  normalizeCardCount,
} from '../../generationUi';

interface DeckTypeButtonsProps {
  deckType: DeckType;
  generating: boolean;
  onDeckTypeChange: (value: DeckType) => void;
}

export function DeckTypeButtons({
  deckType,
  generating,
  onDeckTypeChange,
}: DeckTypeButtonsProps) {
  return (
    <div>
      <label style={generationLabelStyle}>Deck Type</label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {DECK_TYPE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onDeckTypeChange(option.key)}
            disabled={generating}
            style={getGenerationChipStyle(deckType === option.key, generating)}
            title={option.desc}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CardCountFieldProps {
  cardCount: number;
  generating: boolean;
  onCardCountChange: (value: number) => void;
}

export function CardCountField({
  cardCount,
  generating,
  onCardCountChange,
}: CardCountFieldProps) {
  return (
    <div>
      <label style={generationLabelStyle}>Card Count</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {CARD_COUNT_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => onCardCountChange(count)}
            disabled={generating}
            style={getGenerationChipStyle(cardCount === count, generating)}
          >
            {count}
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={60}
          value={cardCount}
          onChange={(event) => onCardCountChange(normalizeCardCount(event.target.value))}
          disabled={generating}
          style={{ ...generationInputStyle, width: '70px', textAlign: 'center' }}
        />
      </div>
    </div>
  );
}

interface TriviaDifficultyFieldProps {
  difficulty: TriviaDifficulty;
  generating: boolean;
  onDifficultyChange: (value: TriviaDifficulty) => void;
}

export function TriviaDifficultyField({
  difficulty,
  generating,
  onDifficultyChange,
}: TriviaDifficultyFieldProps) {
  return (
    <div>
      <label style={generationLabelStyle}>Difficulty</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {TRIVIA_DIFFICULTY_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onDifficultyChange(option.key)}
            disabled={generating}
            style={getGenerationChipStyle(difficulty === option.key, generating, option.color)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '0.35rem' }}>
        {getDifficultyHint(difficulty)}
      </p>
    </div>
  );
}

interface ArtStyleFieldProps {
  artStyle: string;
  generating: boolean;
  onArtStyleChange: (value: string) => void;
}

export function ArtStyleField({
  artStyle,
  generating,
  onArtStyleChange,
}: ArtStyleFieldProps) {
  return (
    <div>
      <label style={generationLabelStyle}>Art Style</label>
      <select
        value={artStyle}
        onChange={(event) => onArtStyleChange(event.target.value)}
        disabled={generating}
        style={{ ...generationInputStyle, cursor: 'pointer' }}
      >
        {ART_STYLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
