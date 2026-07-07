import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Config } from "../../config";
import type { Database } from "../../db/client";
import type { WalletService } from "../../services/wallet";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import type { MinesSessionService } from "../../services/casino/mines/session";
import type { LotteryService } from "../../services/lottery/rounds";
import { LotteryError, InsufficientFundsError as LotteryInsufficientFundsError } from "../../services/lottery/rounds";
import { MinesSessionError } from "../../services/casino/mines/session";
import { BlackjackSessionError } from "../../services/blackjack/session";
import { type CoinSide } from "../../services/coinflip";
import { InsufficientFundsError } from "../../services/wallet";
import { assertGuild } from "../../utils/permissions";
import { BetValidationError, formatCurrency } from "../../utils/bets";
import { buildButtonId } from "../../utils/buttons";
import { ephemeralOptions } from "../../utils/discord";
import { formatDuration } from "../../utils/time";
import { drawCard, resolveHiLo, type HiLoChoice } from "../../services/casino/hilo";
import {
  MINES_COLUMNS,
  MINES_ROWS,
  gemMultiplier,
  type MinesCount,
} from "../../services/casino/mines/engine";
import type { MinesSession } from "../../db/schema";
import { CASINO_GAMES, type CasinoGame, parseWagerAmount, parseLuckyPick } from "./types";
import {
  getLotteryTicketPresets,
  LOTTERY_MENU,
  lotteryTicketDescription,
  parseLotteryTicketCount,
} from "./lottery-menu";
import {
  customLuckyNumberModal,
  customWagerModal,
  luckyNumberRows,
  wagerSelectionEmbed,
  wagerSelectionRows,
  customLotteryTicketModal,
} from "./components";
import {
  executeCasinoGame,
  executeLuckyWithPick,
  randomLuckyPick,
  showLuckyNumberPicker,
} from "./gameRunner";
import { runCoinflipAnimation } from "./presentations";
import {
  buildGameHeader,
  buildLotteryPublicDescription,
  postLotteryPublicAnnouncement,
  postPublicGameMessage,
  prefixDescription,
  publicResultFooter,
} from "./publicMessage";
import {
  resolveWagerAmount,
  parseCustomWagerAmount,
} from "./wagers";

function casinoEmbed(config: Config): EmbedBuilder {
  const fields = [
    ...CASINO_GAMES.map((g) => ({
      name: `${g.emoji} ${g.label}`,
      value: g.description,
      inline: true,
    })),
    {
      name: `${LOTTERY_MENU.emoji} ${LOTTERY_MENU.label}`,
      value: LOTTERY_MENU.description,
      inline: true,
    },
  ];

  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("Casino")
    .setDescription("Pick a game below, then choose a wager amount with one click.")
    .addFields(fields)
    .setFooter({
      text: `Wagers: ${formatCurrency(config.MIN_BET, config)} – ${formatCurrency(config.MAX_BET, config)}`,
    });
}

function casinoGameRows(): ActionRowBuilder<ButtonBuilder>[] {
  const menuItems = [
    ...CASINO_GAMES.map((g) => ({ id: g.id, label: g.label, emoji: g.emoji, kind: "game" as const })),
    {
      id: LOTTERY_MENU.id,
      label: LOTTERY_MENU.label,
      emoji: LOTTERY_MENU.emoji,
      kind: "lottery" as const,
    },
  ];

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < menuItems.length; i += 4) {
    const chunk = menuItems.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((item) =>
          new ButtonBuilder()
            .setCustomId(
              item.kind === "lottery"
                ? buildButtonId("casino", "pick", "lottery")
                : buildButtonId("casino", "pick", item.id),
            )
            .setLabel(item.label)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(item.emoji),
        ),
      ),
    );
  }
  return rows;
}

function buildMinesEmbed(
  session: MinesSession,
  config: Config,
  footer?: string,
  userId?: string,
): EmbedBuilder {
  const mult = gemMultiplier(session.gemsFound);
  const potential = Math.floor(session.wager * mult);

  let description = "";
  if (userId) {
    description =
      buildGameHeader(userId, "Mines", session.wager, config) +
      "\n\n";
  }

  description +=
    `Wager: **${formatCurrency(session.wager, config)}** · Mines: **${session.mineCount}**\n` +
    `Gems found: **${session.gemsFound}** · Multiplier: **${mult.toFixed(2)}x**\n` +
    `Cash out value: **${formatCurrency(potential, config)}**` +
    (footer ? `\n\n${footer}` : "");

  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("Mines")
    .setDescription(description);
}

