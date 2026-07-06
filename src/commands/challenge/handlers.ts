import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import type { Config } from "../../config";
import type { Database } from "../../db/client";
import type { WalletService } from "../../services/wallet";
import type { PvpGameType, PvpMatchFormat } from "../../db/schema";
import type { CoinSide } from "../../services/pvp/challenges";
import { PvpChallengeError } from "../../services/pvp/challenges";
import { postPvpChallengeInChannel } from "../pvp";
import { assertGuild } from "../../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../../utils/bets";
import { buildButtonId } from "../../utils/buttons";
import { ephemeralOptions } from "../../utils/discord";
import { formatMatchLabel } from "../../services/pvp/match";
import { getWagerPresets, formatWagerButtonLabel, resolveWagerAmount } from "../casino/wagers";
import { CHALLENGE_GAMES, isChallengeGame } from "./types";

type PendingSetup = {
  game: PvpGameType;
  opponentId: string;
  matchFormat: PvpMatchFormat;
  side?: CoinSide;
};

const pendingSetups = new Map<string, PendingSetup>();

function pendingKey(userId: string): string {
  return userId;
}

function challengeMenuEmbed(config: Config): EmbedBuilder {
  const fields = CHALLENGE_GAMES.map((g) => ({
    name: `${g.emoji} ${g.label}`,
    value: g.description,
    inline: true,
  }));

  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("PvP Challenges")
    .setDescription("Pick a game below, choose an opponent, then set the wager and match format.")
    .addFields(fields)
    .setFooter({
      text: `Wagers: ${formatCurrency(config.MIN_BET, config)} – ${formatCurrency(config.MAX_BET, config)}`,
    });
}

function challengeMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < CHALLENGE_GAMES.length; i += 4) {
    const chunk = CHALLENGE_GAMES.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((g) =>
          new ButtonBuilder()
            .setCustomId(buildButtonId("challenge", "pick", g.id))
            .setLabel(g.label)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(g.emoji),
        ),
      ),
    );
  }
  return rows;
}

function opponentSelectRow(game: PvpGameType): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(buildButtonId("challenge", "user", game))
      .setPlaceholder("Choose your opponent")
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function setupEmbed(
  setup: PendingSetup,
  config: Config,
  balance: number,
  lastWager: number | null,
): EmbedBuilder {
  const game = CHALLENGE_GAMES.find((g) => g.id === setup.game)!;
  const lines = [
    `**${game.emoji} ${game.label}** vs <@${setup.opponentId}>`,
    `Match: **${formatMatchLabel(setup.matchFormat)}**`,
  ];

  if (setup.game === "coinflip_duel") {
    lines.push(
      setup.side
        ? `Your side: **${setup.side}**`
        : "Pick **heads** or **tails** before choosing a wager.",
    );
  }

  lines.push("", `Balance: **${formatCurrency(balance, config)}**`);
  if (lastWager) {
    lines.push(`Last wager: **${formatCurrency(lastWager, config)}**`);
  }

  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Set Up Challenge")
    .setDescription(lines.join("\n"));
}

