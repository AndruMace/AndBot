const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SUITS = ["H", "D", "C", "S"] as const;

export type Card = string;

export interface HandValue {
  total: number;
  soft: boolean;
  isBlackjack: boolean;
  isBust: boolean;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function rankValue(rank: string): number {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number.parseInt(rank, 10);
}

export function parseCard(card: Card): { rank: string; suit: string } {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { rank, suit };
}

export function formatCard(card: Card): string {
  const { rank, suit } = parseCard(card);
  const suitSymbol = { H: "♥", D: "♦", C: "♣", S: "♠" }[suit] ?? suit;
  return `${rank}${suitSymbol}`;
}

export function evaluateHand(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    const { rank } = parseCard(card);
    if (rank === "A") {
      aces++;
      total += 11;
    } else {
      total += rankValue(rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  const soft = aces > 0 && total <= 21;
  const isBlackjack = cards.length === 2 && total === 21;
  const isBust = total > 21;

  return { total, soft, isBlackjack, isBust };
}

export function dealInitial(deck: Card[]): {
  deck: Card[];
  playerCards: Card[];
  dealerCards: Card[];
} {
  const d = [...deck];
  const playerCards = [d.pop()!, d.pop()!];
  const dealerCards = [d.pop()!, d.pop()!];
  return { deck: d, playerCards, dealerCards };
}

export function hit(deck: Card[], hand: Card[]): { deck: Card[]; hand: Card[] } {
  const d = [...deck];
  const h = [...hand, d.pop()!];
  return { deck: d, hand: h };
}

export function dealerShouldHit(cards: Card[]): boolean {
  const value = evaluateHand(cards);
  if (value.isBust) return false;
  if (value.total < 17) return true;
  if (value.total === 17 && value.soft) return true;
  return false;
}

export function playDealer(deck: Card[], dealerCards: Card[]): {
  deck: Card[];
  dealerCards: Card[];
} {
  let d = [...deck];
  let hand = [...dealerCards];

  while (dealerShouldHit(hand)) {
    const result = hit(d, hand);
    d = result.deck;
    hand = result.hand;
  }

  return { deck: d, dealerCards: hand };
}

export type GameOutcome = "win" | "lose" | "push" | "blackjack";

export function determineOutcome(
  playerCards: Card[],
  dealerCards: Card[],
): GameOutcome {
  const player = evaluateHand(playerCards);
  const dealer = evaluateHand(dealerCards);

  if (player.isBust) return "lose";
  if (dealer.isBust) return "win";

  if (player.isBlackjack && !dealer.isBlackjack) return "blackjack";
  if (dealer.isBlackjack && !player.isBlackjack) return "lose";
  if (player.isBlackjack && dealer.isBlackjack) return "push";

  if (player.total > dealer.total) return "win";
  if (player.total < dealer.total) return "lose";
  return "push";
}

export function calculatePayout(wager: number, doubled: boolean, outcome: GameOutcome): number {
  const effectiveWager = doubled ? wager * 2 : wager;

  switch (outcome) {
    case "blackjack":
      return effectiveWager + Math.floor(wager * 1.5);
    case "win":
      return effectiveWager * 2;
    case "push":
      return effectiveWager;
    case "lose":
      return 0;
  }
}

export function formatHand(cards: Card[], hideHole = false): string {
  if (hideHole && cards.length >= 2) {
    return `${formatCard(cards[0]!)} ??`;
  }
  return cards.map(formatCard).join(" ");
}
