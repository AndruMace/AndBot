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
      .setPlaceholder("Browse members (scroll if search fails)")
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
