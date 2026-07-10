import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import type { BlackjackSessionService } from "../services/blackjack/session";
import { BlackjackSessionError } from "../services/blackjack/session";
import { type CoinSide } from "../services/coinflip";
import { runCoinflipAnimation } from "./casino/presentations";
import { casinoLock, CasinoBusyError } from "../services/casino/lock";
import { postPublicGameMessage, buildGameHeader, prefixDescription, type SetupInteraction, rollbackCreatedSession } from "./casino/publicMessage";
import { casinoPostGameComponents, casinoStartOwnGameComponents } from "./casino/components";
import type { CasinoReplayOptions } from "./casino/replay";
import { InsufficientFundsError } from "../services/wallet";
import { assertGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";
import { buildButtonId } from "../utils/buttons";
import {
  evaluateHand,
  formatHand,
  formatCard,
  type Card,
  type GameOutcome,
} from "../services/blackjack/engine";
import { ephemeralOptions } from "../utils/discord";

function gameEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x57f287).setTitle(title).setDescription(description);
}

function formatBlackjackOutcome(
  result: GameOutcome,
  config: Config,
  balanceAfter?: number,
): string {
  const base =
    result === "blackjack"
      ? "Blackjack! You win 3:2."
      : result === "win"
        ? "You win!"
        : result === "push"
          ? "Push — wager returned."
          : "You lose.";

  if (balanceAfter == null) return base;
  return `${base}\nBalance: **${formatCurrency(balanceAfter, config)}**`;
}

export async function handleCoinflip(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const amount = interaction.options.getInteger("amount", true);
  const side = interaction.options.getString("side", true) as CoinSide;

  try {
    validateBetAmount(amount, config);
    await casinoLock.run(guildId, interaction.user.id, async () => {
      await interaction.deferReply();
      await runCoinflipAnimation(
        (p) => interaction.editReply(p),
        wallet,
        guildId,
        interaction.user.id,
        amount,
        side,
        config,
        {
          isPublic: true,
          userId: interaction.user.id,
          gameLabel: "Coinflip",
          wager: amount,
          config,
        },
      );
    });
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof InsufficientFundsError || err instanceof CasinoBusyError) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: err.message, embeds: [] });
      } else {
        await interaction.reply({ content: err.message, ephemeral: true });
      }
      return;
    }
    throw err;
  }
}

function buildBlackjackComponents(
  sessionId: string,
  canDouble: boolean,
  finished: boolean,
  replay?: CasinoReplayOptions,
): ActionRowBuilder<ButtonBuilder>[] {
  if (finished && replay) return casinoPostGameComponents(replay);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("bj", "hit", sessionId))
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("bj", "stand", sessionId))
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary),
  );

  if (canDouble) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonId("bj", "double", sessionId))
        .setLabel("Double")
        .setStyle(ButtonStyle.Danger),
    );
  }

  return [row];
}

type BlackjackEmbedOptions = {
  userId?: string;
  isPublic?: boolean;
  wager?: number;
};

function buildBlackjackEmbed(
  session: {
    playerCards: string[];
    dealerCards: string[];
    wager: number;
    doubled: boolean;
    status: string;
  },
  config: Config,
  revealDealer = false,
  outcome?: string,
  options?: BlackjackEmbedOptions,
): EmbedBuilder {
  const playerCards = session.playerCards as Card[];
  const dealerCards = session.dealerCards as Card[];
  const playerValue = evaluateHand(playerCards);
  const dealerValue = evaluateHand(dealerCards);
  const effectiveWager = session.doubled ? session.wager * 2 : session.wager;

  let description = "";
  if (options?.isPublic && options.userId) {
    description =
      buildGameHeader(
        options.userId,
        "Blackjack",
        options.wager ?? session.wager,
        config,
      ) + "\n\n";
  }

  description += `Wager: **${formatCurrency(effectiveWager, config)}**\n\n`;
  description += `**Your hand** (${playerValue.total}${playerValue.soft ? " soft" : ""}): ${formatHand(playerCards)}\n`;
  description += revealDealer
    ? `**Dealer** (${dealerValue.total}): ${formatHand(dealerCards)}\n`
    : `**Dealer**: ${formatCard(dealerCards[0]!)} ??\n`;

  if (outcome) {
    description += `\n**Result:** ${outcome}`;
  } else if (session.status === "active") {
    description += "\nChoose an action below.";
  }

  return gameEmbed("Blackjack", description);
}

export async function runBlackjackWithWager(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
  amount: number,
  options?: { publishMode?: "interaction" | "channel" },
) {
  const guildId = assertGuild(interaction);

  return casinoLock.run(guildId, interaction.user.id, async () => {
    return runBlackjackWithWagerInner(
      interaction,
      wallet,
      blackjack,
      config,
      amount,
      options,
    );
  });
}

