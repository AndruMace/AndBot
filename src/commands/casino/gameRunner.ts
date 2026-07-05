import { EmbedBuilder, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import type { Config } from "../../config";
import type { WalletService } from "../../services/wallet";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import { runBlackjackWithWager } from "../house";
import { spinSlots, formatReels, calculateSlotsPayout, buildSlotsFrames, renderSlotsFrame, sleep, SLOTS_FRAME_DELAY_MS } from "../../services/casino/slots";
import { drawCard } from "../../services/casino/hilo";
import { rollLuckyNumber, calculateLuckyPayout } from "../../services/casino/lucky";
import {
  dropPlinkoIndex,
  calculatePlinkoPayout,
  generatePlinkoPath,
  renderPlinkoFrame,
  sleep,
  PLINKO_BUCKETS,
  PLINKO_FRAME_DELAY_MS,
} from "../../services/casino/plinko";
import { formatCurrency } from "../../utils/bets";
import type { CasinoGame } from "./types";
import { coinflipSideRow, hiloChoiceRow, minesCountRow, luckyNumberRows } from "./components";

type GameInteraction = ButtonInteraction | ModalSubmitInteraction;

export async function recordCasinoWager(
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
) {
  await wallet.setLastWager(guildId, userId, amount);
}

async function runSlotsAnimation(
  edit: (payload: { embeds: EmbedBuilder[] }) => Promise<unknown>,
  guildId: string,
  userId: string,
  amount: number,
  wallet: WalletService,
  config: Config,
) {
  await wallet.debit(guildId, userId, amount, "slots_bet");
  const reels = spinSlots();
  const frames = buildSlotsFrames(reels);

  for (let step = 0; step < frames.length; step++) {
    const spinning = step < frames.length - 1;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("Slots")
          .setDescription(
            `${renderSlotsFrame(frames[step]!)}${spinning ? "\n*Spinning...*" : ""}`,
          ),
      ],
    });
    if (spinning) await sleep(SLOTS_FRAME_DELAY_MS);
  }

  const { payout, description } = calculateSlotsPayout(reels, amount);
  let balance: number;
  if (payout > 0) {
    balance = await wallet.credit(guildId, userId, payout, "slots_win", undefined, { reels });
  } else {
    balance = await wallet.getBalance(guildId, userId);
  }

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout > 0 ? 0x57f287 : 0xed4245)
        .setTitle(payout > 0 ? "Slots — Winner!" : "Slots — No Luck")
        .setDescription(
          `${formatReels(reels)}\n\n${description}\nWager: **${formatCurrency(amount, config)}**` +
            (payout > 0 ? `\nPayout: **${formatCurrency(payout, config)}**` : "") +
            `\nBalance: **${formatCurrency(balance, config)}**`,
        ),
    ],
  });
}

async function runPlinkoAnimation(
  edit: (payload: { embeds: EmbedBuilder[] }) => Promise<unknown>,
  guildId: string,
  userId: string,
  amount: number,
  wallet: WalletService,
  config: Config,
) {
  await wallet.debit(guildId, userId, amount, "plinko_bet");
  const bucketIndex = dropPlinkoIndex();
  const bucket = PLINKO_BUCKETS[bucketIndex]!;
  const path = generatePlinkoPath(bucketIndex);

  for (let step = 0; step < path.length; step++) {
    const dropping = step < path.length - 1;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("Plinko")
          .setDescription(
            `${renderPlinkoFrame(path, step)}${dropping ? "\n*Dropping...*" : ""}`,
          ),
      ],
    });
    if (dropping) await sleep(PLINKO_FRAME_DELAY_MS);
  }

  const payout = calculatePlinkoPayout(amount, bucket);
  let balance: number;
  if (payout > 0) {
    balance = await wallet.credit(guildId, userId, payout, "plinko_win", undefined, {
      bucket: bucket.label,
    });
  } else {
    balance = await wallet.getBalance(guildId, userId);
  }

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout >= amount ? 0x57f287 : 0xf1c40f)
        .setTitle("Plinko — Result")
        .setDescription(
          `${renderPlinkoFrame(path, path.length - 1)}\n` +
            `Landed in **${bucket.label}**!\n` +
            `Wager: **${formatCurrency(amount, config)}**\n` +
            `Payout: **${formatCurrency(payout, config)}**\n` +
            `Balance: **${formatCurrency(balance, config)}**`,
        ),
    ],
  });
}

