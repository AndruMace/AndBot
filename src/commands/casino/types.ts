import type { Config } from "../../config";
import { BetValidationError, validateBetAmount } from "../../utils/bets";

export type CasinoGame =
  | "coinflip"
  | "blackjack"
  | "slots"
  | "hilo"
  | "lucky"
  | "mines"
  | "plinko";

export const CASINO_GAMES: {
  id: CasinoGame;
  label: string;
  emoji: string;
  description: string;
}[] = [
  { id: "coinflip", label: "Coinflip", emoji: "🪙", description: "50/50 — double your wager." },
  { id: "blackjack", label: "Blackjack", emoji: "🃏", description: "Beat the dealer to 21." },
  { id: "slots", label: "Slots", emoji: "🎰", description: "Match symbols for up to 20x." },
  { id: "hilo", label: "Hi-Lo", emoji: "📈", description: "Guess if the next card is higher or lower." },
  { id: "lucky", label: "Lucky #", emoji: "🎯", description: "Pick 1–100; exact match pays 25x." },
  { id: "mines", label: "Mines", emoji: "💣", description: "Reveal gems, avoid mines, cash out anytime." },
  { id: "plinko", label: "Plinko", emoji: "🔻", description: "Drop the chip — land up to 5x." },
];

export function parseWagerAmount(raw: string, config: Config): number {
  const amount = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(amount)) {
    throw new BetValidationError("Amount must be a whole number.");
  }
  validateBetAmount(amount, config);
  return amount;
}

export function getCasinoGameLabel(game: CasinoGame): string {
  return CASINO_GAMES.find((g) => g.id === game)?.label ?? game;
}

export function parseLuckyPick(raw: string): number {
  const pick = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(pick) || pick < 1 || pick > 100) {
    throw new Error("Pick a number between 1 and 100.");
  }
  return pick;
}
