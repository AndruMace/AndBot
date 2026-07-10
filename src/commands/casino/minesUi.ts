import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { Config } from "../../config";
import type { MinesSession } from "../../db/schema";
import { formatCurrency } from "../../utils/bets";
import { buildButtonId } from "../../utils/buttons";
import {
  MINES_COLUMNS,
  MINES_ROWS,
  gemMultiplier,
} from "../../services/casino/mines/engine";
import { buildGameHeader } from "./publicMessage";

export function buildMinesEmbed(
  session: MinesSession,
  config: Config,
  footer?: string,
  userId?: string,
): EmbedBuilder {
  const mult = gemMultiplier(session.gemsFound);
  const potential = Math.floor(session.wager * mult);

  let description = "";
  if (userId) {
    description = `${buildGameHeader(userId, "Mines", session.wager, config)}\n\n`;
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

export function buildMinesComponents(session: MinesSession): ActionRowBuilder<ButtonBuilder>[] {
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