function buildMinesComponents(session: MinesSession): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const revealed = new Set(session.revealed);

  for (let row = 0; row < MINES_ROWS; row++) {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < MINES_COLUMNS; col++) {
      const index = row * MINES_COLUMNS + col;
      if (revealed.has(index)) {
        const isMine = session.minePositions.includes(index);
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(buildButtonId("casino", "mn", "done", session.id, String(index)))
            .setLabel(isMine ? "💥" : "💎")
            .setStyle(isMine ? ButtonStyle.Danger : ButtonStyle.Success)
            .setDisabled(true),
        );
      } else {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(buildButtonId("casino", "mn", "rev", session.id, String(index)))
            .setLabel("⬜")
            .setStyle(ButtonStyle.Secondary),
        );
      }
    }
    rows.push(buttonRow);
  }

  if (session.status === "active" && session.gemsFound > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("casino", "mn", "out", session.id))
          .setLabel("Cash Out")
          .setStyle(ButtonStyle.Success)
          .setEmoji("💰"),
      ),
    );
  }

  return rows;
}

async function ensureFunds(
  wallet: WalletService,
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  const balance = await wallet.getBalance(guildId, userId);
  if (balance < amount) {
    throw new InsufficientFundsError();
  }
}

export async function handleCasino(
  interaction: ChatInputCommandInteraction,
  config: Config,
) {
  assertGuild(interaction);
  await interaction.reply({
    embeds: [casinoEmbed(config)],
    components: casinoGameRows(),
  });
}

function lotteryTicketRows(config: Config, balance: number): ActionRowBuilder<ButtonBuilder>[] {
  const presets = getLotteryTicketPresets(config, balance);
  const maxTickets = Math.min(
    Math.floor(balance / config.LOTTERY_TICKET_PRICE),
    config.LOTTERY_MAX_TICKETS_PER_PURCHASE,
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (presets.length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...presets.map((count) =>
          new ButtonBuilder()
            .setCustomId(buildButtonId("casino", "lot", "buy", String(count)))
            .setLabel(`${count} ticket${count === 1 ? "" : "s"}`)
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  if (maxTickets >= 1) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "lot", "custom"))
        .setLabel("Custom Amount")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
    );
  }
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "lot", "status"))
      .setLabel("View Status")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📊"),
  );
  rows.push(actionRow);

  return rows;
}

