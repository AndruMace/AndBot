import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import {
  PvpChallengeError,
  createPvpChallengeService,
  determineRpsWinner,
  determineDiceWinner,
  determineCoinflipWinner,
  rollTwoDice,
  sumDice,
  formatDiceRoll,
  flipCoin,
  oppositeSide,
  pullRouletteTrigger,
  parseMetadata,
  type RpsChoice,
  type CoinSide,
  type RoundWinner,
} from "../services/pvp/challenges";
import type { Database } from "../db/client";
import type { PvpChallenge, PvpGameType, PvpMatchFormat } from "../db/schema";
import { buildRoundOutcome, formatMatchLabel, scoreLine } from "../services/pvp/match";
import { assertGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";
import { buildButtonId } from "../utils/buttons";

const GAME_TITLES: Record<PvpGameType, string> = {
  rps: "Rock Paper Scissors",
  dice: "Dice Duel",
  russian_roulette: "Russian Roulette",
  coinflip_duel: "Coinflip Duel",
};

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

function parseMatchFormat(value: string | null): PvpMatchFormat {
  return value === "best_of_3" ? "best_of_3" : "single";
}

function roundHeader(challenge: PvpChallenge, config: Config): string {
  const lines = [
    `Wager: **${formatCurrency(challenge.wager, config)}** · ${formatMatchLabel(challenge.matchFormat)}`,
    `<@${challenge.challengerId}> vs <@${challenge.opponentId}>`,
  ];
  if (challenge.matchFormat === "best_of_3") {
    lines.push(scoreLine(challenge));
  }
  if (challenge.roundNumber > 1 || challenge.matchFormat === "best_of_3") {
    lines.push(`Round **${challenge.roundNumber}**`);
  }
  return lines.join("\n");
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
      .setLabel("Roll 2 Dice")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎲"),
  );
}

function buildRouletteRow(challengeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("pvp", "roulette", challengeId, "pull"))
      .setLabel("Pull Trigger")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔫"),
  );
}

function buildActiveGameView(challenge: PvpChallenge, config: Config) {
  const header = roundHeader(challenge, config);
  const title = GAME_TITLES[challenge.gameType];

  switch (challenge.gameType) {
    case "rps":
      return {
        embed: challengeEmbed(title, `${header}\n\nBoth players, pick your move:`, config),
        components: [buildRpsRow(challenge.id)],
      };
    case "dice":
      return {
        embed: challengeEmbed(
          title,
          `${header}\n\nBoth players, roll **2 dice** (higher total wins):`,
          config,
        ),
        components: [buildDiceRow(challenge.id)],
      };
    case "russian_roulette": {
      const roulette = parseMetadata(challenge.metadata).roulette;
      const turnLine = roulette
        ? `<@${roulette.turnUserId}>, pull the trigger:`
        : "Pull the trigger:";
      return {
        embed: challengeEmbed(title, `${header}\n\n${turnLine}`, config),
        components: [buildRouletteRow(challenge.id)],
      };
    }
    case "coinflip_duel": {
      const side = challenge.challengerChoice as CoinSide;
      return {
        embed: challengeEmbed(
          title,
          `${header}\n\n<@${challenge.challengerId}> picked **${side}** · <@${challenge.opponentId}> has **${oppositeSide(side)}**`,
          config,
        ),
        components: [],
      };
    }
  }
}

async function postPvpChallengeInChannel(
  channel: TextChannel,
  guildId: string,
  challengerId: string,
  challengerName: string,
  db: Database,
  wallet: WalletService,
  config: Config,
  params: {
    gameType: PvpGameType;
    opponentId: string;
    amount: number;
    matchFormat: PvpMatchFormat;
    challengerChoice?: string;
    challengeDetails?: string;
  },
) {
  const pvp = createPvpChallengeService(db, wallet, config);
  const challenge = await pvp.createChallenge(
    guildId,
    channel.id,
    challengerId,
    params.opponentId,
    params.gameType,
    params.amount,
    { matchFormat: params.matchFormat, challengerChoice: params.challengerChoice },
  );

  const matchLabel = formatMatchLabel(params.matchFormat);
  const details = params.challengeDetails ? `\n${params.challengeDetails}` : "";
  const embed = challengeEmbed(
    `${GAME_TITLES[params.gameType]} Challenge`,
    `<@${params.opponentId}>, you have been challenged by **${challengerName}**!\nWager: **${formatCurrency(params.amount, config)}** · ${matchLabel}${details}\n\nAccept or decline below.`,
    config,
  );

  const message = await channel.send({
    embeds: [embed],
    components: [buildAcceptDeclineRow(challenge.id)],
  });

  await pvp.setMessageId(challenge.id, message.id);
  return challenge;
}

