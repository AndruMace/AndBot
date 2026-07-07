import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildButtonId } from "../../utils/buttons";
import type { Config } from "../../config";
import type { CasinoGame } from "./types";
import {
  formatWagerButtonLabel,
  getWagerPresets,
  wagerSelectionDescription,
} from "./wagers";
import { EmbedBuilder } from "discord.js";

export function coinflipSideRow(userId: string, amount: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "cf", "heads", userId, String(amount)))
      .setLabel("Heads")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "cf", "tails", userId, String(amount)))
      .setLabel("Tails")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function hiloChoiceRow(
  userId: string,
  amount: number,
  currentRank: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("casino", "hl", "higher", userId, String(amount), String(currentRank)),
      )
      .setLabel("Higher")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(
        buildButtonId("casino", "hl", "lower", userId, String(amount), String(currentRank)),
      )
      .setLabel("Lower")
      .setStyle(ButtonStyle.Danger),
  );
}

export function minesCountRow(userId: string, amount: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "mn", "cfg", "3", userId, String(amount)))
      .setLabel("3 Mines")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "mn", "cfg", "5", userId, String(amount)))
      .setLabel("5 Mines")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "mn", "cfg", "8", userId, String(amount)))
      .setLabel("8 Mines")
      .setStyle(ButtonStyle.Danger),
  );
}

export function luckyNumberRows(amount: number): ActionRowBuilder<ButtonBuilder>[] {
  const picks = ["7", "13", "42", "77"];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...picks.map((pick) =>
        new ButtonBuilder()
          .setCustomId(buildButtonId("casino", "ln", pick, String(amount)))
          .setLabel(pick)
          .setStyle(ButtonStyle.Primary),
      ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "ln", "rand", String(amount)))
        .setLabel("Random")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎲"),
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "ln", "custom", String(amount)))
        .setLabel("Custom #")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function wagerSelectionEmbed(
  game: CasinoGame,
  config: Config,
  balance: number,
  lastWager: number | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("Choose Your Wager")
    .setDescription(wagerSelectionDescription(game, config, balance, lastWager));
}

export function wagerSelectionRows(
  game: CasinoGame,
  config: Config,
  balance: number,
  lastWager: number | null,
): ActionRowBuilder<ButtonBuilder>[] {
  const presets = getWagerPresets(config, balance);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (presets.length > 0) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...presets.map((amount) =>
          new ButtonBuilder()
            .setCustomId(buildButtonId("casino", "bet", game, String(amount)))
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
        .setCustomId(buildButtonId("casino", "bet", game, "repeat"))
        .setLabel(`Repeat ${formatWagerButtonLabel(lastWager)}`)
        .setStyle(ButtonStyle.Success),
    );
  }
  secondary.addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "custom", game))
      .setLabel("Custom")
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(secondary);

  return rows;
}

export function customWagerModal(game: CasinoGame): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildButtonId("casino", "modal", "custom", game))
    .setTitle("Custom Wager")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Wager amount")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter amount")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10),
      ),
    );
}

export function customLuckyNumberModal(amount: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildButtonId("casino", "modal", "ln", String(amount)))
    .setTitle("Lucky Number")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("number")
          .setLabel("Your number (1–100)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1-100")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3),
      ),
    );
}

export function customLotteryTicketModal(config: Config): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildButtonId("casino", "modal", "lot"))
    .setTitle("Buy Lottery Tickets")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("count")
          .setLabel("Number of tickets")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`1–${config.LOTTERY_MAX_TICKETS_PER_PURCHASE}`)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3),
      ),
    );
}