async function runBlackjackWithWagerInner(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
  amount: number,
  options?: { publishMode?: "interaction" | "channel" },
) {
  const guildId = assertGuild(interaction);
  const channelId = interaction.channelId;
  if (!channelId) {
    throw new Error("This command can only be used in a server channel.");
  }

  const isChannelPublish = options?.publishMode === "channel";

  validateBetAmount(amount, config);
  const balance = await wallet.getBalance(guildId, interaction.user.id);
  if (balance < amount) {
    throw new InsufficientFundsError();
  }

  if (isChannelPublish) {
    let finished = false;
    let balanceAfter: number | undefined;
    let sessionId = "";

    try {
      const { message } = await postPublicGameMessage(interaction as SetupInteraction, async () => {
        const session = await blackjack.startSession(
          guildId,
          interaction.user.id,
          channelId,
          amount,
        );
        sessionId = session.id;
        finished = session.status === "completed";

        let outcome: string | undefined;
        if (finished) {
          const result = blackjack.getOutcome(session);
          balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
          outcome = formatBlackjackOutcome(result, config, balanceAfter);
        }

        const canDouble =
          !finished &&
          !session.doubled &&
          (session.playerCards as Card[]).length === 2 &&
          balance >= amount;

        const replay: CasinoReplayOptions = {
          userId: interaction.user.id,
          game: "blackjack",
          amount,
        };

        return {
          embeds: [
            buildBlackjackEmbed(session, config, finished, outcome, {
              userId: interaction.user.id,
              isPublic: true,
              wager: amount,
            }),
          ],
          components: buildBlackjackComponents(session.id, canDouble, finished, replay),
        };
      });

      await blackjack.setMessageId(sessionId, message.id);
    } catch (err) {
      await rollbackCreatedSession(
        err,
        sessionId,
        (id) => blackjack.getSession(id),
        (session) => blackjack.expireSession(session),
      );
      throw err;
    }
    return;
  }

  const session = await blackjack.startSession(
    guildId,
    interaction.user.id,
    channelId,
    amount,
  );

  const finished = session.status === "completed";
  let outcome: string | undefined;
  let balanceAfter: number | undefined;

  if (finished) {
    const result = blackjack.getOutcome(session);
    balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
    outcome = formatBlackjackOutcome(result, config, balanceAfter);
  }

  const canDouble =
    !finished &&
    !session.doubled &&
    (session.playerCards as Card[]).length === 2 &&
    balance >= amount;

  const embed = buildBlackjackEmbed(session, config, finished, outcome, {
    userId: interaction.user.id,
    wager: amount,
  });
  const replay: CasinoReplayOptions = {
    userId: interaction.user.id,
    game: "blackjack",
    amount,
  };
  const components = buildBlackjackComponents(session.id, canDouble, finished, replay);

  const replyMessage =
    interaction.deferred || interaction.replied
      ? await interaction.editReply({
          embeds: [embed],
          components,
          fetchReply: true,
        })
      : await interaction.reply({
          embeds: [embed],
          components,
          fetchReply: true,
        });

  await blackjack.setMessageId(session.id, replyMessage.id);
}

export async function replayBlackjackOnMessage(
  interaction: ButtonInteraction,
  amount: number,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const channelId = interaction.channelId;
  if (!channelId) {
    throw new Error("This command can only be used in a server channel.");
  }

  validateBetAmount(amount, config);
  const balance = await wallet.getBalance(guildId, interaction.user.id);
  if (balance < amount) {
    throw new InsufficientFundsError();
  }

  const session = await blackjack.startSession(
    guildId,
    interaction.user.id,
    channelId,
    amount,
  );

  const finished = session.status === "completed";
  let outcome: string | undefined;
  let balanceAfter: number | undefined;

  if (finished) {
    const result = blackjack.getOutcome(session);
    balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
    outcome = formatBlackjackOutcome(result, config, balanceAfter);
  }

  const canDouble =
    !finished &&
    !session.doubled &&
    (session.playerCards as Card[]).length === 2 &&
    balance >= amount;

  const replay: CasinoReplayOptions = {
    userId: interaction.user.id,
    game: "blackjack",
    amount,
  };

  await interaction.message.edit({
    embeds: [
      buildBlackjackEmbed(session, config, finished, outcome, {
        userId: interaction.user.id,
        isPublic: true,
        wager: amount,
      }),
    ],
    components: buildBlackjackComponents(session.id, canDouble, finished, replay),
  });

  await blackjack.setMessageId(session.id, interaction.message.id);
}

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  const amount = interaction.options.getInteger("amount", true);

  try {
    await runBlackjackWithWager(interaction, wallet, blackjack, config, amount);
  } catch (err) {
    if (
      err instanceof BetValidationError ||
      err instanceof InsufficientFundsError ||
      err instanceof BlackjackSessionError ||
      err instanceof CasinoBusyError
    ) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
  action: "hit" | "stand" | "double",
  sessionId: string,
) {
  const guildId = assertGuild(interaction);
  const session = await blackjack.getSession(sessionId);

  if (!session) {
    await interaction.reply({ content: "Blackjack session not found.", ephemeral: true });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({
      content: "This is not your blackjack game.",
      components: casinoStartOwnGameComponents(interaction.user.id, "blackjack"),
      ephemeral: true,
    });
    return;
  }

  try {
    await casinoLock.run(guildId, interaction.user.id, async () => {
      let updated = session;
      let finished = false;

      if (action === "hit") {
        const result = await blackjack.hitAction(session);
        updated = result.session;
        finished = result.finished;
      } else if (action === "stand") {
        updated = await blackjack.standAction(session);
        finished = true;
      } else {
        const result = await blackjack.doubleAction(session);
        updated = result.session;
        finished = true;
      }

      let outcome: string | undefined;
      let balanceAfter: number | undefined;
      if (finished) {
        const result = blackjack.getOutcome(updated);
        balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
        outcome = formatBlackjackOutcome(result, config, balanceAfter);
      }

      const balance = await wallet.getBalance(guildId, interaction.user.id);
      const canDouble =
        !finished &&
        !updated.doubled &&
        (updated.playerCards as Card[]).length === 2 &&
        balance >= updated.wager;

      const embed = buildBlackjackEmbed(updated, config, finished, outcome, {
        userId: interaction.user.id,
        isPublic: true,
        wager: updated.wager,
      });
      const replay: CasinoReplayOptions = {
        userId: interaction.user.id,
        game: "blackjack",
        amount: updated.wager,
      };
      const components = buildBlackjackComponents(updated.id, canDouble, finished, replay);

      await interaction.update({ embeds: [embed], components });
    });
  } catch (err) {
    if (err instanceof BlackjackSessionError || err instanceof CasinoBusyError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}