export async function handleCasinoLotteryPick(
  interaction: ButtonInteraction,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);

  await interaction.reply({
    ...ephemeralOptions({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`${LOTTERY_MENU.emoji} Lottery`)
          .setDescription(lotteryTicketDescription(config, userWallet.balance))
          .setFooter({
            text: `${config.LOTTERY_RAKE_PERCENT}% house fee · Draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
          }),
      ],
      components: lotteryTicketRows(config, userWallet.balance),
    }),
  });
}

function msUntilDraw(scheduledDrawAt: Date): number {
  return Math.max(0, scheduledDrawAt.getTime() - Date.now());
}

function lotteryReceiptEmbed(
  count: number,
  ticketNumbers: string,
  round: { roundNumber: number; potAmount: number; ticketCount: number; scheduledDrawAt: Date },
  totalCost: number,
  balance: number,
  config: Config,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Lottery Tickets Purchased")
    .setDescription(
      `You bought **${count}** ticket${count === 1 ? "" : "s"} for **${formatCurrency(totalCost, config)}**.\n` +
        `Ticket number${count === 1 ? "" : "s"}: **${ticketNumbers}**\n` +
        `Round **#${round.roundNumber}** · Pot: **${formatCurrency(round.potAmount, config)}** ` +
        `(${round.ticketCount} tickets)\n` +
        `Draw in **${formatDuration(msUntilDraw(round.scheduledDrawAt))}**\n` +
        `Balance: **${formatCurrency(balance, config)}**`,
    )
    .setFooter({
      text: `${config.LOTTERY_RAKE_PERCENT}% house fee · Draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
    });
}

async function announceLotteryPurchase(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  userId: string,
  count: number,
  totalCost: number,
  round: { roundNumber: number; potAmount: number; ticketCount: number; scheduledDrawAt: Date },
  config: Config,
): Promise<void> {
  await postLotteryPublicAnnouncement(
    interaction,
    buildLotteryPublicDescription(
      userId,
      count,
      totalCost,
      round.roundNumber,
      round.potAmount,
      round.ticketCount,
      formatDuration(msUntilDraw(round.scheduledDrawAt)),
      config,
    ),
    config,
  );
}

export async function handleCasinoLotteryCustomPrompt(
  interaction: ButtonInteraction,
  config: Config,
) {
  assertGuild(interaction);
  await interaction.showModal(customLotteryTicketModal(config));
}

export async function handleCasinoLotteryCustomModal(
  interaction: ModalSubmitInteraction,
  wallet: WalletService,
  lottery: LotteryService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
    const count = parseLotteryTicketCount(
      interaction.fields.getTextInputValue("count"),
      config,
      userWallet.balance,
    );

    await interaction.deferReply(ephemeralOptions({}));

    const { round, tickets, balance } = await lottery.buyTickets(
      guildId,
      interaction.user.id,
      interaction.channelId,
      count,
    );

    const ticketNumbers = tickets.map((t) => t.ticketNumber).join(", ");
    const totalCost = count * config.LOTTERY_TICKET_PRICE;

    await interaction.editReply({
      embeds: [lotteryReceiptEmbed(count, ticketNumbers, round, totalCost, balance, config)],
      components: [],
    });

    await announceLotteryPurchase(
      interaction,
      interaction.user.id,
      count,
      totalCost,
      round,
      config,
    );
  } catch (err) {
    if (
      err instanceof LotteryInsufficientFundsError ||
      err instanceof LotteryError ||
      err instanceof Error
    ) {
      const payload = { content: err.message };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(ephemeralOptions(payload));
      }
      return;
    }
    throw err;
  }
}

export async function handleCasinoLotteryBuy(
  interaction: ButtonInteraction,
  count: number,
  lottery: LotteryService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const { round, tickets, balance } = await lottery.buyTickets(
      guildId,
      interaction.user.id,
      interaction.channelId,
      count,
    );

    const ticketNumbers = tickets.map((t) => t.ticketNumber).join(", ");
    const totalCost = count * config.LOTTERY_TICKET_PRICE;

    await interaction.update({
      embeds: [lotteryReceiptEmbed(count, ticketNumbers, round, totalCost, balance, config)],
      components: [],
    });

    await announceLotteryPurchase(
      interaction,
      interaction.user.id,
      count,
      totalCost,
      round,
      config,
    );
  } catch (err) {
    if (err instanceof LotteryInsufficientFundsError || err instanceof LotteryError) {
      await interaction.followUp(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

export async function handleCasinoLotteryStatus(
  interaction: ButtonInteraction,
  lottery: LotteryService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const status = await lottery.getStatus(guildId, interaction.user.id);
  const { round, userTicketCount, uniquePlayers, lastCompleted } = status;

  const odds =
    round.ticketCount > 0 && userTicketCount > 0
      ? ((userTicketCount / round.ticketCount) * 100).toFixed(1)
      : null;

  let description =
    `**Round #${round.roundNumber}**\n` +
    `**Pot:** ${formatCurrency(round.potAmount, config)}\n` +
    `**Tickets sold:** ${round.ticketCount} (${uniquePlayers} players)\n` +
    `**Your tickets:** ${userTicketCount}` +
    (odds ? ` (**${odds}%** chance if drawn now)` : "") +
    `\n**Ticket price:** ${formatCurrency(config.LOTTERY_TICKET_PRICE, config)}\n` +
    `**Draw in:** ${formatDuration(msUntilDraw(round.scheduledDrawAt))}`;

  if (lastCompleted) {
    description +=
      `\n\n**Last winner:** <@${lastCompleted.winnerId}> won **${formatCurrency(lastCompleted.payoutAmount ?? 0, config)}** in round #${lastCompleted.roundNumber}.`;
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Lottery Status")
        .setDescription(description)
        .setFooter({
          text: `${config.LOTTERY_RAKE_PERCENT}% house fee · Draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
        }),
    ],
    components: [],
  });
}

export async function handleCasinoPick(
  interaction: ButtonInteraction,
  game: CasinoGame,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);

  await interaction.reply({
    ...ephemeralOptions({
      embeds: [wagerSelectionEmbed(game, config, userWallet.balance, userWallet.lastWager ?? null)],
      components: wagerSelectionRows(game, config, userWallet.balance, userWallet.lastWager ?? null),
    }),
  });
}

export async function handleCasinoCustomWager(
  interaction: ButtonInteraction,
  game: CasinoGame,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const userWallet = await wallet.getOrCreateWallet(guildId, interaction.user.id);
  await interaction.showModal(customWagerModal(game, config, userWallet.balance));
}

export async function handleCasinoWagerBet(
  interaction: ButtonInteraction,
  game: CasinoGame,
  amountToken: string,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
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
    await interaction.reply({
      content: "That wager is not available. Try a different amount or use Custom.",
      ephemeral: true,
    });
    return;
  }

  try {
    await ensureFunds(wallet, guildId, interaction.user.id, amount);

    if (game === "lucky") {
      await showLuckyNumberPicker(interaction, amount, config);
      return;
    }

    await executeCasinoGame(interaction, game, amount, wallet, blackjack, config);
  } catch (err) {
    if (
      err instanceof InsufficientFundsError ||
      err instanceof BetValidationError ||
      err instanceof BlackjackSessionError
    ) {
      const payload = { content: err.message };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(ephemeralOptions(payload));
      }
      return;
    }
    throw err;
  }
}

export async function handleCasinoCustomAmountModal(
  interaction: ModalSubmitInteraction,
  game: CasinoGame,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const amount = parseCustomWagerAmount(
      interaction.fields.getTextInputValue("amount"),
      config,
      (await wallet.getBalance(guildId, interaction.user.id)),
    );
    await ensureFunds(wallet, guildId, interaction.user.id, amount);

    if (game === "lucky") {
      await interaction.reply({
        embeds: [],
        content: `Wager: **${formatCurrency(amount, config)}** — pick your lucky number:`,
        components: luckyNumberRows(amount),
        ephemeral: true,
      });
      return;
    }

    await executeCasinoGame(interaction, game, amount, wallet, blackjack, config);
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

export async function handleCasinoLuckyPick(
  interaction: ButtonInteraction,
  amountStr: string,
  pickToken: string,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  assertGuild(interaction);

  try {
    const amount = parseWagerAmount(amountStr, config);
    await ensureFunds(wallet, interaction.guildId!, interaction.user.id, amount);

    let pick: number;
    if (pickToken === "rand") {
      pick = randomLuckyPick();
    } else {
      pick = parseLuckyPick(pickToken);
    }

    await executeLuckyWithPick(interaction, amount, pick, wallet, blackjack, config);
  } catch (err) {
    if (
      err instanceof BetValidationError ||
      err instanceof InsufficientFundsError ||
      err instanceof Error
    ) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleCasinoLuckyCustomModal(
  interaction: ModalSubmitInteraction,
  amountStr: string,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  config: Config,
) {
  assertGuild(interaction);

  try {
    const amount = parseWagerAmount(amountStr, config);
    const pick = parseLuckyPick(interaction.fields.getTextInputValue("number"));
    await ensureFunds(wallet, interaction.guildId!, interaction.user.id, amount);
    await executeLuckyWithPick(interaction, amount, pick, wallet, blackjack, config);
  } catch (err) {
    if (
      err instanceof BetValidationError ||
      err instanceof InsufficientFundsError ||
      err instanceof Error
    ) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleCasinoLuckyCustomPrompt(
  interaction: ButtonInteraction,
  amountStr: string,
) {
  assertGuild(interaction);
  const amount = Number.parseInt(amountStr, 10);
  await interaction.showModal(customLuckyNumberModal(amount));
}

export async function handleCasinoCoinflipSide(
  interaction: ButtonInteraction,
  ownerId: string,
  amountStr: string,
  side: CoinSide,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your coinflip.", ephemeral: true });
    return;
  }

  try {
    const amount = parseWagerAmount(amountStr, config);
    await interaction.deferUpdate();
    await runCoinflipAnimation(
      (p) => interaction.editReply({ ...p, content: null, components: [] }),
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
    const balance = await wallet.getBalance(guildId, interaction.user.id);
    await interaction.followUp(
      ephemeralOptions({
        content: `Balance: **${formatCurrency(balance, config)}**`,
      }),
    );
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof InsufficientFundsError) {
      const payload = { content: err.message, embeds: [], components: [] as [] };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ content: err.message, ephemeral: true });
      }
      return;
    }
    throw err;
  }
}

export async function handleCasinoHiLo(
  interaction: ButtonInteraction,
  choice: HiLoChoice,
  ownerId: string,
  amountStr: string,
  currentRankStr: string,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your game.", ephemeral: true });
    return;
  }

  try {
    const amount = parseWagerAmount(amountStr, config);
    const currentRank = Number.parseInt(currentRankStr, 10);
    const nextCard = drawCard();
    const won = resolveHiLo(currentRank, nextCard.rank, choice);

    let balance: number;
    if (won) {
      balance = await wallet.credit(guildId, interaction.user.id, amount * 2, "hilo_win", undefined, {
        choice,
        currentRank,
        nextRank: nextCard.rank,
      });
    } else {
      balance = await wallet.getBalance(guildId, interaction.user.id);
    }

    const payout = won ? amount * 2 : 0;
    const body =
      `You guessed **${choice}**.\n` +
      `Previous: **${currentRank}** → Next: **${nextCard.label}**\n` +
      publicResultFooter(amount, payout, config, { lost: !won });

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(won ? 0x57f287 : 0xed4245)
          .setTitle(won ? "Hi-Lo — You Won!" : "Hi-Lo — You Lost")
          .setDescription(
            prefixDescription(
              buildGameHeader(interaction.user.id, "Hi-Lo", amount, config),
              body,
            ),
          ),
      ],
      components: [],
    });

    await interaction.followUp(
      ephemeralOptions({
        content: `Balance: **${formatCurrency(balance, config)}**`,
      }),
    );
  } catch (err) {
    if (err instanceof BetValidationError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleCasinoMinesConfig(
  interaction: ButtonInteraction,
  mineCountStr: string,
  ownerId: string,
  amountStr: string,
  mines: MinesSessionService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const channelId = interaction.channelId;

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This is not your game.", ephemeral: true });
    return;
  }
  if (!channelId) {
    await interaction.reply({ content: "Use this in a server channel.", ephemeral: true });
    return;
  }

  try {
    const amount = parseWagerAmount(amountStr, config);
    const mineCount = Number.parseInt(mineCountStr, 10) as MinesCount;
    if (![3, 5, 8].includes(mineCount)) {
      throw new Error("Invalid mine count.");
    }

    let sessionId = "";

    const { message } = await postPublicGameMessage(interaction, async () => {
      const session = await mines.startSession(
        guildId,
        interaction.user.id,
        channelId,
        amount,
        mineCount,
      );
      sessionId = session.id;

      return {
        embeds: [
          buildMinesEmbed(
            session,
            config,
            "Reveal tiles to find gems. Cash out before hitting a mine!",
            interaction.user.id,
          ),
        ],
        components: buildMinesComponents(session),
      };
    });

    await mines.setMessageId(sessionId, message.id);
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof InsufficientFundsError || err instanceof MinesSessionError) {
      const payload = { content: err.message };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(ephemeralOptions(payload));
      }
      return;
    }
    throw err;
  }
}

export async function handleCasinoMinesReveal(
  interaction: ButtonInteraction,
  sessionId: string,
  tileIndexStr: string,
  mines: MinesSessionService,
  wallet: WalletService,
  config: Config,
) {
  assertGuild(interaction);
  const tileIndex = Number.parseInt(tileIndexStr, 10);
  const session = await mines.getSession(sessionId);

  if (!session) {
    await interaction.reply({ content: "Mines session not found.", ephemeral: true });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "This is not your mines game.", ephemeral: true });
    return;
  }

  try {
    const updated = await mines.revealTile(session, tileIndex);

    if (updated.status === "busted") {
      await interaction.update({
        embeds: [
          buildMinesEmbed(
            updated,
            config,
            "💥 **Boom!** You hit a mine and lost your wager.",
            updated.userId,
          ),
        ],
        components: buildMinesComponents(updated),
      });
      return;
    }

    await interaction.update({
      embeds: [buildMinesEmbed(updated, config, undefined, updated.userId)],
      components: buildMinesComponents(updated),
    });
  } catch (err) {
    if (err instanceof MinesSessionError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleCasinoMinesCashout(
  interaction: ButtonInteraction,
  sessionId: string,
  mines: MinesSessionService,
  wallet: WalletService,
  config: Config,
) {
  assertGuild(interaction);
  const session = await mines.getSession(sessionId);

  if (!session) {
    await interaction.reply({ content: "Mines session not found.", ephemeral: true });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "This is not your mines game.", ephemeral: true });
    return;
  }

  try {
    const { session: updated, payout } = await mines.cashOut(session);
    const balance = await wallet.getBalance(updated.guildId, updated.userId);

    await interaction.update({
      embeds: [
        buildMinesEmbed(
          updated,
          config,
          `💰 **Cashed out!** Won **${formatCurrency(payout, config)}**`,
          updated.userId,
        ),
      ],
      components: buildMinesComponents(updated),
    });

    await interaction.followUp(
      ephemeralOptions({
        content: `Balance: **${formatCurrency(balance, config)}**`,
      }),
    );
  } catch (err) {
    if (err instanceof MinesSessionError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export function isCasinoGame(value: string): value is CasinoGame {
  return CASINO_GAMES.some((g) => g.id === value);
}
