import type { Config } from "../../config";
import { BetValidationError, validateBetAmount } from "../../utils/bets";

export type CasinoGame =
  | "coinflip"
  | "blackjack"
  | "slots"
  | "hilo"
  | "lucky"
  | "mines"
  | "plinko"
  | "keno"
  | "roulette"
  | "poker";

export const CASINO_GAMES: {
  id: CasinoGame;
  label: string;
  emoji: string;
  description: string;
}[] = [
  { id: "coinflip", label: "Coinflip", emoji: "🪙", description: "50/50 — double your wager." },
  { id: "blackjack", label: "Blackjack", emoji: "🃏", description: "Beat the dealer to 21." },
  { id: "slots", label: "Slots", emoji: "🎰", description: "5 reels · 7 symbols · progressive jackpot." },
  { id: "hilo", label: "Hi-Lo", emoji: "📈", description: "Streak guesses on one deck; +0.5× per win. Cash out or bust." },
  { id: "lucky", label: "Lucky #", emoji: "🎯", description: "Pick 1–100; exact match pays 25x." },
  { id: "mines", label: "Mines", emoji: "💣", description: "Reveal gems, avoid mines, cash out anytime." },
  { id: "plinko", label: "Plinko", emoji: "🔻", description: "Drop the chip — land up to 5x." },
  { id: "keno", label: "Keno", emoji: "🎱", description: "Pick up to 10 numbers; 20 drawn from 80." },
  { id: "roulette", label: "Roulette", emoji: "🎡", description: "Red, Black, Odd, Even, or 0 (~97% RTP)." },
  { id: "poker", label: "Poker", emoji: "♠️", description: "No-Limit Texas Hold'em — 2–6 player tables." },
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

export function isCasinoGame(value: string): value is CasinoGame {
  return CASINO_GAMES.some((g) => g.id === value);
}

export function parseLuckyPick(raw: string): number {
  const pick = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(pick) || pick < 1 || pick > 100) {
    throw new Error("Pick a number between 1 and 100.");
  }
  return pick;
}

export { parseKenoPicks, KenoPickError } from "../../services/casino/keno";
