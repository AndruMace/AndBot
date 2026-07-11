import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  EmbedBuilder,
} from "discord.js";
import type { Config } from "../../config";
import { PokerTableError } from "../../services/poker/table";
import type { PokerTableService } from "../../services/poker/table";
import { pokerLock } from "../../services/poker/lock";
import { pokerBuyInRange } from "../../services/poker/config";
import { getLegalActions } from "../../services/poker/betting";
import { assertGuild } from "../../utils/permissions";
import { parseWagerAmount } from "../casino/types";
import { formatCurrency } from "../../utils/bets";
import {
  buildPokerBrowseEmbed,
  buildPokerLobbyEmbed,
  buildPokerTableEmbed,
  buildHoleCardsEmbed,
} from "./embeds";
import {
  pokerBrowseRow,
  pokerBuyInModal,
  pokerLobbyRow,
  pokerRaiseModal,
  pokerTableComponents,
} from "./components";
import { formatCard } from "../../services/poker/engine";
import type { PokerTableVisibility } from "../../services/poker/types";
import {
  assertNoActiveCasinoSession,
} from "../../services/casino/activeSession";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import type { HiloSessionService } from "../../services/casino/hilo/session";
import type { MinesSessionService } from "../../services/casino/mines/session";
import { deferAndEditPublicMessage } from "../../services/casino/lock";

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

async function updateTableMessage(
  interaction: ButtonInteraction,
  tableId: string,
  poker: PokerTableService,
  config: Config,
  viewerUserId: string,
) {
  const snapshot = await poker.getSnapshot(tableId);
  if (!snapshot) return;

  const channel = interaction.channel;
  if (!channel?.isTextBased()) return;

  const embed = buildPokerTableEmbed(snapshot, config);
  const components = pokerTableComponents(snapshot, viewerUserId);

  const loaded = await poker.getTable(tableId);
  if (loaded?.table.messageId) {
    try {
      const msg = await (channel as TextChannel).messages.fetch(loaded.table.messageId);
      await msg.edit({ embeds: [embed], components });
    } catch {
      // message may be gone
    }
  }

  const viewerSeat = snapshot.seats.find((s) => s.userId === viewerUserId);
  if (viewerSeat && viewerSeat.holeCards.length > 0 && snapshot.handState?.street !== "complete") {
    const holeEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("Your Hole Cards")
      .setDescription(viewerSeat.holeCards.map(formatCard).join(" "));
    await interaction.followUp({ embeds: [holeEmbed], ephemeral: true });
  }
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
  const { minBuyIn } = pokerBuyInRange(config);
  await interaction.showModal(pokerBuyInModal(visibility, interaction.user.id, minBuyIn));
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
    const amount = parseWagerAmount(interaction.fields.getTextInputValue("amount"), config);
    await assertNoActiveCasinoSession(guildId, userId, blackjack, hilo, mines, undefined, poker);

    const activePoker = await poker.getActiveSeatForUser(guildId, userId);
    if (activePoker) throw new PokerTableError("You are already seated at a poker table.");

    if (source.startsWith("join:")) {
      const tableId = source.slice("join:".length);
      await interaction.deferUpdate();
      await pokerLock.run(tableId, () => poker.joinTable(tableId, userId, amount));
      await updateTableMessage(
        interaction as unknown as ButtonInteraction,
        tableId,
        poker,
        config,
        userId,
      );
      await interaction.followUp({
        content: `Joined table with **${formatCurrency(amount, config)}** buy-in.`,
        ephemeral: true,
      });
      return;
    }

    const visibility = source as PokerTableVisibility;
    const { table } = await poker.createTable(guildId, channelId, userId, {
      visibility,
      buyIn: amount,
    });

    const snapshot = await poker.getSnapshot(table.id);
    if (!snapshot) throw new PokerTableError("Failed to create table.");

    const embed = buildPokerTableEmbed(snapshot, config);
    const components = pokerTableComponents(snapshot, userId);
    const channel = interaction.channel as TextChannel;
    const message = await channel.send({ embeds: [embed], components });
    await poker.setMessageId(table.id, message.id);

    await interaction.reply({
      content: `Table created! Blinds **${formatCurrency(snapshot.smallBlind, config)}** / **${formatCurrency(snapshot.bigBlind, config)}**.`,
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
    const { minBuyIn } = pokerBuyInRange(config);
    await interaction.showModal(
      pokerBuyInModal(`join:${tableId}`, interaction.user.id, Math.max(minBuyIn, loaded.table.minBuyIn)),
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
    const snapshot = await pokerLock.run(tableId, async () => {
      const current = await poker.getSnapshot(tableId);
      if (current?.handState?.street === "complete") {
        return poker.beginNextHand(tableId, interaction.user.id);
      }
      return poker.startHand(tableId, interaction.user.id);
    });
    await updateTableMessage(interaction, tableId, poker, config, interaction.user.id);

    for (const seat of snapshot.seats) {
      if (!seat.userId || seat.holeCards.length === 0) continue;
      try {
        const user = await interaction.client.users.fetch(seat.userId);
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("Your Hole Cards")
              .setDescription(seat.holeCards.map(formatCard).join(" ")),
          ],
        });
      } catch {
        // DMs closed — they'll use ephemeral on action
      }
    }
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
    const snapshot = await pokerLock.run(tableId, () =>
      poker.act(tableId, interaction.user.id, action as "fold" | "check" | "call" | "all_in"),
    );
    await updateTableMessage(interaction, tableId, poker, config, interaction.user.id);
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
    await updateTableMessage(interaction as unknown as ButtonInteraction, tableId, poker, config, interaction.user.id);
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
