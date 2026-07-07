import { EmbedBuilder, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import type { Config } from "../../config";
import type { WalletService } from "../../services/wallet";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import { runBlackjackWithWager } from "../house";
import {
  spinSlots,
  formatReels,
  calculateSlotsPayout,
  buildSlotsFrames,
  renderSlotsFrame,
  sleep,
  SLOTS_FRAME_DELAY_MS,
} from "../../services/casino/slots";
import { drawCard } from "../../services/casino/hilo";
import { rollLuckyNumber } from "../../services/casino/lucky";
import { runLuckyAnimation, type PresentationContext } from "./presentations";
import {
  dropPlinkoIndex,
  calculatePlinkoPayout,
  generatePlinkoPath,
  renderPlinkoFrame,
  PLINKO_BUCKETS,
  PLINKO_FRAME_DELAY_MS,
} from "../../services/casino/plinko";
import { formatCurrency } from "../../utils/bets";
import { getCasinoGameLabel, type CasinoGame } from "./types";
import { coinflipSideRow, hiloChoiceRow, minesCountRow, luckyNumberRows, casinoPostGameComponents } from "./components";
import {
  buildGameHeader,
  postPublicGameMessage,
  prefixDescription,
  publicResultFooter,
  type PublicMessageEdit,
} from "./publicMessage";

type GameInteraction = ButtonInteraction | ModalSubmitInteraction;

function presentationContext(
  userId: string,
  game: CasinoGame,
  wager: number,
  config: Config,
): PresentationContext {
  return {
    isPublic: true,
    userId,
    gameLabel: getCasinoGameLabel(game),
    wager,
    config,
  };
}

function describePublic(
  userId: string,
  game: CasinoGame,
  wager: number,
  config: Config,
  body: string,
): string {
  return prefixDescription(
    buildGameHeader(userId, getCasinoGameLabel(game), wager, config),
    body,
  );
}

export async function recordCasinoWager(
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
) {
  await wallet.setLastWager(guildId, userId, amount);
}

async function runSlotsAnimation(
  edit: PublicMessageEdit,
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
    const body = `${renderSlotsFrame(frames[step]!)}${spinning ? "\n*Spinning...*" : ""}`;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("Slots")
          .setDescription(describePublic(userId, "slots", amount, config, body)),
      ],
    });
    if (spinning) await sleep(SLOTS_FRAME_DELAY_MS);
  }

  const { payout, description } = calculateSlotsPayout(reels, amount);
  if (payout > 0) {
    await wallet.credit(guildId, userId, payout, "slots_win", undefined, { reels });
  }
  const balance = await wallet.getBalance(guildId, userId);

  const body =
    `${formatReels(reels)}\n\n${description}\n` +
    publicResultFooter(amount, payout, config, { lost: payout === 0, balance });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout > 0 ? 0x57f287 : 0xed4245)
        .setTitle(payout > 0 ? "Slots — Winner!" : "Slots — No Luck")
        .setDescription(describePublic(userId, "slots", amount, config, body)),
    ],
    components: casinoPostGameComponents("slots"),
  });
}

async function runPlinkoAnimation(
  edit: PublicMessageEdit,
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
    const body = `${renderPlinkoFrame(path, step)}${dropping ? "\n*Dropping...*" : ""}`;
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("Plinko")
          .setDescription(describePublic(userId, "plinko", amount, config, body)),
      ],
    });
    if (dropping) await sleep(PLINKO_FRAME_DELAY_MS);
  }

  const payout = calculatePlinkoPayout(amount, bucket);
  if (payout > 0) {
    await wallet.credit(guildId, userId, payout, "plinko_win", undefined, {
      bucket: bucket.label,
    });
  }
  const balance = await wallet.getBalance(guildId, userId);

  const body =
    `${renderPlinkoFrame(path, path.length - 1)}\n` +
    `Landed in **${bucket.label}**!\n` +
    publicResultFooter(amount, payout, config, { lost: payout < amount, balance });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(payout >= amount ? 0x57f287 : 0xf1c40f)
        .setTitle("Plinko — Result")
        .setDescription(describePublic(userId, "plinko", amount, config, body)),
    ],
    components: casinoPostGameComponents("plinko"),
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
    case "coinflip": {
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Coinflip")
        .setDescription(
          describePublic(userId, game, amount, config, "Pick heads or tails:"),
        );
      await postPublicGameMessage(interaction, {
        embeds: [embed],
        components: [coinflipSideRow(userId, amount)],
      });
      return;
    }

    case "blackjack":
      await runBlackjackWithWager(interaction, wallet, blackjack, config, amount, {
        publishMode: "channel",
      });
      return;

    case "slots": {
      const { edit } = await postPublicGameMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("Slots")
            .setDescription(
              describePublic(userId, game, amount, config, "*Spinning...*"),
            ),
        ],
      });
      await runSlotsAnimation(edit, guildId, userId, amount, wallet, config);
      return;
    }

    case "hilo": {
      await postPublicGameMessage(interaction, async () => {
        await wallet.debit(guildId, userId, amount, "hilo_bet");
        const card = drawCard();
        const body =
          `Current card: **${card.label}**\n\nWill the next card be higher or lower?`;
        return {
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("Hi-Lo")
              .setDescription(describePublic(userId, game, amount, config, body)),
          ],
          components: [hiloChoiceRow(userId, amount, card.rank)],
        };
      });
      return;
    }

    case "lucky": {
      if (luckyPick == null) throw new Error("Lucky number required.");
      const ctx = presentationContext(userId, game, amount, config);
      const { edit } = await postPublicGameMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("Lucky Number")
            .setDescription(
              describePublic(userId, game, amount, config, "*Rolling...*"),
            ),
        ],
      });
      await runLuckyAnimation(edit, wallet, guildId, userId, amount, luckyPick, config, ctx);
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
      const { edit } = await postPublicGameMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("Plinko")
            .setDescription(
              describePublic(userId, game, amount, config, "*Dropping...*"),
            ),
        ],
      });
      await runPlinkoAnimation(edit, guildId, userId, amount, wallet, config);
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
