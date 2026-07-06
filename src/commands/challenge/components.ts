import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { buildButtonId } from "../../utils/buttons";
import type { PvpGameType } from "../../db/schema";
import type { RecentOpponentChoice } from "../../services/pvp/recentOpponents";

export function recentOpponentRows(
  game: PvpGameType,
  opponents: RecentOpponentChoice[],
): ActionRowBuilder<ButtonBuilder>[] {
  if (opponents.length === 0) return [];

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < opponents.length; i += 5) {
    const chunk = opponents.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((opponent) =>
          new ButtonBuilder()
            .setCustomId(buildButtonId("challenge", "recent", game, opponent.id))
            .setLabel(opponent.label)
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function opponentUsernameModal(game: PvpGameType): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildButtonId("challenge", "modal", "user", game))
    .setTitle("Challenge by username")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("username")
          .setLabel("Username or display name")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. Sarah or their username")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(32),
      ),
    );
}

export function opponentSelectRow(game: PvpGameType): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(buildButtonId("challenge", "user", game))
      .setPlaceholder("Or browse all members (scroll — search often fails)")
      .setMinValues(1)
      .setMaxValues(1),
  );
}

export function opponentUsernameButtonRow(game: PvpGameType): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("challenge", "name", game))
      .setLabel("Type username")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("⌨️"),
  );
}
