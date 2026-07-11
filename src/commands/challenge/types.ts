import type { PvpGameType } from "../../db/schema";

export const CHALLENGE_GAMES: {
  id: PvpGameType;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "rps",
    label: "RPS",
    emoji: "🪨",
    description: "Rock Paper Scissors — pick your move after accept.",
  },
  {
    id: "dice",
    label: "Dice",
    emoji: "🎲",
    description: "Roll 2 dice each — higher total wins.",
  },
  {
    id: "russian_roulette",
    label: "Roulette",
    emoji: "🔫",
    description: "Take turns pulling the trigger.",
  },
  {
    id: "coinflip_duel",
    label: "Coinflip",
    emoji: "🪙",
    description: "Pick heads or tails — flip decides the round.",
  },
];

export const POKER_CHALLENGE_ID = "poker";

export function isPokerChallenge(id: string): boolean {
  return id === POKER_CHALLENGE_ID;
}

export function isChallengeGame(id: string): id is PvpGameType {
  return CHALLENGE_GAMES.some((game) => game.id === id);
}
