import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
  type ModalSubmitInteraction,
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
import { MemberLookupError, resolveGuildMemberByQuery } from "../../utils/guildMembers";
import { formatMatchLabel } from "../../services/pvp/match";
import { getWagerPresets, formatWagerButtonLabel, resolveWagerAmount, getMaxAffordableWager, parseCustomWagerAmount } from "../casino/wagers";
import { CHALLENGE_GAMES, isChallengeGame } from "./types";
import {
  opponentSelectRow,
  opponentUsernameButtonRow,
  opponentUsernameModal,
  recentOpponentRows,
  challengeCustomWagerModal,
} from "./components";
import { getRecentOpponentChoices } from "../../services/pvp/recentOpponents";
import type { Guild } from "discord.js";

type PendingSetup = {
  game: PvpGameType;
  opponentId: string;
  matchFormat: PvpMatchFormat;
  side?: CoinSide;
};

const pendingSetups = new Map<string, PendingSetup>();
/** Opponent chosen via `/challenge user:@name` before picking a game. */
const pendingOpponents = new Map<string, string>();

function pendingKey(userId: string): string {
  return userId;
}

function challengeMenuEmbed(config: Config, opponentId?: string): EmbedBuilder {
  const fields = CHALLENGE_GAMES.map((g) => ({
    name: `${g.emoji} ${g.label}`,
    value: g.description,
    inline: true,
  }));

  const description = opponentId
    ? `Opponent: <@${opponentId}>\n\nPick a game below, then set the wager and match format.`
    : "Pick a game below, then choose an opponent and set the wager.\n\nUse **Type username** if the member list search does not find someone.";

  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("PvP Challenges")
    .setDescription(description)
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

function opponentPickerDescription(game: PvpGameType, hasRecent: boolean): string {
  const gameLabel = CHALLENGE_GAMES.find((g) => g.id === game)!.label;
  const lines = [`Who do you want to challenge to **${gameLabel}**?`, ""];

  if (hasRecent) {
    lines.push("1. **Recent opponents** — tap someone you've played before");
    lines.push("2. **Type username** — enter their name");
    lines.push("3. **Member list** — scroll the list (typing search often fails)");
  } else {
    lines.push("1. **Type username** — enter their name");
    lines.push("2. **Member list** — scroll the list (typing search often fails)");
  }

  return lines.join("\n");
}

async function buildOpponentPickerComponents(
  guild: Guild,
  db: Database,
  userId: string,
  game: PvpGameType,
) {
  const recent = await getRecentOpponentChoices(guild, db, userId);
  return {
    recent,
    components: [
      ...recentOpponentRows(game, recent),
      opponentUsernameButtonRow(game),
      opponentSelectRow(game),
    ],
  };
}

async function showChallengeSetup(
  interaction: ButtonInteraction | UserSelectMenuInteraction | ModalSubmitInteraction,
  game: PvpGameType,
  opponentId: string,
  wallet: WalletService,
  config: Config,
  mode: "reply" | "update",
) {
  const guildId = assertGuild(interaction);
  const invalid = validateOpponent(interaction.user.id, opponentId);
  if (invalid) {
    await interaction.reply(ephemeralOptions({ content: invalid }));
    return;
  }

  const setup: PendingSetup = {
    game,
    opponentId,
    matchFormat: "single",
  };
  pendingSetups.set(pendingKey(interaction.user.id), setup);
  pendingOpponents.delete(interaction.user.id);

  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  const payload = {
    ...ephemeralOptions({
      embeds: [setupEmbed(setup, config, userWallet.balance, userWallet.lastWager ?? null)],
      components: setupComponents(setup, config, userWallet.balance, userWallet.lastWager ?? null),
    }),
  };

  if (mode === "reply") {
    await interaction.reply(payload);
  } else {
    await interaction.update(payload);
  }
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
  if (wagerReady(setup)) {
    lines.push(
      `Use a preset, **Repeat**, or **Custom Amount** (up to **${formatCurrency(getMaxAffordableWager(config, balance), config)}**).`,
    );
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

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          buildButtonId(
            "challenge",
            "custom",
            setup.game,
            setup.opponentId,
            setup.matchFormat,
            setup.side ?? "-",
          ),
        )
        .setLabel("Custom Amount")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
    ),
  );

  return rows;
}

function validateOpponent(challengerId: string, opponentId: string): string | null {
  if (opponentId === challengerId) return "You cannot challenge yourself.";
  return null;
}

export async function handleChallenge(
  interaction: ChatInputCommandInteraction,
  config: Config,
) {
  assertGuild(interaction);
  const opponent = interaction.options.getUser("user");

  if (opponent) {
    if (opponent.bot) {
      await interaction.reply(ephemeralOptions({ content: "You cannot challenge bots." }));
      return;
    }
    const invalid = validateOpponent(interaction.user.id, opponent.id);
    if (invalid) {
      await interaction.reply(ephemeralOptions({ content: invalid }));
      return;
    }
    pendingOpponents.set(interaction.user.id, opponent.id);
  }

  await interaction.reply({
    embeds: [challengeMenuEmbed(config, opponent?.id ?? pendingOpponents.get(interaction.user.id))],
    components: challengeMenuRows(),
  });
}

