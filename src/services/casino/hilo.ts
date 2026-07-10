import {
  createDeck,
  shuffleDeck,
  parseCard,
  type Card,
} from "../blackjack/engine";

/** Added to the base 1× for each correct guess in a row. */
export const HI_LO_STREAK_STEP = 0.5;

/** Hidden multiplier when a player correctly guesses through the entire remaining deck. */
export const HI_LO_DECK_CLEAR_BONUS_MULT = 2;

export const HI_LO_DECK_CLEAR_MESSAGE =
  "🃏 **Deck cleared!** You guessed through the entire deck — hidden **2×** bonus applied.";

export type HiLoChoice = "higher" | "lower";

export type HiLoGuessOutcome = "win" | "loss" | "tie";

const SUIT_SYMBOLS: Record<string, string> = {
  H: "♥",
  D: "♦",
  C: "♣",
  S: "♠",
};

export function hiloRankValue(rank: string): number {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return Number.parseInt(rank, 10);
}

export function cardRankValue(card: Card): number {
  return hiloRankValue(parseCard(card).rank);
}

export function createHiLoDeck(): Card[] {
  return shuffleDeck(createDeck());
}

export function dealHiLoStart(deck: Card[]): { currentCard: Card; remainingDeck: Card[] } {
  const [currentCard, ...remainingDeck] = deck;
  if (!currentCard) {
    throw new Error("Cannot deal from an empty deck.");
  }
  return { currentCard, remainingDeck };
}

export function formatHiLoCard(card: Card): string {
  const { rank, suit } = parseCard(card);
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  if (rank === "10") return `10${symbol}`;
  return `${rank}${symbol}`;
}

export type HiLoOutcomeCounts = {
  higher: number;
  lower: number;
  tie: number;
  total: number;
};

export function countOutcomes(remainingDeck: Card[], currentRank: number): HiLoOutcomeCounts {
  let higher = 0;
  let lower = 0;
  let tie = 0;

  for (const card of remainingDeck) {
    const rank = cardRankValue(card);
    if (rank > currentRank) higher++;
    else if (rank < currentRank) lower++;
    else tie++;
  }

  return { higher, lower, tie, total: remainingDeck.length };
}

export function getStepProbability(
  remainingDeck: Card[],
  currentRank: number,
  choice: HiLoChoice,
): number {
  const { higher, lower, total } = countOutcomes(remainingDeck, currentRank);
  if (total === 0) return 0;
  return choice === "higher" ? higher / total : lower / total;
}

export function choiceHasWinningOutcomes(
  remainingDeck: Card[],
  currentRank: number,
  choice: HiLoChoice,
): boolean {
  return getStepProbability(remainingDeck, currentRank, choice) > 0;
}

/** Total payout multiple for `streak` correct guesses (0 = cash out before guessing → 1×). */
export function getHiLoPotMultiple(streak: number, deckClearBonus = false): number {
  let multiple = 1 + HI_LO_STREAK_STEP * streak;
  if (deckClearBonus) {
    multiple *= HI_LO_DECK_CLEAR_BONUS_MULT;
  }
  return multiple;
}

/** Payout multiple after one more correct guess from the current streak. */
export function getHiLoNextPotMultiple(streak: number): number {
  return getHiLoPotMultiple(streak + 1, false);
}

export function formatHiLoNextPayoutLabel(streak: number): string {
  return `→ ${getHiLoNextPotMultiple(streak).toFixed(2)}×`;
}

export function resolveHiLoGuess(
  currentRank: number,
  nextRank: number,
  choice: HiLoChoice,
): HiLoGuessOutcome {
  if (nextRank === currentRank) return "tie";
  if (choice === "higher") return nextRank > currentRank ? "win" : "loss";
  return nextRank < currentRank ? "win" : "loss";
}

/** @deprecated Use resolveHiLoGuess */
export const resolveHiLo = resolveHiLoGuess;

export function calculateHiLoPayout(wager: number, potMultiple: number): number {
  return Math.max(0, Math.floor(wager * potMultiple));
}

export function canGuess(remainingDeckLength: number): boolean {
  return remainingDeckLength > 0;
}
