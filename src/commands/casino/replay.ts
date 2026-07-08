import type { CoinSide } from "../../services/coinflip";
import type { MinesCount } from "../../services/casino/mines/engine";
import { buildButtonId } from "../../utils/buttons";
import { isCasinoGame, type CasinoGame } from "./types";

export type CasinoReplayOptions = {
  userId: string;
  game: CasinoGame;
  amount: number;
  coinflipSide?: CoinSide;
  luckyPick?: number;
  kenoPicks?: number[];
  minesCount?: MinesCount;
};

export function casinoAgainButtonId(replay: CasinoReplayOptions): string {
  const parts = [replay.userId, replay.game, String(replay.amount)];
  if (replay.coinflipSide) parts.push(replay.coinflipSide);
  else if (replay.luckyPick != null) parts.push(String(replay.luckyPick));
  else if (replay.kenoPicks?.length) parts.push(replay.kenoPicks.join("-"));
  else if (replay.minesCount != null) parts.push(String(replay.minesCount));
  return buildButtonId("casino", "again", ...parts);
}

export function casinoSetupButtonId(userId: string, game: CasinoGame): string {
  return buildButtonId("casino", "setup", userId, game);
}

export function parseCasinoAgainButtonId(parts: string[]): CasinoReplayOptions | null {
  const [userId, game, amountStr, extra] = parts;
  if (!userId || !isCasinoGame(game) || !amountStr) return null;

  const amount = Number.parseInt(amountStr, 10);
  if (Number.isNaN(amount)) return null;

  const base: CasinoReplayOptions = { userId, game, amount };

  switch (game) {
    case "coinflip":
      if (extra !== "heads" && extra !== "tails") return null;
      return { ...base, coinflipSide: extra };
    case "lucky": {
      if (!extra) return null;
      const pick = Number.parseInt(extra, 10);
      if (Number.isNaN(pick)) return null;
      return { ...base, luckyPick: pick };
    }
    case "keno": {
      if (!extra) return null;
      const kenoPicks = extra.split("-").map((n) => Number.parseInt(n, 10));
      if (kenoPicks.some(Number.isNaN)) return null;
      return { ...base, kenoPicks };
    }
    case "mines": {
      if (!extra) return null;
      const minesCount = Number.parseInt(extra, 10);
      if (![3, 5, 8].includes(minesCount)) return null;
      return { ...base, minesCount: minesCount as MinesCount };
    }
    default:
      return base;
  }
}
