import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import type { Config } from "../../config";
import { PokerTableError } from "../../services/poker/table";
import type { PokerTableService } from "../../services/poker/table";
import { pokerLock } from "../../services/poker/lock";
import { defaultHostBuyIn, maxBotSeatsForTable, parseBotCount, parseTableBuyIn, pokerTableStakes } from "../../services/poker/config";
import { runPendingBotActions, formatBotActionLabel } from "../../services/poker/botRunner";
import { getLegalActions } from "../../services/poker/betting";
import { assertGuild } from "../../utils/permissions";
import { parseWagerAmount } from "../casino/types";
import { formatCurrency } from "../../utils/bets";
import {
  buildPokerBrowseEmbed,
  buildPokerLobbyEmbed,
  buildPokerTableEmbed,
} from "./embeds";
import { upsertHoleCardsEphemeral, forgetHoleCardsEphemeral } from "./holeCardsEphemeral";
import { editPokerTableMessage } from "./tableMessage";
import {
  pokerBrowseRow,
  pokerBuyInModal,
  pokerLobbyRow,
  pokerRaiseModal,
  pokerTableComponents,
} from "./components";
import {
  assertNoActiveCasinoSession,
} from "../../services/casino/activeSession";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import type { HiloSessionService } from "../../services/casino/hilo/session";
import type { MinesSessionService } from "../../services/casino/mines/session";
import { deferAndEditPublicMessage } from "../../services/casino/lock";
import type { PokerTableVisibility } from "../../services/poker/types";

async function replyPokerError(interaction: ButtonInteraction | ModalSubmitInteraction, err: unknown) {
  const message =
    err instanceof PokerTableError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Something went wrong.";
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }
}

async function syncViewerHoleCards(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  tableId: string,
  poker: PokerTableService,
  viewerUserId: string,
) {
  const snapshot = await poker.getSnapshot(tableId);
  if (!snapshot) return;

  const viewerSeat = snapshot.seats.find((s) => s.userId === viewerUserId);
  const handActive = !!snapshot.handState && snapshot.handState.street !== "complete";
  const cards = handActive ? (viewerSeat?.holeCards ?? []) : [];

  await upsertHoleCardsEphemeral(
    interaction,
    tableId,
    viewerUserId,
    cards,
    handActive && cards.length > 0,
  );
}

async function updateTableMessage(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
  viewerUserId: string,
) {
  await editPokerTableMessage(interaction.client, poker, tableId, config, viewerUserId);
  await syncViewerHoleCards(interaction, tableId, poker, viewerUserId);
}

async function finalizeTableTurn(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
  viewerUserId: string,
) {
  await runPendingBotActions(tableId, poker, {
    onStep: async (step) => {
      const extras =
        step.phase === "thinking"
          ? { thinkingSeat: step.seatIndex }
          : {
              lastAction: {
                seatIndex: step.seatIndex,
                label: step.action ? formatBotActionLabel(step.action, step.raiseTo) : "acts",
              },
            };
      await editPokerTableMessage(
        interaction.client,
        poker,
        tableId,
        config,
        viewerUserId,
        extras,
      );
    },
  });
  await updateTableMessage(interaction, tableId, poker, config, viewerUserId);
}

export async function handlePokerLobby(
  interaction: ButtonInteraction,
  config: Config,
) {
  await interaction.reply({
    embeds: [buildPokerLobbyEmbed(config)],
    components: [pokerLobbyRow(interaction.user.id)],
    ephemeral: true,
  });
}

export async function handlePokerBrowse(
  interaction: ButtonInteraction,
  poker: PokerTableService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const tables = await poker.listPublicTables(guildId);
  const summaries = await Promise.all(
    tables.map(async (t) => {
      const loaded = await poker.getTable(t.id);
      const seated = loaded?.seats.filter((s: { userId: string | null }) => s.userId).length ?? 0;
      return {
        id: t.id,
        seated,
        maxSeats: t.maxSeats,
        blinds: `${formatCurrency(t.smallBlind, config)} / ${formatCurrency(t.bigBlind, config)}`,
      };
    }),
  );

  await interaction.update({
    embeds: [buildPokerBrowseEmbed(summaries, config)],
    components: pokerBrowseRow(interaction.user.id, summaries.map((s) => s.id)),
  });
}

