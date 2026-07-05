import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import {
  PvpChallengeError,
  createPvpChallengeService,
  determineRpsWinner,
  determineDiceWinner,
  rollDice,
  type RpsChoice,
} from "../services/pvp/challenges";
import type { Database } from "../db/client";
import { assertGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";
import { buildButtonId } from "../utils/buttons";

function challengeEmbed(
  title: string,
  description: string,
  config: Config,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Currency: ${config.CURRENCY_NAME}` });
}

function buildAcceptDeclineRow(challengeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "accept", challengeId))
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "decline", challengeId))
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildRpsRow(challengeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "rps", challengeId, "rock"))
      .setLabel("Rock")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🪨"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "rps", challengeId, "paper"))
      .setLabel("Paper")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📄"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "rps", challengeId, "scissors"))
      .setLabel("Scissors")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("✂️"),
  );
}

function buildDiceRow(challengeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "dice", challengeId, "roll"))
      .setLabel("Roll Dice")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎲"),
  );
}

export async function handleRpsChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const opponent = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (opponent.bot) {
    await interaction.reply({ content: "You cannot challenge bots.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    const pvp = createPvpChallengeService(db, wallet, config);
    const challenge = await pvp.createChallenge(
      guildId,
      interaction.channelId,
      interaction.user.id,
      opponent.id,
      "rps",
      amount,
    );

    const embed = challengeEmbed(
      "Rock Paper Scissors Challenge",
      `<@${opponent.id}>, you have been challenged by **${interaction.user.username}**!\nWager: **${formatCurrency(amount, config)}**\n\nAccept or decline below.`,
      config,
    );

    const reply = await interaction.reply({
      embeds: [embed],
      components: [buildAcceptDeclineRow(challenge.id)],
      fetchReply: true,
    });

    await pvp.setMessageId(challenge.id, reply.id);
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleDiceChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const opponent = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (opponent.bot) {
    await interaction.reply({ content: "You cannot challenge bots.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    const pvp = createPvpChallengeService(db, wallet, config);
    const challenge = await pvp.createChallenge(
      guildId,
      interaction.channelId,
      interaction.user.id,
      opponent.id,
      "dice",
      amount,
    );

    const embed = challengeEmbed(
      "Dice Duel Challenge",
      `<@${opponent.id}>, you have been challenged by **${interaction.user.username}**!\nWager: **${formatCurrency(amount, config)}**\n\nAccept or decline below.`,
      config,
    );

    const reply = await interaction.reply({
      embeds: [embed],
      components: [buildAcceptDeclineRow(challenge.id)],
      fetchReply: true,
    });

    await pvp.setMessageId(challenge.id, reply.id);
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handlePvpAcceptDecline(
  interaction: ButtonInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
  action: "accept" | "decline",
  challengeId: string,
) {
  assertGuild(interaction);
  const pvp = createPvpChallengeService(db, wallet, config);
  const challenge = await pvp.getChallenge(challengeId);

  if (!challenge) {
    await interaction.reply({ content: "Challenge not found.", ephemeral: true });
    return;
  }

  try {
    if (action === "decline") {
      await pvp.declineChallenge(challenge, interaction.user.id);
      await interaction.update({
        embeds: [
          challengeEmbed(
            "Challenge Declined",
            `<@${interaction.user.id}> declined the challenge.\nWager refunded to challenger.`,
            config,
          ),
        ],
        components: [],
      });
      return;
    }

    const updated = await pvp.acceptChallenge(challenge, interaction.user.id);

    if (updated.gameType === "rps") {
      await interaction.update({
        embeds: [
          challengeEmbed(
            "Rock Paper Scissors",
            `Challenge accepted! Wager: **${formatCurrency(updated.wager, config)}**\n<@${updated.challengerId}> vs <@${updated.opponentId}>\n\nBoth players, pick your move:`,
            config,
          ),
        ],
        components: [buildRpsRow(updated.id)],
      });
    } else {
      await interaction.update({
        embeds: [
          challengeEmbed(
            "Dice Duel",
            `Challenge accepted! Wager: **${formatCurrency(updated.wager, config)}**\n<@${updated.challengerId}> vs <@${updated.opponentId}>\n\nBoth players, roll the dice:`,
            config,
          ),
        ],
        components: [buildDiceRow(updated.id)],
      });
    }
  } catch (err) {
    if (err instanceof PvpChallengeError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleRpsChoice(
  interaction: ButtonInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
  challengeId: string,
  choice: RpsChoice,
) {
  assertGuild(interaction);
  const pvp = createPvpChallengeService(db, wallet, config);
  const challenge = await pvp.getChallenge(challengeId);

  if (!challenge || challenge.status !== "active") {
    await interaction.reply({ content: "This challenge is not active.", ephemeral: true });
    return;
  }

  const isChallenger = interaction.user.id === challenge.challengerId;
  const isOpponent = interaction.user.id === challenge.opponentId;
  if (!isChallenger && !isOpponent) {
    await interaction.reply({ content: "You are not part of this challenge.", ephemeral: true });
    return;
  }

  if (isChallenger && challenge.challengerChoice) {
    await interaction.reply({ content: "You already picked.", ephemeral: true });
    return;
  }
  if (isOpponent && challenge.opponentChoice) {
    await interaction.reply({ content: "You already picked.", ephemeral: true });
    return;
  }

  const updateData = isChallenger
    ? { challengerChoice: choice }
    : { opponentChoice: choice };

  const updated = await pvp.updateChallenge(challengeId, updateData);

  if (!updated.challengerChoice || !updated.opponentChoice) {
    await interaction.reply({
      content: `You picked **${choice}**. Waiting for the other player...`,
      ephemeral: true,
    });
    return;
  }

  const result = determineRpsWinner(
    updated.challengerChoice as RpsChoice,
    updated.opponentChoice as RpsChoice,
  );

  let description: string;
  let winnerId: string | null = null;

  if (result === "tie") {
    description = `Both picked **${updated.challengerChoice}**. It's a tie — wagers refunded.`;
    await pvp.completeChallenge(updated, null);
  } else {
    winnerId = result === "challenger" ? updated.challengerId : updated.opponentId;
    description = `<@${updated.challengerId}> picked **${updated.challengerChoice}**\n<@${updated.opponentId}> picked **${updated.opponentChoice}**\n\n<@${winnerId}> wins **${formatCurrency(updated.wager * 2, config)}**!`;
    await pvp.completeChallenge(updated, winnerId);
  }

  await interaction.update({
    embeds: [challengeEmbed("Rock Paper Scissors — Result", description, config)],
    components: [],
  });
}

