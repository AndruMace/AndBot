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
  formatSlotsJackpotLine,
  sleep,
  SLOTS_FRAME_DELAY_MS,
} from "../../services/casino/slots";
import type { SlotsJackpotService } from "../../services/casino/slotsJackpot";
import { drawCard } from "../../services/casino/hilo";
import { rollLuckyNumber } from "../../services/casino/lucky";
import {
  calculateKenoPayout,
  drawKenoNumbers,
  formatKenoNumbers,
  generateQuickPick,
} from "../../services/casino/keno";
import {
  buildKenoRevealFrames,
  KENO_FRAME_DELAY_MS,
  renderKenoFrame,
  sleep as kenoSleep,
} from "../../services/casino/kenoAnim";
import { runLuckyAnimation, runKenoAnimation, type PresentationContext } from "./presentations";
import {
  dropPlinkoIndex,
  calculatePlinkoPayout,
  generatePlinkoPath,
  renderPlinkoFrame,
  PLINKO_BUCKETS,
  PLINKO_FRAME_DELAY_MS,
} from "../../services/casino/plinko";
import { formatCurrency } from "../../utils/bets";
import {
  calculateRoulettePayout,
  ROULETTE_BET_LABELS,
  spinRoulette,
  type RouletteBet,
} from "../../services/casino/roulette";
import {
  buildRouletteSpinIndices,
  renderRouletteFrame,
  ROULETTE_FRAME_DELAYS,
  sleep as rouletteSleep,
} from "../../services/casino/rouletteAnim";
import { getCasinoGameLabel, type CasinoGame } from "./types";
import {
  coinflipSideRow,
  hiloChoiceRow,
  minesCountRow,
  luckyNumberRows,
  kenoPickRows,
  rouletteBetRow,
  casinoPostGameComponents,
} from "./components";
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

export async function runSlotsAnimation(
  edit: PublicMessageEdit,
  guildId: string,
  userId: string,
  amount: number,
  wallet: WalletService,
  slotsJackpot: SlotsJackpotService,
  config: Config,
  startingJackpot?: number,
) {
  const reels = spinSlots();
  const { payout: basePayout, description, isJackpot } = calculateSlotsPayout(reels, amount);
  const netLoss = Math.max(0, amount - basePayout);
  const potBeforeSpin =
    startingJackpot ?? (await slotsJackpot.getJackpot(guildId)).accumulatedLosses;

  const settlement = (async () => {
    let balance = await wallet.debit(guildId, userId, amount, "slots_bet");
    const { accumulatedLosses: updatedJackpot, jackpotPayout } = await slotsJackpot.settleSpin(
      guildId,
      userId,
      netLoss,
      isJackpot,
      potBeforeSpin,
    );

    if (basePayout > 0) {
      balance = await wallet.credit(guildId, userId, basePayout, "slots_win", undefined, { reels });
    }
    if (jackpotPayout > 0) {
      balance = await wallet.credit(guildId, userId, jackpotPayout, "slots_jackpot_win", undefined, {
        reels,
      });
    }

    return { updatedJackpot, jackpotPayout, balance };
  })();

  const frames = buildSlotsFrames(reels);
  const jackpotLine = formatSlotsJackpotLine(potBeforeSpin, config);

  for (let step = 0; step < frames.length; step++) {
    const spinning = step < frames.length - 1;
    const body =
      `${jackpotLine}\n\n${renderSlotsFrame(frames[step]!)}` +
      (spinning ? "\n*Spinning...*" : "");
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

  const { updatedJackpot, jackpotPayout, balance } = await settlement;
  const totalPayout = basePayout + jackpotPayout;
  const won = totalPayout > amount;
  const push = totalPayout === amount && totalPayout > 0;

  let resultText = `${formatReels(reels)}\n\n${description}`;
  if (jackpotPayout > 0) {
    resultText += `\nProgressive jackpot: **${formatCurrency(jackpotPayout, config)}**!`;
  }

  const resultBody =
    `${formatSlotsJackpotLine(updatedJackpot, config)}\n\n${resultText}\n` +
    publicResultFooter(amount, totalPayout, config, {
      lost: totalPayout < amount,
      balance,
    });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(
          jackpotPayout > 0 ? 0xf1c40f : won ? 0x57f287 : push ? 0xe67e22 : 0xed4245,
        )
        .setTitle(
          jackpotPayout > 0
            ? "Slots — Progressive Jackpot!"
            : won
              ? "Slots — Winner!"
              : push
                ? "Slots — Break Even"
                : "Slots — No Luck",
        )
        .setDescription(describePublic(userId, "slots", amount, config, resultBody)),
    ],
    components: casinoPostGameComponents({
      userId,
      game: "slots",
      amount,
    }),
  });
}