export async function handlePokerCreatePrompt(
  interaction: ButtonInteraction,
  visibility: PokerTableVisibility,
  config: Config,
) {
  const suggested = defaultHostBuyIn(config);
  const maxBots = maxBotSeatsForTable(config.POKER_MAX_PLAYERS);
  await interaction.showModal(
    pokerBuyInModal(visibility, interaction.user.id, suggested, undefined, {
      showBotsField: true,
      maxBots,
      buyInHint: "Table buy-in (sets blinds & limits)",
    }),
  );
}

export async function handlePokerBuyInModal(
  interaction: ModalSubmitInteraction,
  source: string,
  userId: string,
  poker: PokerTableService,
  config: Config,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
) {
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "This modal is not for you.", ephemeral: true });
    return;
  }

  const guildId = assertGuild(interaction);
  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({ content: "Use this in a server channel.", ephemeral: true });
    return;
  }

  try {
    const maxSeats = config.POKER_MAX_PLAYERS;
    let botCount = 0;
    if (!source.startsWith("join:")) {
      let botsRaw: string | undefined;
      try {
        botsRaw = interaction.fields.getTextInputValue("bots");
      } catch {
        botsRaw = undefined;
      }
      botCount = parseBotCount(botsRaw, maxSeats);
    }

    await assertNoActiveCasinoSession(guildId, userId, blackjack, hilo, mines, undefined, poker);

    const activePoker = await poker.getActiveSeatForUser(guildId, userId);
    if (activePoker) throw new PokerTableError("You are already seated at a poker table.");

    if (source.startsWith("join:")) {
      const tableId = source.slice("join:".length);
      const loaded = await poker.getTable(tableId);
      if (!loaded) throw new PokerTableError("Table not found.");
      const amount = parseTableBuyIn(
        interaction.fields.getTextInputValue("amount"),
        loaded.table.minBuyIn,
        loaded.table.maxBuyIn,
        config,
      );

      await interaction.deferUpdate();
      await pokerLock.run(tableId, () => poker.joinTable(tableId, userId, amount));
      await finalizeTableTurn(interaction, tableId, poker, config, userId);
      await interaction.followUp({
        content: `Joined table with **${formatCurrency(amount, config)}** buy-in.`,
        ephemeral: true,
      });
      return;
    }

    const amount = parseWagerAmount(interaction.fields.getTextInputValue("amount"), config);
    const stakes = pokerTableStakes(amount, config);

    const visibility = source as PokerTableVisibility;
    const { table } = await poker.createTable(guildId, channelId, userId, {
      visibility,
      buyIn: amount,
      botCount,
    });

    const snapshot = await poker.getSnapshot(table.id);
    if (!snapshot) throw new PokerTableError("Failed to create table.");

    const embed = buildPokerTableEmbed(snapshot, config);
    const components = pokerTableComponents(snapshot, userId);
    const channel = interaction.channel as TextChannel;
    const message = await channel.send({ embeds: [embed], components });
    await poker.setMessageId(table.id, message.id);

    const botNote =
      botCount > 0
        ? ` **${botCount}** bot${botCount === 1 ? "" : "s"} added — real players can join anytime to take their seats.`
        : "";
    await interaction.reply({
      content:
        `Table created! Blinds **${formatCurrency(stakes.smallBlind, config)}** / **${formatCurrency(stakes.bigBlind, config)}** · ` +
        `join range **${formatCurrency(stakes.minBuyIn, config)}**–**${formatCurrency(stakes.maxBuyIn, config)}**.${botNote}`,
      ephemeral: true,
    });
  } catch (err) {
    if (interaction.deferred) {
      await interaction.followUp({
        content: err instanceof Error ? err.message : "Failed.",
        ephemeral: true,
      });
    } else {
      await replyPokerError(interaction, err);
    }
  }
}

export async function handlePokerJoin(
  interaction: ButtonInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
) {
  const guildId = assertGuild(interaction);
  try {
    await assertNoActiveCasinoSession(guildId, interaction.user.id, blackjack, hilo, mines, undefined, poker);
    const loaded = await poker.getTable(tableId);
    if (!loaded) throw new PokerTableError("Table not found.");
    const midBuyIn = Math.round((loaded.table.minBuyIn + loaded.table.maxBuyIn) / 2);
    await interaction.showModal(
      pokerBuyInModal("join", interaction.user.id, midBuyIn, tableId, {
        buyInHint: `Buy-in (${loaded.table.minBuyIn}–${loaded.table.maxBuyIn})`,
      }),
    );
  } catch (err) {
    await replyPokerError(interaction, err);
  }
}

