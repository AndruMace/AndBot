import type { WalletService } from "./wallet";

export type CoinSide = "heads" | "tails";

export function flipCoin(): CoinSide {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 2 === 0 ? "heads" : "tails";
}

export interface CoinflipResult {
  side: CoinSide;
  result: CoinSide;
  won: boolean;
  wager: number;
  payout: number;
  balance: number;
}

export async function playCoinflip(
  wallet: WalletService,
  guildId: string,
  userId: string,
  wager: number,
  side: CoinSide,
): Promise<CoinflipResult> {
  await wallet.debit(guildId, userId, wager, "coinflip_bet", undefined, { side });

  const result = flipCoin();
  const won = result === side;

  let balance: number;
  let payout = 0;

  if (won) {
    payout = wager * 2;
    balance = await wallet.credit(guildId, userId, payout, "coinflip_win", undefined, {
      side,
      result,
    });
  } else {
    balance = await wallet.getBalance(guildId, userId);
  }

  return { side, result, won, wager, payout, balance };
}