export async function handleDiceRoll(
  interaction: ButtonInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
  challengeId: string,
) {
  assertGuild(interaction);
  const pvp = createPvpChallengeService(db, wallet, config);
  const challenge = await pvp.getChallenge(challengeId);

  if (!challenge || challenge.status !== "active") {
    await interaction.reply({ content: "This challenge is not active.", ephemeral: true });
    return;
  }

  const isChallenger = interaction.user.id === challenge.challengerId;
  const isOpponent = interaction.user.id === challenge.opponentId;
  if (!isChallenger && !isOpponent) {
    await interaction.reply({ content: "You are not part of this challenge.", ephemeral: true });
    return;
  }

  if (isChallenger && challenge.challengerRoll != null) {
    await interaction.reply({ content: "You already rolled.", ephemeral: true });
    return;
  }
  if (isOpponent && challenge.opponentRoll != null) {
    await interaction.reply({ content: "You already rolled.", ephemeral: true });
    return;
  }

  const roll = rollDice();
  const updateData = isChallenger ? { challengerRoll: roll } : { opponentRoll: roll };
  const updated = await pvp.updateChallenge(challengeId, updateData);

  if (updated.challengerRoll == null || updated.opponentRoll == null) {
    await interaction.reply({
      content: `You rolled **${roll}**. Waiting for the other player...`,
      ephemeral: true,
    });
    return;
  }

  const result = determineDiceWinner(updated.challengerRoll, updated.opponentRoll);

  let description: string;
  if (result === "tie") {
    description = `Both rolled **${updated.challengerRoll}**. It's a tie — wagers refunded.`;
    await pvp.completeChallenge(updated, null);
  } else {
    const winnerId =
      result === "challenger" ? updated.challengerId : updated.opponentId;
    description = `<@${updated.challengerId}> rolled **${updated.challengerRoll}**\n<@${updated.opponentId}> rolled **${updated.opponentRoll}**\n\n<@${winnerId}> wins **${formatCurrency(updated.wager * 2, config)}**!`;
    await pvp.completeChallenge(updated, winnerId);
  }

  await interaction.update({
    embeds: [challengeEmbed("Dice Duel — Result", description, config)],
    components: [],
  });
}
