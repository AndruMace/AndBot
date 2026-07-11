import type { Config } from "../../config";
import { BetValidationError } from "../../utils/bets";

/** Buy-in window for joiners: ~80%–120% of the host's chosen buy-in. */
const BUY_IN_MIN_RATIO = 0.8;
const BUY_IN_MAX_RATIO = 1.2;

/** Big blind ≈ 2% of host buy-in; small blind is half the big blind. */
const BIG_BLIND_RATIO = 0.02;

export type TableStakes = {
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
};

/** Round chip amounts to readable values. */
export function roundPokerChips(amount: number, config: Config): number {
  const clamped = Math.max(config.MIN_BET, Math.min(config.MAX_BET, amount));
  if (clamped < 100) return Math.max(config.MIN_BET, Math.round(clamped));
  if (clamped < 1_000) return Math.round(clamped / 5) * 5;
  if (clamped < 10_000) return Math.round(clamped / 25) * 25;
  return Math.round(clamped / 100) * 100;
}

export function pokerTableStakes(hostBuyIn: number, config: Config): TableStakes {
  const bigBlind = Math.max(
    config.MIN_BET,
    roundPokerChips(hostBuyIn * BIG_BLIND_RATIO, config),
  );
  const smallBlind = Math.max(config.MIN_BET, roundPokerChips(bigBlind / 2, config));

  const minBuyIn = roundPokerChips(hostBuyIn * BUY_IN_MIN_RATIO, config);
  const maxBuyIn = roundPokerChips(hostBuyIn * BUY_IN_MAX_RATIO, config);

  return {
    smallBlind,
    bigBlind: Math.max(bigBlind, smallBlind * 2),
    minBuyIn: Math.min(minBuyIn, maxBuyIn),
    maxBuyIn: Math.max(minBuyIn, maxBuyIn),
  };
}

export function parseTableBuyIn(
  raw: string,
  minBuyIn: number,
  maxBuyIn: number,
  config: Config,
): number {
  const amount = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(amount)) {
    throw new BetValidationError("Buy-in must be a whole number.");
  }
  if (amount < config.MIN_BET || amount > config.MAX_BET) {
    throw new BetValidationError(
      `Amount must be between ${config.MIN_BET} and ${config.MAX_BET}.`,
    );
  }
  if (amount < minBuyIn || amount > maxBuyIn) {
    throw new BetValidationError(`Buy-in must be between ${minBuyIn} and ${maxBuyIn} for this table.`);
  }
  return amount;
}

/** Max bots a host can request when creating a table. */
export const MAX_TABLE_BOTS = 6;

export function maxBotSeatsForTable(maxSeats: number): number {
  return Math.min(MAX_TABLE_BOTS, Math.max(0, maxSeats - 1));
}

export function parseBotCount(raw: string | undefined, maxSeats: number): number {
  const maxBots = maxBotSeatsForTable(maxSeats);
  if (!raw?.trim()) return 0;

  const count = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(count) || count < 0 || count > maxBots) {
    throw new BetValidationError(`Bot count must be between 0 and ${maxBots}.`);
  }
  return count;
}

/** Default suggested buy-in when browsing/creating (global fallback). */
export function defaultHostBuyIn(config: Config): number {
  return roundPokerChips(Math.min(config.MAX_BET, Math.max(config.MIN_BET * 100, 500)), config);
}