export async function executeCasinoGame(
  interaction: GameInteraction,
  game: CasinoGame,
  amount: number,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
  luckyPick?: number,
) {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  await recordCasinoWager(wallet, guildId, userId, amount);

  switch (game) {
    case "coinflip":
      if (interaction.isButton()) {
        await interaction.update({
          content: `Wager: **${formatCurrency(amount, config)}** — pick heads or tails:`,
          embeds: [],
          components: [coinflipSideRow(userId, amount)],
        });
      } else {
        await interaction.reply({
          content: `Wager: **${formatCurrency(amount, config)}** — pick heads or tails:`,
          components: [coinflipSideRow(userId, amount)],
          ephemeral: true,
        });
      }
      return;

    case "blackjack":
      if (interaction.isButton()) {
        await interaction.deferReply({ ephemeral: false });
      }
      await runBlackjackWithWager(interaction, wallet, blackjack, config, amount);
      return;

    case "slots": {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
      await runSlotsAnimation(
        (p) => interaction.editReply(p),
        guildId,
        userId,
        amount,
        wallet,
        config,
      );
      return;
    }

    case "hilo": {
      await wallet.debit(guildId, userId, amount, "hilo_bet");
      const card = drawCard();
      const payload = {
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("Hi-Lo")
            .setDescription(
              `Wager: **${formatCurrency(amount, config)}**\n\nCurrent card: **${card.label}**\n\nWill the next card be higher or lower?`,
            ),
        ],
        components: [hiloChoiceRow(userId, amount, card.rank)],
      };

      if (interaction.isButton()) {
        await interaction.update(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
      return;
    }

    case "lucky": {
      if (luckyPick == null) throw new Error("Lucky number required.");
      await wallet.debit(guildId, userId, amount, "lucky_bet", undefined, { pick: luckyPick });
      const roll = rollLuckyNumber();
      const { payout, description } = calculateLuckyPayout(amount, luckyPick, roll);
      let balance: number;
      if (payout > 0) {
        balance = await wallet.credit(guildId, userId, payout, "lucky_win", undefined, {
          pick: luckyPick,
          roll,
        });
      } else {
        balance = await wallet.getBalance(guildId, userId);
      }

      const payload = {
        embeds: [
          new EmbedBuilder()
            .setColor(payout > 0 ? 0x57f287 : 0xed4245)
            .setTitle(payout > 0 ? "Lucky Number — Winner!" : "Lucky Number — Miss")
            .setDescription(
              `Your pick: **${luckyPick}** · Rolled: **${roll}**\n${description}\n` +
                `Wager: **${formatCurrency(amount, config)}**` +
                (payout > 0 ? `\nPayout: **${formatCurrency(payout, config)}**` : "") +
                `\nBalance: **${formatCurrency(balance, config)}**`,
            ),
        ],
        components: [] as [],
      };

      if (interaction.isButton()) {
        await interaction.update(payload);
      } else {
        await interaction.reply(payload);
      }
      return;
    }

    case "mines": {
      const payload = {
        content: `Wager: **${formatCurrency(amount, config)}** — choose mine count:`,
        embeds: [],
        components: [minesCountRow(userId, amount)],
      };
      if (interaction.isButton()) {
        await interaction.update(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
      return;
    }

    case "plinko": {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
      await runPlinkoAnimation(
        (p) => interaction.editReply(p),
        guildId,
        userId,
        amount,
        wallet,
        config,
      );
    }
  }
}

export async function showLuckyNumberPicker(
  interaction: ButtonInteraction,
  amount: number,
  config: Config,
) {
  await interaction.update({
    content: `Wager: **${formatCurrency(amount, config)}** — pick your lucky number:`,
    embeds: [],
    components: luckyNumberRows(amount),
  });
}

export async function executeLuckyWithPick(
  interaction: GameInteraction,
  amount: number,
  pick: number,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  await executeCasinoGame(interaction, "lucky", amount, wallet, blackjack, config, pick);
}

export function randomLuckyPick(): number {
  return rollLuckyNumber();
}