export async function handlePokerJoinModal(
  interaction: ModalSubmitInteraction,
  tableId: string,
  userId: string,
  poker: PokerTableService,
  config: Config,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
) {
  return handlePokerBuyInModal(
    interaction,
    `join:${tableId}`,
    userId,
    poker,
    config,
    blackjack,
    hilo,
    mines,
  );
}

export async function handlePokerLeave(
  interaction: ButtonInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
) {
  try {
    await deferAndEditPublicMessage(interaction, { components: [] });
    const snapshot = await pokerLock.run(tableId, () =>
      poker.leaveTable(tableId, interaction.user.id),
    );
    await updateTableMessage(interaction, tableId, poker, config, interaction.user.id);
    forgetHoleCardsEphemeral(tableId, interaction.user.id);
    await interaction.followUp({
      content: snapshot.status === "closed" ? "You left — table closed." : "You left the table.",
      ephemeral: true,
    });
  } catch (err) {
    await replyPokerError(interaction, err);
  }
}

export async function handlePokerStart(
  interaction: ButtonInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
) {
  try {
    await deferAndEditPublicMessage(interaction, { components: [] });
    await pokerLock.run(tableId, async () => {
      const current = await poker.getSnapshot(tableId);
      if (current?.handState?.street === "complete") {
        return poker.beginNextHand(tableId, interaction.user.id);
      }
      return poker.startHand(tableId, interaction.user.id);
    });
    await finalizeTableTurn(interaction, tableId, poker, config, interaction.user.id);
  } catch (err) {
    await replyPokerError(interaction, err);
  }
}

export async function handlePokerAction(
  interaction: ButtonInteraction,
  tableId: string,
  action: string,
  poker: PokerTableService,
  config: Config,
) {
  try {
    await deferAndEditPublicMessage(interaction, { components: [] });
    await pokerLock.run(tableId, () =>
      poker.act(tableId, interaction.user.id, action as "fold" | "check" | "call" | "all_in"),
    );
    await finalizeTableTurn(interaction, tableId, poker, config, interaction.user.id);
  } catch (err) {
    await replyPokerError(interaction, err);
  }
}

export async function handlePokerRaisePrompt(
  interaction: ButtonInteraction,
  tableId: string,
  poker: PokerTableService,
) {
  const snapshot = await poker.getSnapshot(tableId);
  if (!snapshot?.handState) {
    await interaction.reply({ content: "No active hand.", ephemeral: true });
    return;
  }
  const seat = snapshot.seats.find((s) => s.userId === interaction.user.id);
  if (!seat || snapshot.handState.actionSeat !== seat.seatIndex) {
    await interaction.reply({ content: "Not your turn.", ephemeral: true });
    return;
  }
  const legal = getLegalActions(snapshot, seat.seatIndex);
  if (!legal?.canRaise) {
    await interaction.reply({ content: "You cannot raise.", ephemeral: true });
    return;
  }
  await interaction.showModal(
    pokerRaiseModal(tableId, legal.minRaiseTo, legal.maxRaiseTo),
  );
}

export async function handlePokerRaiseModal(
  interaction: ModalSubmitInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
) {
  try {
    const amount = Number.parseInt(interaction.fields.getTextInputValue("amount").trim(), 10);
    if (Number.isNaN(amount)) throw new PokerTableError("Enter a valid amount.");

    await interaction.deferUpdate();
    await pokerLock.run(tableId, () =>
      poker.act(tableId, interaction.user.id, "raise", amount),
    );
    await finalizeTableTurn(
      interaction,
      tableId,
      poker,
      config,
      interaction.user.id,
    );
  } catch (err) {
    await replyPokerError(interaction, err);
  }
}

export async function assertNoPokerSeat(
  guildId: string,
  userId: string,
  poker: PokerTableService,
): Promise<void> {
  const seat = await poker.getActiveSeatForUser(guildId, userId);
  if (seat) {
    throw new PokerTableError("You are seated at a poker table. Leave before starting another game.");
  }
}