export async function runRouletteAnimation(
  edit: PublicMessageEdit,
  guildId: string,
  userId: string,
  amount: number,
  bet: RouletteBet,
  wallet: WalletService,
  config: Config,
) {
  const result = spinRoulette();
  const { payout, won, description } = calculateRoulettePayout(amount, bet, result);

  const settlement = (async () => {
    let balance = await wallet.debit(guildId, userId, amount, "roulette_bet", undefined, {
      bet,
      result,
    });
    if (payout > 0) {
      balance = await wallet.credit(guildId, userId, payout, "roulette_win", undefined, {
        bet,
        result,
      });
    }
    return balance;
  })();

  const indices = buildRouletteSpinIndices(result);

  for (let step = 0; step < indices.length; step++) {
    const spinning = step < indices.length - 1;
    const body = renderRouletteFrame(indices[step]!, bet, spinning);
    await edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc0392b)
          .setTitle("Roulette")
          .setDescription(describePublic(userId, "roulette", amount, config, body)),
      ],
    });
    if (spinning && step < ROULETTE_FRAME_DELAYS.length) {
      await rouletteSleep(ROULETTE_FRAME_DELAYS[step]!);
    }
  }

  const balance = await settlement;
  const body =
    `${renderRouletteFrame(indices[indices.length - 1]!, bet, false)}\n` +
    `${description}\n` +
    `Your bet: **${ROULETTE_BET_LABELS[bet]}**\n` +
    publicResultFooter(amount, payout, config, { lost: !won, balance });

  await edit({
    embeds: [
      new EmbedBuilder()
        .setColor(won ? 0x57f287 : 0xed4245)
        .setTitle(won ? "Roulette — Winner!" : "Roulette — No Luck")
        .setDescription(describePublic(userId, "roulette", amount, config, body)),
    ],
    components: casinoPostGameComponents({
      userId,
      game: "roulette",
      amount,
      rouletteBet: bet,
    }),
  });
}

export async function runPlinkoAnimation(
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
    components: casinoPostGameComponents({
      userId,
      game: "plinko",
      amount,
    }),
  });
}

export async function executeCasinoGame(
  interaction: GameInteraction,
  game: CasinoGame,
  amount: number,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  slotsJackpot: SlotsJackpotService,
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

    case "roulette": {
      const embed = new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle("Roulette")
        .setDescription(
          describePublic(userId, game, amount, config, "Pick your bet:"),
        );
      await postPublicGameMessage(interaction, {
        embeds: [embed],
        components: [rouletteBetRow(userId, amount)],
      });
      return;
    }

    case "blackjack":
      await runBlackjackWithWager(interaction, wallet, blackjack, config, amount, {
        publishMode: "channel",
      });
      return;

    case "slots": {
      const startingJackpot = (await slotsJackpot.getJackpot(guildId)).accumulatedLosses;
      const { edit } = await postPublicGameMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("Slots")
            .setDescription(
              describePublic(
                userId,
                game,
                amount,
                config,
                `${formatSlotsJackpotLine(startingJackpot, config)}\n\n*Spinning...*`,
              ),
            ),
        ],
      });
      await runSlotsAnimation(
        edit,
        guildId,
        userId,
        amount,
        wallet,
        slotsJackpot,
        config,
        startingJackpot,
      );
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
      return;
    }

    case "keno": {
      const payload = {
        content: `Wager: **${formatCurrency(amount, config)}** — choose your numbers:`,
        embeds: [],
        components: kenoPickRows(amount),
      };
      if (interaction.isButton()) {
        await interaction.update(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
      return;
    }
  }
}

export async function showKenoPicker(
  interaction: ButtonInteraction,
  amount: number,
  config: Config,
) {
  await interaction.update({
    content: `Wager: **${formatCurrency(amount, config)}** — choose your numbers:`,
    embeds: [],
    components: kenoPickRows(amount),
  });
}

export async function executeKenoWithPicks(
  interaction: GameInteraction,
  amount: number,
  picks: number[],
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const ctx = presentationContext(userId, "keno", amount, config);

  await recordCasinoWager(wallet, guildId, userId, amount);

  const { edit } = await postPublicGameMessage(interaction, {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Keno")
        .setDescription(describePublic(userId, "keno", amount, config, "*Drawing numbers...*")),
    ],
  });

  await runKenoAnimation(edit, wallet, guildId, userId, amount, picks, config, ctx);
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
  slotsJackpot: SlotsJackpotService,
  config: Config,
) {
  await executeCasinoGame(interaction, "lucky", amount, wallet, blackjack, slotsJackpot, config, pick);
}

export function randomLuckyPick(): number {
  return rollLuckyNumber();
}
