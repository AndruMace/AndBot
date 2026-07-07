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
import {
  buildGameHeader,
  prefixDescription,
  publicResultFooter,
} from "./publicMessage";

export type PresentationEdit = (payload: {
  embeds: EmbedBuilder[];
  components?: [];
  content?: string | null;
}) => Promise<unknown>;

export type PresentationContext = {
  isPublic: boolean;
  userId: string;
  gameLabel: string;
  wager: number;
  config: Config;
};

function describePublic(
  ctx: PresentationContext | undefined,
  body: string,
): string {
  if (!ctx?.isPublic) return body;
  return prefixDescription(
    buildGameHeader(ctx.userId, ctx.gameLabel, ctx.wager, ctx.config),
    body,
  );
}

function privateBalanceLine(balance: number, config: Config): string {
  return `\nBalance: **${formatCurrency(balance, config)}**`;
}

function outcomeFooter(
  ctx: PresentationContext | undefined,
  wager: number,
  payout: number,
  config: Config,
  options?: { lost?: boolean; balance?: number },
): string {
  if (ctx?.isPublic) {
    return publicResultFooter(wager, payout, config, options);
  }

  let footer = `Wager: **${formatCurrency(wager, config)}**`;
  if (payout > 0) {
    footer += `\nPayout: **${formatCurrency(payout, config)}**`;
  } else if (options?.lost) {
    footer += `\nLost: **${formatCurrency(wager, config)}**`;
  }
  if (options?.balance != null) {
    footer += privateBalanceLine(options.balance, config);
  }
  return footer;
}

export function formatPresentationOutcome(
  ctx: PresentationContext | undefined,
  wager: number,
  payout: number,
  config: Config,
  options?: { lost?: boolean; balance?: number },
): string {
  return outcomeFooter(ctx, wager, payout, config, options);
}

export async function runCoinflipAnimation(
  edit: PresentationEdit,
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
  side: CoinSide,
  config: Config,
  ctx?: PresentationContext,
) {
  await wallet.debit(guildId, userId, amount, "coinflip_bet", undefined, { side });
  const result = flipCoin();
  const frames = buildCoinflipFrames(result);

  for (let step = 0; step < frames.length; step++) {
    const spinning = step < frames.length - 1;
    const body = spinning
      ? frames[step]!
      : `${renderCoinflipResultFrame(result)}\nYour pick: **${side}**`;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("Coinflip")
          .setDescription(describePublic(ctx, body)),
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

  const body =
    `${renderCoinflipResultFrame(result)}\n` +
    `Your pick: **${side}**\n` +
    outcomeFooter(ctx, amount, payout, config, { lost: !won, balance });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(won ? "Coinflip — You Won!" : "Coinflip — You Lost")
        .setDescription(describePublic(ctx, body)),
    ],
    components: [],
  });
}

export async function runLuckyAnimation(
  edit: PresentationEdit,
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
  pick: number,
  config: Config,
  ctx?: PresentationContext,
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
          .setDescription(
            describePublic(ctx, renderLuckyFrame(frames[step]!, pick, spinning)),
          ),
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

  const body =
    `${renderLuckyFrame(roll, pick, false)}\n${description}\n` +
    outcomeFooter(ctx, amount, payout, config, { balance });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout > 0 ? 0x57f287 : 0xed4245)
        .setTitle(payout > 0 ? "Lucky Number — Winner!" : "Lucky Number — Miss")
        .setDescription(describePublic(ctx, body)),
    ],
    components: [],
  });
}
