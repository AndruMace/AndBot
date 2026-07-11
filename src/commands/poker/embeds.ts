import { EmbedBuilder } from "discord.js";
import type { Config } from "../../config";
import type { TableSnapshot } from "../../services/poker/types";
import { formatBoard, formatAnimatedBoard, formatPotLine, formatSeatLine } from "./components";
import { formatCurrency } from "../../utils/bets";
import { formatPokerActor, isBotUserId } from "../../services/poker/bots";
import { formatStreetLabel, SPINNER_FRAMES } from "./visuals";

export type TableEmbedExtras = {
  thinkingSeat?: number;
  lastAction?: { seatIndex: number; label: string };
  banner?: string;
  revealedBoardCount?: number;
  spinnerFrame?: number;
  showHoleBacks?: boolean;
  celebrating?: boolean;
  /** When false, action buttons are hidden during animation frames. */
  interactive?: boolean;
};

export function buildPokerLobbyEmbed(config: Config): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("Texas Hold'em Poker")
    .setDescription(
      "No-Limit Hold'em for 2–6 players.\n\nBrowse open tables or create your own. Set the buy-in when creating a table — blinds and join limits are based on that amount. Optionally add bots; real players can join anytime to replace them.",
    )
    .setFooter({
      text: `Blinds from ${formatCurrency(config.MIN_BET, config)} / ${formatCurrency(Math.min(config.MIN_BET * 2, config.MAX_BET), config)}`,
    });
}

export function buildPokerTableEmbed(
  snapshot: TableSnapshot,
  config: Config,
  extras?: TableEmbedExtras,
): EmbedBuilder {
  const hand = snapshot.handState;
  const seated = snapshot.seats.filter((s) => s.userId).length;
  const lines = [
    `${snapshot.visibility === "public" ? "🌐 Public" : "🔒 Private"} table · ${seated}/${snapshot.maxSeats} seated`,
    `Blinds: **${formatCurrency(snapshot.smallBlind, config)}** / **${formatCurrency(snapshot.bigBlind, config)}**`,
    `Buy-in: **${formatCurrency(snapshot.minBuyIn, config)}** – **${formatCurrency(snapshot.maxBuyIn, config)}**`,
    "",
    ...snapshot.seats.map((_, i) => formatSeatLine(snapshot, i, config, extras)),
  ];

  if (hand && hand.street !== "complete") {
    if (extras?.banner) {
      lines.push("", extras.banner);
    }
    lines.push(
      "",
      `**Hand #${snapshot.handNumber}** · ${formatStreetLabel(hand.street)}`,
      `Board: ${extras?.revealedBoardCount != null ? formatAnimatedBoard(hand.board, extras.revealedBoardCount) : formatBoard(hand.board)}`,
      formatPotLine(snapshot),
    );
    if (extras?.lastAction) {
      const actor = snapshot.seats[extras.lastAction.seatIndex];
      if (actor?.userId) {
        lines.push(`↳ ${formatPokerActor(actor.userId)} **${extras.lastAction.label}**`);
      }
    }
    if (extras?.thinkingSeat != null) {
      const actor = snapshot.seats[extras.thinkingSeat];
      const spinner = extras.spinnerFrame != null ? SPINNER_FRAMES[extras.spinnerFrame % SPINNER_FRAMES.length] : "⏳";
      if (actor?.userId) {
        lines.push(`${spinner} ${formatPokerActor(actor.userId)} is thinking…`);
      }
    } else if (hand.actionSeat != null) {
      const actor = snapshot.seats[hand.actionSeat];
      if (actor?.userId) lines.push(`Waiting for ${formatPokerActor(actor.userId)} to act…`);
    }
  } else if (hand?.street === "complete") {
    if (extras?.banner) lines.push("", extras.banner);
    lines.push("", `**Hand #${snapshot.handNumber} complete**`);
    if (hand.board.length > 0) {
      lines.push(`Board: ${formatBoard(hand.board)}`);
    }
    for (const winner of hand.winners ?? []) {
      const user = snapshot.seats[winner.seatIndex]?.userId;
      if (user) {
        const prefix = extras?.celebrating ? "✨ " : "";
        lines.push(
          `${prefix}${formatPokerActor(user)} wins **${formatCurrency(winner.amount, config)}**${winner.handLabel ? ` (${winner.handLabel})` : ""}`,
        );
      }
    }
  } else {
    lines.push("", "Waiting for players… Host can **Start Hand** when 2+ are seated.");
  }

  const color =
    snapshot.status === "closed"
      ? 0x95a5a6
      : hand && hand.street !== "complete"
        ? 0xf1c40f
        : 0x2ecc71;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("Poker Table")
    .setDescription(lines.join("\n"));
}

export function buildPokerBrowseEmbed(
  tables: { id: string; seated: number; maxSeats: number; blinds: string }[],
  config: Config,
): EmbedBuilder {
  if (tables.length === 0) {
    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle("Open Poker Tables")
      .setDescription("No public tables right now. Create one!");
  }

  const lines = tables.map(
    (t, i) => `**#${i + 1}** — ${t.seated}/${t.maxSeats} players · Blinds ${t.blinds}`,
  );

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("Open Poker Tables")
    .setDescription(lines.join("\n"));
}

export function buildHoleCardsEmbed(cards: string[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("Your Hole Cards")
    .setDescription(cards.map((c) => formatBoard([c])).join(" ") || "—");
}
