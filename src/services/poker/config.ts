import type { Config } from "../../config";

export function pokerBlinds(config: Config): { smallBlind: number; bigBlind: number } {
  const smallBlind = config.POKER_DEFAULT_SMALL_BLIND ?? config.MIN_BET;
  const bigBlind = config.POKER_DEFAULT_BIG_BLIND ?? Math.min(config.MIN_BET * 2, config.MAX_BET);
  return { smallBlind, bigBlind };
}

export function pokerBuyInRange(config: Config): { minBuyIn: number; maxBuyIn: number } {
  const { bigBlind } = pokerBlinds(config);
  const minBuyIn = Math.max(bigBlind * 20, config.MIN_BET);
  const maxBuyIn = Math.min(bigBlind * 100, config.MAX_BET);
  return { minBuyIn, maxBuyIn };
}
