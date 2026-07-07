import { EmbedBuilder } from "discord.js";
import type { Config } from "../../config";
import type { WalletService } from "../../services/wallet";
import { flipCoin, type CoinSide } from "../../services/coinflip";
import {
  buildCoinflipFrames,
  COINFLIP_FRAME_DELAY_MS,
  renderCoinflipResultFrame,
  sleep as coinflipSleep,
} from "../../services/casino/coinflipAnim";
import {
  buildLuckyFrames,
  LUCKY_FRAME_DELAY_MS,
  renderLuckyFrame,
  sleep as luckySleep,
} from "../../services/casino/luckyAnim";
import { rollLuckyNumber, calculateLuckyPayout } from "../../services/casino/lucky";
import { formatCurrency } from "../../utils/bets";

type EmbedEdit = (payload: { embeds: EmbedBuilder[] }) => Promise<unknown>;

export async function runCoinflipAnimation(
  edit: EmbedEdit,
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
  side: CoinSide,
  config: Config,
) {
  await wallet.debit(guildId, userId, amount, "coinflip_bet", undefined, { side });
  const result = flipCoin();
  const frames = buildCoinflipFrames(result);

  for (let step = 0; step < frames.length; step++) {
    const spinning = step < frames.length - 1;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("Coinflip")
          .setDescription(
            spinning
              ? frames[step]!
              : `${renderCoinflipResultFrame(result)}\nYour pick: **${side}**`,
          ),
      ],
    });
    if (spinning) await coinflipSleep(COINFLIP_FRAME_DELAY_MS);
  }

  const won = result === side;
  let balance: number;
  let payout = 0;

  if (won) {
    payout = amount * 2;
    balance = await wallet.credit(guildId, userId, payout, "coinflip_win", undefined, {
      side,
      result,
    });
  } else {
    balance = await wallet.getBalance(guildId, userId);
  }

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(won ? "Coinflip — You Won!" : "Coinflip — You Lost")
        .setDescription(
          `${renderCoinflipResultFrame(result)}\n` +
            `Your pick: **${side}**\n` +
            `Wager: **${formatCurrency(amount, config)}**\n` +
            (won
              ? `Payout: **${formatCurrency(payout, config)}**\n`
              : `Lost: **${formatCurrency(amount, config)}**\n`) +
            `Balance: **${formatCurrency(balance, config)}**`,
        ),
    ],
  });
}

export async function runLuckyAnimation(
  edit: EmbedEdit,
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
  pick: number,
  config: Config,
) {
  await wallet.debit(guildId, userId, amount, "lucky_bet", undefined, { pick });
  const roll = rollLuckyNumber();
  const frames = buildLuckyFrames(roll);

  for (let step = 0; step < frames.length; step++) {
    const spinning = step < frames.length - 1;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("Lucky Number")
          .setDescription(renderLuckyFrame(frames[step]!, pick, spinning)),
      ],
    });
    if (spinning) await luckySleep(LUCKY_FRAME_DELAY_MS);
  }

  const { payout, description } = calculateLuckyPayout(amount, pick, roll);
  let balance: number;
  if (payout > 0) {
    balance = await wallet.credit(guildId, userId, payout, "lucky_win", undefined, {
      pick,
      roll,
    });
  } else {
    balance = await wallet.getBalance(guildId, userId);
  }

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout > 0 ? 0x57f287 : 0xed4245)
        .setTitle(payout > 0 ? "Lucky Number — Winner!" : "Lucky Number — Miss")
        .setDescription(
          `${renderLuckyFrame(roll, pick, false)}\n${description}\n` +
            `Wager: **${formatCurrency(amount, config)}**` +
            (payout > 0 ? `\nPayout: **${formatCurrency(payout, config)}**` : "") +
            `\nBalance: **${formatCurrency(balance, config)}**`,
        ),
    ],
  });
}
