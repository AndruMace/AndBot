import { parseCard, formatCard, type Card } from "../blackjack/engine";

const RANK_VALUES: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export type HandCategory =
  | "high_card"
  | "pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush";

const CATEGORY_RANK: Record<HandCategory, number> = {
  high_card: 0,
  pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
};

const CATEGORY_LABELS: Record<HandCategory, string> = {
  high_card: "High Card",
  pair: "Pair",
  two_pair: "Two Pair",
  three_of_a_kind: "Three of a Kind",
  straight: "Straight",
  flush: "Flush",
  full_house: "Full House",
  four_of_a_kind: "Four of a Kind",
  straight_flush: "Straight Flush",
};

export type EvaluatedHand = {
  category: HandCategory;
  scores: number[];
  cards: Card[];
  label: string;
};

export function cardRankValue(card: Card): number {
  return RANK_VALUES[parseCard(card).rank] ?? 0;
}

function cardSuit(card: Card): string {
  return parseCard(card).suit;
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i]!, ...rest];
    }
  }
}

function isStraight(ranks: number[]): { straight: boolean; high: number } {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length < 5) return { straight: false, high: 0 };

  for (let i = 0; i <= unique.length - 5; i++) {
    const slice = unique.slice(i, i + 5);
    if (slice[0]! - slice[4]! === 4) {
      return { straight: true, high: slice[0]! };
    }
  }

  // Wheel: A-2-3-4-5
  if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
    return { straight: true, high: 5 };
  }

  return { straight: false, high: 0 };
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const ranks = cards.map(cardRankValue).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const isFlush = suits.every((s) => s === suits[0]);
  const straightInfo = isStraight(ranks);
  const isStraightFlush = isFlush && straightInfo.straight;

  if (isStraightFlush) {
    return {
      category: "straight_flush",
      scores: [CATEGORY_RANK.straight_flush, straightInfo.high],
      cards,
      label: `${CATEGORY_LABELS.straight_flush} (${straightInfo.high === 5 ? "Wheel" : formatRank(straightInfo.high)} high)`,
    };
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  const groups = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (groups[0]![1] === 4) {
    const quad = groups[0]![0];
    const kicker = groups[1]![0];
    return {
      category: "four_of_a_kind",
      scores: [CATEGORY_RANK.four_of_a_kind, quad, kicker],
      cards,
      label: `${CATEGORY_LABELS.four_of_a_kind} (${formatRank(quad)}s)`,
    };
  }

  if (groups[0]![1] === 3 && groups[1]![1] === 2) {
    return {
      category: "full_house",
      scores: [CATEGORY_RANK.full_house, groups[0]![0], groups[1]![0]],
      cards,
      label: `${CATEGORY_LABELS.full_house} (${formatRank(groups[0]![0])}s full of ${formatRank(groups[1]![0])}s)`,
    };
  }

  if (isFlush) {
    return {
      category: "flush",
      scores: [CATEGORY_RANK.flush, ...ranks],
      cards,
      label: `${CATEGORY_LABELS.flush} (${formatRank(ranks[0]!)} high)`,
    };
  }

  if (straightInfo.straight) {
    return {
      category: "straight",
      scores: [CATEGORY_RANK.straight, straightInfo.high],
      cards,
      label: `${CATEGORY_LABELS.straight} (${straightInfo.high === 5 ? "Wheel" : formatRank(straightInfo.high)} high)`,
    };
  }

  if (groups[0]![1] === 3) {
    const trip = groups[0]![0];
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return {
      category: "three_of_a_kind",
      scores: [CATEGORY_RANK.three_of_a_kind, trip, ...kickers],
      cards,
      label: `${CATEGORY_LABELS.three_of_a_kind} (${formatRank(trip)}s)`,
    };
  }

  if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    const highPair = Math.max(groups[0]![0], groups[1]![0]);
    const lowPair = Math.min(groups[0]![0], groups[1]![0]);
    const kicker = groups[2]![0];
    return {
      category: "two_pair",
      scores: [CATEGORY_RANK.two_pair, highPair, lowPair, kicker],
      cards,
      label: `${CATEGORY_LABELS.two_pair} (${formatRank(highPair)}s & ${formatRank(lowPair)}s)`,
    };
  }

  if (groups[0]![1] === 2) {
    const pair = groups[0]![0];
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return {
      category: "pair",
      scores: [CATEGORY_RANK.pair, pair, ...kickers],
      cards,
      label: `${CATEGORY_LABELS.pair} (${formatRank(pair)}s)`,
    };
  }

  return {
    category: "high_card",
    scores: [CATEGORY_RANK.high_card, ...ranks],
    cards,
    label: `${CATEGORY_LABELS.high_card} (${formatRank(ranks[0]!)} high)`,
  };
}

function formatRank(value: number): string {
  switch (value) {
    case 14:
      return "Ace";
    case 13:
      return "King";
    case 12:
      return "Queen";
    case 11:
      return "Jack";
    default:
      return String(value);
  }
}

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate a hand.");
  }
  if (cards.length === 5) return evaluateFiveCards(cards);

  let best: EvaluatedHand | null = null;
  for (const combo of combinations(cards, 5)) {
    const evaluated = evaluateFiveCards(combo);
    if (!best || compareHands(evaluated, best) > 0) best = evaluated;
  }
  return best!;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  const len = Math.max(a.scores.length, b.scores.length);
  for (let i = 0; i < len; i++) {
    const av = a.scores[i] ?? 0;
    const bv = b.scores[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function formatHandCards(cards: Card[]): string {
  return cards.map(formatCard).join(" ");
}