function matchFormatRow(setup: PendingSetup): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("challenge", "match", setup.game, setup.opponentId, "single"),
      )
      .setLabel("Single game")
      .setStyle(setup.matchFormat === "single" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("challenge", "match", setup.game, setup.opponentId, "best_of_3"),
      )
      .setLabel("Best 2 of 3")
      .setStyle(setup.matchFormat === "best_of_3" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function coinflipSideRow(setup: PendingSetup): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("challenge", "side", setup.game, setup.opponentId, "heads"),
      )
      .setLabel("Heads")
      .setStyle(setup.side === "heads" ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("challenge", "side", setup.game, setup.opponentId, "tails"),
      )
      .setLabel("Tails")
      .setStyle(setup.side === "tails" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function wagerReady(setup: PendingSetup): boolean {
  if (setup.game === "coinflip_duel" && !setup.side) return false;
  return true;
}

function setupComponents(
  setup: PendingSetup,
  config: Config,
  balance: number,
  lastWager: number | null,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [matchFormatRow(setup)];

  if (setup.game === "coinflip_duel") {
    rows.push(coinflipSideRow(setup));
  }

  if (!wagerReady(setup)) {
    return rows;
  }

  const presets = getWagerPresets(config, balance);
  if (presets.length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...presets.map((amount) =>
          new ButtonBuilder()
            .setCustomId(
              buildButtonId(
                "challenge",
                "bet",
                setup.game,
                setup.opponentId,
                String(amount),
                setup.matchFormat,
                setup.side ?? "-",
              ),
            )
            .setLabel(formatWagerButtonLabel(amount))
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
  }

  const secondary = new ActionRowBuilder<ButtonBuilder>();
  if (
    lastWager &&
    lastWager >= config.MIN_BET &&
    lastWager <= config.MAX_BET &&
    lastWager <= balance
  ) {
    secondary.addComponents(
      new ButtonBuilder()
        .setCustomId(
          buildButtonId(
            "challenge",
            "bet",
            setup.game,
            setup.opponentId,
            "repeat",
            setup.matchFormat,
            setup.side ?? "-",
          ),
        )
        .setLabel(`Repeat ${formatWagerButtonLabel(lastWager)}`)
        .setStyle(ButtonStyle.Success),
    );
  }

  if (secondary.components.length > 0) {
    rows.push(secondary);
  }

  return rows;
}

export async function handleChallenge(
  interaction: ChatInputCommandInteraction,
  config: Config,
) {
  assertGuild(interaction);
  await interaction.reply({
    embeds: [challengeMenuEmbed(config)],
    components: challengeMenuRows(),
  });
}

export async function handleChallengePick(
  interaction: ButtonInteraction,
  game: PvpGameType,
) {
  assertGuild(interaction);
  await interaction.reply({
    ...ephemeralOptions({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("Choose Opponent")
          .setDescription(
            `Select who you want to challenge to **${CHALLENGE_GAMES.find((g) => g.id === game)!.label}**.`,
          ),
      ],
      components: [opponentSelectRow(game)],
    }),
  });
}

export async function handleChallengeUserSelect(
  interaction: UserSelectMenuInteraction,
  game: PvpGameType,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const opponent = interaction.users.first();

  if (!opponent) {
    await interaction.reply(ephemeralOptions({ content: "No opponent selected." }));
    return;
  }

  if (opponent.bot) {
    await interaction.reply(ephemeralOptions({ content: "You cannot challenge bots." }));
    return;
  }

  if (opponent.id === interaction.user.id) {
    await interaction.reply(ephemeralOptions({ content: "You cannot challenge yourself." }));
    return;
  }

  const setup: PendingSetup = {
    game,
    opponentId: opponent.id,
    matchFormat: "single",
  };
  pendingSetups.set(pendingKey(interaction.user.id), setup);

  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  await interaction.update({
    embeds: [setupEmbed(setup, config, userWallet.balance, userWallet.lastWager ?? null)],
    components: setupComponents(setup, config, userWallet.balance, userWallet.lastWager ?? null),
  });
}

export async function handleChallengeMatchSelect(
  interaction: ButtonInteraction,
  game: PvpGameType,
  opponentId: string,
  matchFormat: PvpMatchFormat,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const setup: PendingSetup = {
    game,
    opponentId,
    matchFormat,
    side: pendingSetups.get(pendingKey(interaction.user.id))?.side,
  };
  pendingSetups.set(pendingKey(interaction.user.id), setup);

  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  await interaction.update({
    embeds: [setupEmbed(setup, config, userWallet.balance, userWallet.lastWager ?? null)],
    components: setupComponents(setup, config, userWallet.balance, userWallet.lastWager ?? null),
  });
}

export async function handleChallengeSideSelect(
  interaction: ButtonInteraction,
  game: PvpGameType,
  opponentId: string,
  side: CoinSide,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const existing = pendingSetups.get(pendingKey(interaction.user.id));
  const setup: PendingSetup = {
    game,
    opponentId,
    matchFormat: existing?.matchFormat ?? "single",
    side,
  };
  pendingSetups.set(pendingKey(interaction.user.id), setup);

  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  await interaction.update({
    embeds: [setupEmbed(setup, config, userWallet.balance, userWallet.lastWager ?? null)],
    components: setupComponents(setup, config, userWallet.balance, userWallet.lastWager ?? null),
  });
}

export async function handleChallengeWager(
  interaction: ButtonInteraction,
  game: PvpGameType,
  opponentId: string,
  amountToken: string,
  matchFormat: PvpMatchFormat,
  sideToken: string,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  const amount = resolveWagerAmount(
    amountToken,
    userWallet.lastWager ?? null,
    config,
    userWallet.balance,
  );

  if (amount == null) {
    await interaction.reply(
      ephemeralOptions({ content: "That wager is not available. Try a different amount." }),
    );
    return;
  }

  const side = sideToken === "-" ? undefined : (sideToken as CoinSide);

  if (game === "coinflip_duel" && !side) {
    await interaction.reply(ephemeralOptions({ content: "Pick heads or tails first." }));
    return;
  }

  try {
    validateBetAmount(amount, config);

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.reply(ephemeralOptions({ content: "Cannot send challenge in this channel." }));
      return;
    }

    await postPvpChallengeInChannel(
      channel as TextChannel,
      guildId,
      interaction.user.id,
      interaction.user.username,
      db,
      wallet,
      config,
      {
        gameType: game,
        opponentId,
        amount,
        matchFormat,
        challengerChoice: side,
        challengeDetails:
          game === "coinflip_duel" && side ? `Challenger's side: **${side}**` : undefined,
      },
    );

    pendingSetups.delete(pendingKey(interaction.user.id));

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Challenge Sent")
          .setDescription(
            `Your **${CHALLENGE_GAMES.find((g) => g.id === game)!.label}** challenge to <@${opponentId}> for **${formatCurrency(amount, config)}** (${formatMatchLabel(matchFormat)}) was posted in this channel.`,
          ),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

export { isChallengeGame };
