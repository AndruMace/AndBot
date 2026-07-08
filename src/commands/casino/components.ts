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
import { CASINO_GAMES, type CasinoGame } from "./types";
import {
  casinoAgainButtonId,
  casinoSetupButtonId,
  type CasinoReplayOptions,
} from "./replay";
import { LOTTERY_MENU } from "./lottery-menu";
import {
  formatWagerButtonLabel,
  getMaxAffordableWager,
  getWagerPresets,
  wagerSelectionDescription,
} from "./wagers";
import { formatCurrency } from "../../utils/bets";
import { EmbedBuilder } from "discord.js";

export function casinoMenuEmbed(config: Config): EmbedBuilder {
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

export function casinoMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
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

export function casinoStartOwnGameRow(
  userId: string,
  game: CasinoGame,
): ActionRowBuilder<ButtonBuilder> {
  const info = CASINO_GAMES.find((g) => g.id === game);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(casinoSetupButtonId(userId, game))
      .setLabel(`Play ${info?.label ?? game}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(info?.emoji ?? "🎰"),
  );
}

export function casinoStartOwnGameComponents(
  userId: string,
  game: CasinoGame,
): ActionRowBuilder<ButtonBuilder>[] {
  return [casinoStartOwnGameRow(userId, game)];
}

export function casinoPostGameRow(replay: CasinoReplayOptions): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(casinoAgainButtonId(replay))
      .setLabel("Play Again")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔁"),
    new ButtonBuilder()
      .setCustomId(casinoSetupButtonId(replay.userId, replay.game))
      .setLabel("New Wager")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "menu"))
      .setLabel("Casino Menu")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🎰"),
  );
}

export function casinoPostGameComponents(
  replay: CasinoReplayOptions,
): ActionRowBuilder<ButtonBuilder>[] {
  return [casinoPostGameRow(replay)];
}

export function rouletteBetRow(userId: string, amount: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "ro", "red", userId, String(amount)))
      .setLabel("Red")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔴"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "ro", "black", userId, String(amount)))
      .setLabel("Black")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚫"),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "ro", "odd", userId, String(amount)))
      .setLabel("Odd")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "ro", "even", userId, String(amount)))
      .setLabel("Even")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "ro", "zero", userId, String(amount)))
      .setLabel("0 (36×)")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🟢"),
  );
}

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

export function kenoPickRows(amount: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "kn", "qp", "3", String(amount)))
        .setLabel("Quick Pick 3")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "kn", "qp", "5", String(amount)))
        .setLabel("Quick Pick 5")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "kn", "qp", "8", String(amount)))
        .setLabel("Quick Pick 8")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildButtonId("casino", "kn", "custom", String(amount)))
        .setLabel("Custom Numbers")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
    ),
  ];
}

export function customKenoModal(amount: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildButtonId("casino", "modal", "kn", String(amount)))
    .setTitle("Keno — Pick Numbers")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("picks")
          .setLabel("Numbers (1–80, comma-separated)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("e.g. 3, 7, 14, 22, 31")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(120),
      ),
    );
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
      .setLabel("Custom Amount")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
  );
  rows.push(secondary);

  return rows;
}

export function customWagerModal(
  game: CasinoGame,
  config: Config,
  balance: number,
): ModalBuilder {
  const max = getMaxAffordableWager(config, balance);
  return new ModalBuilder()
    .setCustomId(buildButtonId("casino", "modal", "custom", game))
    .setTitle("Custom Wager")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Wager amount")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`${config.MIN_BET} – ${max.toLocaleString()}`)
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
