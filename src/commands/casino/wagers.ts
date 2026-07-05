import type { Config } from "../../config";
import { formatCurrency } from "../../utils/bets";
import { CASINO_GAMES, type CasinoGame } from "./types";

const PRESET_CANDIDATES = [50, 100, 250, 500, 1000, 2500, 5000, 10_000];

export function getWagerPresets(config: Config, balance: number): number[] {
  const valid = new Set<number>();

  if (config.MIN_BET <= balance && config.MIN_BET <= config.MAX_BET) {
    valid.add(config.MIN_BET);
  }

  for (const preset of PRESET_CANDIDATES) {
    if (preset >= config.MIN_BET && preset <= config.MAX_BET && preset <= balance) {
      valid.add(preset);
    }
  }

  if (config.MAX_BET <= balance) {
    valid.add(config.MAX_BET);
  }

  const sorted = [...valid].sort((a, b) => a - b);
  if (sorted.length <= 4) return sorted;

  const picks: number[] = [];
  for (let i = 0; i < 4; i++) {
    const index = Math.floor((i * (sorted.length - 1)) / 3);
    picks.push(sorted[index]!);
  }

  return [...new Set(picks)];
}

export function formatWagerButtonLabel(amount: number): string {
  if (amount >= 1_000_000) return `${amount / 1_000_000}M`;
  if (amount >= 1_000) return `${amount / 1_000}K`;
  return amount.toLocaleString();
}

export function resolveWagerAmount(
  amountToken: string,
  lastWager: number | null,
  config: Config,
  balance: number,
): number | null {
  if (amountToken === "repeat") {
    if (!lastWager) return null;
    if (lastWager < config.MIN_BET || lastWager > config.MAX_BET || lastWager > balance) {
      return null;
    }
    return lastWager;
  }

  const amount = Number.parseInt(amountToken, 10);
  if (Number.isNaN(amount)) return null;
  if (amount < config.MIN_BET || amount > config.MAX_BET || amount > balance) return null;
  return amount;
}

export function wagerSelectionDescription(
  game: CasinoGame,
  config: Config,
  balance: number,
  lastWager: number | null,
): string {
  const gameInfo = CASINO_GAMES.find((g) => g.id === game);
  let text =
    `**${gameInfo?.emoji} ${gameInfo?.label}** — choose your wager.\n` +
    `Balance: **${formatCurrency(balance, config)}**`;

  if (lastWager && lastWager >= config.MIN_BET && lastWager <= config.MAX_BET) {
    text += `\nLast bet: **${formatCurrency(lastWager, config)}**`;
  }

  return text;
}
