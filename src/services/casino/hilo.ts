import {
  createDeck,
  shuffleDeck,
  parseCard,
  type Card,
} from "../blackjack/engine";

export const HI_LO_TARGET_RTP = 1.05;
export const HI_LO_MAX_STREAK = 2;

export type HiLoChoice = "higher" | "lower";

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

export function getStepMultiplier(p: number): number {
  if (p <= 0) return 0;
  return HI_LO_TARGET_RTP / p;
}

export function resolveHiLoGuess(
  currentRank: number,
  nextRank: number,
  choice: HiLoChoice,
): boolean {
  if (nextRank === currentRank) return false;
  if (choice === "higher") return nextRank > currentRank;
  return nextRank < currentRank;
}

/** @deprecated Use resolveHiLoGuess */
export const resolveHiLo = resolveHiLoGuess;

export function calculateHiLoPayout(wager: number, potMultiple: number): number {
  return Math.max(0, Math.floor(wager * potMultiple));
}

export function getHiLoStepExpectedRtp(
  remainingDeck: Card[],
  currentRank: number,
  choice: HiLoChoice,
): number {
  const p = getStepProbability(remainingDeck, currentRank, choice);
  if (p <= 0) return 0;
  return p * getStepMultiplier(p);
}

export function getHiLoActionPreview(
  remainingDeck: Card[],
  currentRank: number,
): {
  higherP: number;
  lowerP: number;
  higherMult: number;
  lowerMult: number;
} {
  const higherP = getStepProbability(remainingDeck, currentRank, "higher");
  const lowerP = getStepProbability(remainingDeck, currentRank, "lower");
  return {
    higherP,
    lowerP,
    higherMult: higherP > 0 ? getStepMultiplier(higherP) : 0,
    lowerMult: lowerP > 0 ? getStepMultiplier(lowerP) : 0,
  };
}

export function canGuess(streak: number, remainingDeckLength: number): boolean {
  return streak < HI_LO_MAX_STREAK && remainingDeckLength > 0;
}

export function pickOptimalChoice(
  remainingDeck: Card[],
  currentRank: number,
): HiLoChoice {
  const { higherP, lowerP } = getHiLoActionPreview(remainingDeck, currentRank);
  return higherP >= lowerP ? "higher" : "lower";
}

export type HiLoRtpStrategy = "forced_one" | "cash_after_2" | "cash_after_3" | "always_press";

function runHiLoSession(
  wager: number,
  strategy: HiLoRtpStrategy,
): number {
  const deck = createHiLoDeck();
  const { currentCard, remainingDeck: initialDeck } = dealHiLoStart(deck);
  let currentRank = cardRankValue(currentCard);
  let remainingDeck = [...initialDeck];
  let potMultiple = 1;
  let streak = 0;

  const cashOut = () => calculateHiLoPayout(wager, potMultiple);

  const targetStreak =
    strategy === "forced_one"
      ? 1
      : strategy === "cash_after_2"
        ? 2
        : strategy === "cash_after_3"
          ? 3
          : HI_LO_MAX_STREAK;

  while (true) {
    if (!canGuess(streak, remainingDeck.length)) {
      return cashOut();
    }

    const choice = pickOptimalChoice(remainingDeck, currentRank);
    const p = getStepProbability(remainingDeck, currentRank, choice);
    const [nextCard, ...rest] = remainingDeck;
    if (!nextCard) return cashOut();

    remainingDeck = rest;
    const nextRank = cardRankValue(nextCard);
    const won = resolveHiLoGuess(currentRank, nextRank, choice);

    if (!won) {
      return 0;
    }

    potMultiple *= getStepMultiplier(p);
    streak++;
    currentRank = nextRank;

    if (strategy !== "always_press" && streak >= targetStreak) {
      return cashOut();
    }

    if (strategy === "always_press" && streak >= HI_LO_MAX_STREAK) {
      return cashOut();
    }
  }
}

export function simulateHiLoRtp(
  strategy: HiLoRtpStrategy,
  iterations: number,
  wager = 100,
): number {
  let totalReturn = 0;
  for (let i = 0; i < iterations; i++) {
    totalReturn += runHiLoSession(wager, strategy);
  }
  return totalReturn / (iterations * wager);
}