export async function handleChallengePick(
  interaction: ButtonInteraction,
  game: PvpGameType,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply(ephemeralOptions({ content: "This command only works in a server." }));
    return;
  }

  const presetOpponent = pendingOpponents.get(interaction.user.id);
  if (presetOpponent) {
    await showChallengeSetup(interaction, game, presetOpponent, wallet, config, "reply");
    return;
  }

  const { recent, components } = await buildOpponentPickerComponents(
    guild,
    db,
    interaction.user.id,
    game,
  );

  await interaction.reply({
    ...ephemeralOptions({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("Choose Opponent")
          .setDescription(opponentPickerDescription(game, recent.length > 0)),
      ],
      components,
    }),
  });
}

export async function handleChallengeRecentOpponent(
  interaction: ButtonInteraction,
  game: PvpGameType,
  opponentId: string,
  wallet: WalletService,
  config: Config,
) {
  assertGuild(interaction);
  await showChallengeSetup(interaction, game, opponentId, wallet, config, "update");
}

export async function handleChallengeUsernamePrompt(
  interaction: ButtonInteraction,
  game: PvpGameType,
) {
  assertGuild(interaction);
  await interaction.showModal(opponentUsernameModal(game));
}

export async function handleChallengeUsernameModal(
  interaction: ModalSubmitInteraction,
  game: PvpGameType,
  wallet: WalletService,
  config: Config,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply(ephemeralOptions({ content: "This command only works in a server." }));
    return;
  }

  const query = interaction.fields.getTextInputValue("username");

  try {
    const member = await resolveGuildMemberByQuery(guild, query, interaction.user.id);
    await showChallengeSetup(interaction, game, member.id, wallet, config, "reply");
  } catch (err) {
    if (err instanceof MemberLookupError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

export async function handleChallengeUserSelect(
  interaction: UserSelectMenuInteraction,
  game: PvpGameType,
  wallet: WalletService,
  config: Config,
) {
  assertGuild(interaction);
  const opponent = interaction.users.first();

  if (!opponent) {
    await interaction.reply(ephemeralOptions({ content: "No opponent selected." }));
    return;
  }

  if (opponent.bot) {
    await interaction.reply(ephemeralOptions({ content: "You cannot challenge bots." }));
    return;
  }

  const invalid = validateOpponent(interaction.user.id, opponent.id);
  if (invalid) {
    await interaction.reply(ephemeralOptions({ content: invalid }));
    return;
  }

  await showChallengeSetup(interaction, game, opponent.id, wallet, config, "update");
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

  await submitChallengeWager(
    interaction,
    game,
    opponentId,
    amount,
    matchFormat,
    sideToken,
    db,
    wallet,
    config,
  );
}

export async function handleChallengeCustomWager(
  interaction: ButtonInteraction,
  game: PvpGameType,
  opponentId: string,
  matchFormat: PvpMatchFormat,
  sideToken: string,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const balance = await wallet.getBalance(guildId, interaction.user.id);
  await interaction.showModal(
    challengeCustomWagerModal(game, opponentId, matchFormat, sideToken, config, balance),
  );
}

export async function handleChallengeCustomAmountModal(
  interaction: ModalSubmitInteraction,
  game: PvpGameType,
  opponentId: string,
  matchFormat: PvpMatchFormat,
  sideToken: string,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const balance = await wallet.getBalance(guildId, interaction.user.id);
    const amount = parseCustomWagerAmount(
      interaction.fields.getTextInputValue("amount"),
      config,
      balance,
    );

    await submitChallengeWager(
      interaction,
      game,
      opponentId,
      amount,
      matchFormat,
      sideToken,
      db,
      wallet,
      config,
    );
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

async function submitChallengeWager(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  game: PvpGameType,
  opponentId: string,
  amount: number,
  matchFormat: PvpMatchFormat,
  sideToken: string,
  db: Database,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
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
    pendingOpponents.delete(interaction.user.id);

    const payload = {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Challenge Sent")
          .setDescription(
            `Your **${CHALLENGE_GAMES.find((g) => g.id === game)!.label}** challenge to <@${opponentId}> for **${formatCurrency(amount, config)}** (${formatMatchLabel(matchFormat)}) was posted in this channel.`,
          ),
      ],
      components: [] as [],
    };

    if (interaction.isModalSubmit()) {
      await interaction.reply({ ...payload, ephemeral: true });
    } else {
      await interaction.update(payload);
    }
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof PvpChallengeError) {
      const reply = ephemeralOptions({ content: err.message });
      if (interaction.isModalSubmit()) {
        await interaction.reply(reply);
      } else {
        await interaction.reply(reply);
      }
      return;
    }
    throw err;
  }
}

export { isChallengeGame };