export { postPvpChallengeInChannel };

async function createAndPostChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
  gameType: PvpGameType,
  opponentId: string,
  amount: number,
  matchFormat: PvpMatchFormat,
  extra?: { challengerChoice?: string; challengeDetails?: string },
) {
  const guildId = assertGuild(interaction);
  const pvp = createPvpChallengeService(db, wallet, config);
  const challenge = await pvp.createChallenge(
    guildId,
    interaction.channelId,
    interaction.user.id,
    opponentId,
    gameType,
    amount,
    { matchFormat, challengerChoice: extra?.challengerChoice },
  );

  const matchLabel = formatMatchLabel(matchFormat);
  const details = extra?.challengeDetails ? `\n${extra.challengeDetails}` : "";
  const embed = challengeEmbed(
    `${GAME_TITLES[gameType]} Challenge`,
    `<@${opponentId}>, you have been challenged by **${interaction.user.username}**!\nWager: **${formatCurrency(amount, config)}** · ${matchLabel}${details}\n\nAccept or decline below.`,
    config,
  );

  const reply = await interaction.reply({
    embeds: [embed],
    components: [buildAcceptDeclineRow(challenge.id)],
    fetchReply: true,
  });

  await pvp.setMessageId(challenge.id, reply.id);
}

async function handleChallengeCommand(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
  gameType: PvpGameType,
  extra?: {
    getChallengerChoice?: (interaction: ChatInputCommandInteraction) => string | undefined;
    getChallengeDetails?: (choice?: string) => string;
  },
) {
  const opponent = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const matchFormat = parseMatchFormat(interaction.options.getString("match"));

  if (opponent.bot) {
    await interaction.reply({ content: "You cannot challenge bots.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    const challengerChoice = extra?.getChallengerChoice?.(interaction);
    await createAndPostChallenge(
      interaction,
      db,
      wallet,
      config,
      gameType,
      opponent.id,
      amount,
      matchFormat,
      {
        challengerChoice,
        challengeDetails: extra?.getChallengeDetails?.(challengerChoice),
      },
    );
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleRpsChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  await handleChallengeCommand(interaction, db, wallet, config, "rps");
}

export async function handleDiceChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  await handleChallengeCommand(interaction, db, wallet, config, "dice");
}

export async function handleRouletteChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  await handleChallengeCommand(interaction, db, wallet, config, "russian_roulette");
}

export async function handleCoinflipDuelChallenge(
  interaction: ChatInputCommandInteraction,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  await handleChallengeCommand(interaction, db, wallet, config, "coinflip_duel", {
    getChallengerChoice: (cmd) => cmd.options.getString("side", true) as CoinSide,
    getChallengeDetails: (choice) => `Challenger's side: **${choice}**`,
  });
}

function matchResultDescription(
  challenge: PvpChallenge,
  winnerId: string | null,
  roundSummary: string,
  config: Config,
): string {
  const header = roundHeader(challenge, config);
  if (!winnerId) {
    return `${header}\n\n${roundSummary}\n\nIt's a tie — wagers refunded.`;
  }
  return `${header}\n\n${roundSummary}\n\n<@${winnerId}> wins **${formatCurrency(challenge.wager * 2, config)}**!`;
}

async function applyRoundOutcome(
  pvp: ReturnType<typeof createPvpChallengeService>,
  challenge: PvpChallenge,
  roundResult: RoundWinner,
  roundSummary: string,
  config: Config,
): Promise<{ title: string; description: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const plan = buildRoundOutcome(challenge, roundResult);
  let updated = challenge;
  if (Object.keys(plan.updates).length > 0) {
    updated = await pvp.updateChallenge(challenge.id, plan.updates);
  }

  if (plan.kind === "match_complete") {
    await pvp.completeChallenge(updated, plan.winnerId);
    return {
      title: `${GAME_TITLES[challenge.gameType]} — Result`,
      description: matchResultDescription(updated, plan.winnerId, roundSummary, config),
      components: [],
    };
  }

  if (plan.kind === "tie_replay") {
    updated = await pvp.getChallenge(challenge.id) ?? updated;
    const view = buildActiveGameView(updated, config)!;
    return {
      title: `${GAME_TITLES[challenge.gameType]} — Tie`,
      description: `${roundHeader(updated, config)}\n\n${roundSummary}\n\nRound tied — replaying this round.`,
      components: view.components,
    };
  }

  updated = await pvp.getChallenge(challenge.id) ?? updated;
  const view = buildActiveGameView(updated, config)!;
  return {
    title: `${GAME_TITLES[challenge.gameType]} — Round ${updated.roundNumber}`,
    description: `${roundSummary}\n\n${view.embed.data.description}`,
    components: view.components,
  };
}

async function runCoinflipRound(
  pvp: ReturnType<typeof createPvpChallengeService>,
  challenge: PvpChallenge,
  config: Config,
): Promise<{
  title: string;
  description: string;
  components: ActionRowBuilder<ButtonBuilder>[];
  summary: string;
  done: boolean;
}> {
  const side = challenge.challengerChoice as CoinSide;
  const flip = flipCoin();
  const roundResult = determineCoinflipWinner(side, flip);
  const summary = `Round ${challenge.roundNumber}: **${flip}** (<@${challenge.challengerId}> **${side}**, <@${challenge.opponentId}> **${oppositeSide(side)}**)`;
  const result = await applyRoundOutcome(
    pvp,
    challenge,
    roundResult,
    summary,
    config,
  );
  const refreshed = await pvp.getChallenge(challenge.id);
  return {
    ...result,
    summary,
    done: refreshed?.status === "completed",
  };
}

async function resolveCoinflipMatch(
  pvp: ReturnType<typeof createPvpChallengeService>,
  challenge: PvpChallenge,
  config: Config,
): Promise<{ title: string; description: string; components: ActionRowBuilder<ButtonBuilder>[] }> {
  let current = challenge;
  const summaries: string[] = [];
  let lastResult = await runCoinflipRound(pvp, current, config);
  summaries.push(lastResult.summary);

  while (!lastResult.done) {
    current = (await pvp.getChallenge(challenge.id))!;
    lastResult = await runCoinflipRound(pvp, current, config);
    summaries.push(lastResult.summary);
    if (summaries.length > 9) break;
  }

  const refreshed = (await pvp.getChallenge(challenge.id))!;
  const header = roundHeader(refreshed, config);
  const body = summaries.join("\n");

  if (refreshed.winnerId) {
    return {
      title: lastResult.title,
      description: `${header}\n\n${body}\n\n<@${refreshed.winnerId}> wins **${formatCurrency(refreshed.wager * 2, config)}**!`,
      components: [],
    };
  }

  return {
    title: lastResult.title,
    description: `${header}\n\n${body}\n\nIt's a tie — wagers refunded.`,
    components: [],
  };
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

    if (updated.gameType === "coinflip_duel") {
      const result = await resolveCoinflipMatch(pvp, updated, config);
      await interaction.update({
        embeds: [challengeEmbed(result.title, result.description, config)],
        components: result.components,
      });
      return;
    }

    const view = buildActiveGameView(updated, config)!;
    await interaction.update({
      embeds: [
        challengeEmbed(
          `${GAME_TITLES[updated.gameType]}`,
          `Challenge accepted!\n${view.embed.data.description}`,
          config,
        ),
      ],
      components: view.components,
    });
  } catch (err) {
    if (err instanceof PvpChallengeError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

function assertParticipant(
  interaction: ButtonInteraction,
  challenge: PvpChallenge,
): "challenger" | "opponent" | null {
  if (interaction.user.id === challenge.challengerId) return "challenger";
  if (interaction.user.id === challenge.opponentId) return "opponent";
  return null;
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

  const role = assertParticipant(interaction, challenge);
  if (!role) {
    await interaction.reply({ content: "You are not part of this challenge.", ephemeral: true });
    return;
  }

  if (role === "challenger" && challenge.challengerChoice) {
    await interaction.reply({ content: "You already picked.", ephemeral: true });
    return;
  }
  if (role === "opponent" && challenge.opponentChoice) {
    await interaction.reply({ content: "You already picked.", ephemeral: true });
    return;
  }

  const updateData =
    role === "challenger" ? { challengerChoice: choice } : { opponentChoice: choice };
  const updated = await pvp.updateChallenge(challengeId, updateData);

  if (!updated.challengerChoice || !updated.opponentChoice) {
    await interaction.reply({
      content: `You picked **${choice}**. Waiting for the other player...`,
      ephemeral: true,
    });
    return;
  }

  const roundResult = determineRpsWinner(
    updated.challengerChoice as RpsChoice,
    updated.opponentChoice as RpsChoice,
  );
  const roundSummary = `<@${updated.challengerId}> picked **${updated.challengerChoice}**\n<@${updated.opponentId}> picked **${updated.opponentChoice}**`;
  const result = await applyRoundOutcome(pvp, updated, roundResult, roundSummary, config);

  await interaction.update({
    embeds: [challengeEmbed(result.title, result.description, config)],
    components: result.components,
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

  const role = assertParticipant(interaction, challenge);
  if (!role) {
    await interaction.reply({ content: "You are not part of this challenge.", ephemeral: true });
    return;
  }

  const meta = parseMetadata(challenge.metadata);
  if (role === "challenger" && meta.challengerDice) {
    await interaction.reply({ content: "You already rolled.", ephemeral: true });
    return;
  }
  if (role === "opponent" && meta.opponentDice) {
    await interaction.reply({ content: "You already rolled.", ephemeral: true });
    return;
  }

  const dice = rollTwoDice();
  const total = sumDice(dice);
  const metadata = {
    ...meta,
    ...(role === "challenger"
      ? { challengerDice: dice }
      : { opponentDice: dice }),
  };
  const updateData =
    role === "challenger"
      ? { challengerRoll: total, metadata }
      : { opponentRoll: total, metadata };

  const updated = await pvp.updateChallenge(challengeId, updateData);

  if (updated.challengerRoll == null || updated.opponentRoll == null) {
    await interaction.reply({
      content: `You rolled ${formatDiceRoll(dice)}. Waiting for the other player...`,
      ephemeral: true,
    });
    return;
  }

  const finalMeta = parseMetadata(updated.metadata);
  const roundResult = determineDiceWinner(updated.challengerRoll, updated.opponentRoll);
  const roundSummary = `<@${updated.challengerId}> rolled ${formatDiceRoll(finalMeta.challengerDice!)}\n<@${updated.opponentId}> rolled ${formatDiceRoll(finalMeta.opponentDice!)}`;
  const result = await applyRoundOutcome(pvp, updated, roundResult, roundSummary, config);

  await interaction.update({
    embeds: [challengeEmbed(result.title, result.description, config)],
    components: result.components,
  });
}

export async function handleRoulettePull(
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

  const role = assertParticipant(interaction, challenge);
  if (!role) {
    await interaction.reply({ content: "You are not part of this challenge.", ephemeral: true });
    return;
  }

  const meta = parseMetadata(challenge.metadata);
  const roulette = meta.roulette;
  if (!roulette) {
    await interaction.reply({ content: "This round is not ready.", ephemeral: true });
    return;
  }

  if (interaction.user.id !== roulette.turnUserId) {
    await interaction.reply({ content: "It's not your turn.", ephemeral: true });
    return;
  }

  const { bang, nextState } = pullRouletteTrigger(
    roulette,
    challenge.challengerId,
    challenge.opponentId,
  );

  if (bang) {
    const roundResult: RoundWinner =
      interaction.user.id === challenge.challengerId ? "opponent" : "challenger";
    const roundSummary = `<@${interaction.user.id}> pulled the trigger… **BANG!** 💥`;
    const updated = await pvp.updateChallenge(challengeId, { metadata: { ...meta, roulette: nextState } });
    const result = await applyRoundOutcome(pvp, updated, roundResult, roundSummary, config);
    await interaction.update({
      embeds: [challengeEmbed(result.title, result.description, config)],
      components: result.components,
    });
    return;
  }

  const updated = await pvp.updateChallenge(challengeId, {
    metadata: { ...meta, roulette: nextState },
  });
  const view = buildActiveGameView(updated, config)!;
  await interaction.update({
    embeds: [
      challengeEmbed(
        GAME_TITLES.russian_roulette,
        `${roundHeader(updated, config)}\n\n<@${interaction.user.id}> pulled… *click* — safe.\n<@${nextState.turnUserId}>, your turn:`,
        config,
      ),
    ],
    components: view.components,
  });
}
