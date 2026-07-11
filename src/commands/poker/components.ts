import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildButtonId } from "../../utils/buttons";
import { formatCurrency } from "../../utils/bets";
import type { Config } from "../../config";
import { getLegalActions } from "../../services/poker/betting";
import type { TableSnapshot } from "../../services/poker/types";
import { totalPotAmount } from "../../services/poker/pots";
import { formatCard } from "../../services/poker/engine";

export function pokerLobbyRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("poker", "browse", userId))
      .setLabel("Browse Tables")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔍"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("poker", "create", userId, "public"))
      .setLabel("Create Table")
      .setStyle(ButtonStyle.Success)
      .setEmoji("♠️"),
  );
}

export function pokerBrowseRow(userId: string, tableIds: string[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < tableIds.length; i += 4) {
    const chunk = tableIds.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((tableId, idx) =>
          new ButtonBuilder()
            .setCustomId(buildButtonId("poker", "join", userId, tableId))
            .setLabel(`Join #${i + idx + 1}`)
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function pokerTableComponents(
  snapshot: TableSnapshot,
  viewerUserId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const hand = snapshot.handState;
  const isComplete = !hand || hand.street === "complete";
  const isHost = snapshot.hostUserId === viewerUserId;
  const viewerSeat = snapshot.seats.find((s) => s.userId === viewerUserId);

  if (isComplete) {
    const lobby = new ActionRowBuilder<ButtonBuilder>();
    if (!viewerSeat) {
      lobby.addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "join", viewerUserId, snapshot.id))
          .setLabel("Join Table")
          .setStyle(ButtonStyle.Success),
      );
    } else {
      lobby.addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "leave", snapshot.id))
          .setLabel("Leave")
          .setStyle(ButtonStyle.Danger),
      );
    }
    if (isHost) {
      const seated = snapshot.seats.filter((s) => s.userId && s.stack > 0);
      lobby.addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "start", snapshot.id))
          .setLabel(hand?.street === "complete" ? "Next Hand" : "Start Hand")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(seated.length < 2),
      );
    }
    rows.push(lobby);
    return rows;
  }

  if (hand?.actionSeat != null && viewerSeat?.seatIndex === hand.actionSeat) {
    const legal = getLegalActions(snapshot, hand.actionSeat);
    if (legal) {
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "act", snapshot.id, "fold"))
          .setLabel("Fold")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!legal.canFold),
        new ButtonBuilder()
          .setCustomId(
            buildButtonId("poker", "act", snapshot.id, legal.canCheck ? "check" : "call"),
          )
          .setLabel(legal.canCheck ? "Check" : `Call ${legal.callAmount}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!legal.canCheck && !legal.canCall),
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "raise", snapshot.id))
          .setLabel("Raise")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!legal.canRaise),
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "act", snapshot.id, "all_in"))
          .setLabel("All-In")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!legal.canAllIn),
      );
      rows.push(actionRow);
    }
  }

  if (viewerSeat) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildButtonId("poker", "leave", snapshot.id))
          .setLabel("Leave (after hand)")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!isComplete),
      ),
    );
  }

  return rows;
}

export function pokerRaiseModal(tableId: string, minRaiseTo: number, maxRaiseTo: number) {
  return new ModalBuilder()
    .setCustomId(buildButtonId("poker", "raiseModal", tableId))
    .setTitle("Raise")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`Raise to (${minRaiseTo}–${maxRaiseTo})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

export function pokerBuyInModal(source: string, userId: string, defaultBuyIn: number) {
  return new ModalBuilder()
    .setCustomId(buildButtonId("poker", "buyinModal", source, userId))
    .setTitle("Poker Buy-In")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Buy-in amount")
          .setStyle(TextInputStyle.Short)
          .setValue(String(defaultBuyIn))
          .setRequired(true),
      ),
    );
}

export function formatBoard(cards: string[]): string {
  if (cards.length === 0) return "_No community cards yet_";
  return cards.map(formatCard).join(" ");
}

export function formatPotLine(snapshot: TableSnapshot): string {
  const hand = snapshot.handState;
  if (!hand) return "Pot: **0**";
  const total = totalPotAmount(hand.pots);
  if (hand.pots.length <= 1) return `Pot: **${total}**`;
  return `Pot: **${total}** (${hand.pots.length} pots)`;
}

export function formatSeatLine(
  snapshot: TableSnapshot,
  seatIndex: number,
  config: Config,
): string {
  const seat = snapshot.seats[seatIndex];
  if (!seat) return `Seat ${seatIndex + 1}: Empty`;
  if (!seat.userId) return `Seat ${seatIndex + 1}: Empty`;

  const marker =
    snapshot.handState?.dealerSeat === seatIndex
      ? " (D)"
      : snapshot.handState?.actionSeat === seatIndex
        ? " ←"
        : "";
  const status =
    seat.status === "folded" ? " · folded" : seat.status === "all_in" ? " · all-in" : "";
  return `Seat ${seatIndex + 1}: <@${seat.userId}> — **${formatCurrency(seat.stack, config)}**${marker}${status}`;
}
