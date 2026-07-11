export {
  createDeck,
  shuffleDeck,
  parseCard,
  formatCard,
  type Card,
} from "../blackjack/engine";

export function burnCard(deck: string[]): { burned: string; remaining: string[] } {
  const [burned, ...remaining] = deck;
  if (!burned) throw new Error("Cannot burn from empty deck.");
  return { burned, remaining };
}

export function dealCards(deck: string[], count: number): { dealt: string[]; remaining: string[] } {
  if (deck.length < count) throw new Error("Not enough cards in deck.");
  return { dealt: deck.slice(0, count), remaining: deck.slice(count) };
}
