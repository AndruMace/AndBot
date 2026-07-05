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
import { playCoinflip, type CoinSide } from "../services/coinflip";
import { InsufficientFundsError } from "../services/wallet";
import { assertGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";
import { buildButtonId } from "../utils/buttons";
import {
  evaluateHand,
  formatHand,
  formatCard,
  type Card,
} from "../services/blackjack/engine";

function gameEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x57f287).setTitle(title).setDescription(description);
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
    const result = await playCoinflip(wallet, guildId, interaction.user.id, amount, side);

    await interaction.reply({
      embeds: [
        gameEmbed(
          result.won ? "Coinflip — You Won!" : "Coinflip — You Lost",
          `Your pick: **${side}**\nResult: **${result.result}**\nWager: **${formatCurrency(result.wager, config)}**\n${
            result.won
              ? `Payout: **${formatCurrency(result.payout, config)}**`
              : `Lost: **${formatCurrency(result.wager, config)}**`
          }\nNew balance: **${formatCurrency(result.balance, config)}**.`,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof InsufficientFundsError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

function buildBlackjackComponents(
  sessionId: string,
  canDouble: boolean,
  finished: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  if (finished) return [];

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
): EmbedBuilder {
  const playerCards = session.playerCards as Card[];
  const dealerCards = session.dealerCards as Card[];
  const playerValue = evaluateHand(playerCards);
  const dealerValue = evaluateHand(dealerCards);
  const effectiveWager = session.doubled ? session.wager * 2 : session.wager;

  let description = `Wager: **${formatCurrency(effectiveWager, config)}**\n\n`;
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

  if (finished) {
    const result = blackjack.getOutcome(session);
    const balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
    outcome =
      result === "blackjack"
        ? "Blackjack! You win 3:2."
        : result === "win"
          ? "You win!"
          : result === "push"
            ? "Push — wager returned."
            : "You lose.";
    outcome += `\nNew balance: **${formatCurrency(balanceAfter, config)}**.`;
  }

  const canDouble =
    !finished &&
    !session.doubled &&
    (session.playerCards as Card[]).length === 2 &&
    balance >= amount;

  const embed = buildBlackjackEmbed(session, config, finished, outcome);
  const components = buildBlackjackComponents(session.id, canDouble, finished);

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
      err instanceof BlackjackSessionError
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
    await interaction.reply({ content: "This is not your blackjack game.", ephemeral: true });
    return;
  }

  try {
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
    if (finished) {
      const result = blackjack.getOutcome(updated);
      const balanceAfter = await wallet.getBalance(guildId, interaction.user.id);
      outcome =
        result === "blackjack"
          ? "Blackjack! You win 3:2."
          : result === "win"
            ? "You win!"
            : result === "push"
              ? "Push — wager returned."
              : "You lose.";
      outcome += `\nNew balance: **${formatCurrency(balanceAfter, config)}**.`;
    }

    const balance = await wallet.getBalance(guildId, interaction.user.id);
    const canDouble =
      !finished &&
      !updated.doubled &&
      (updated.playerCards as Card[]).length === 2 &&
      balance >= updated.wager;

    const embed = buildBlackjackEmbed(updated, config, finished, outcome);
    const components = buildBlackjackComponents(updated.id, canDouble, finished);

    await interaction.update({ embeds: [embed], components });
  } catch (err) {
    if (err instanceof BlackjackSessionError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}
