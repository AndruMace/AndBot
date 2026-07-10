import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { Config } from "../../config";
import type { HiloSession } from "../../db/schema";
import { formatCurrency } from "../../utils/bets";
import { buildButtonId } from "../../utils/buttons";
import {
  calculateHiLoPayout,
  canGuess,
  cardRankValue,
  choiceHasWinningOutcomes,
  formatHiLoCard,
  formatHiLoNextPayoutLabel,
  getHiLoPotMultiple,
} from "../../services/casino/hilo";
import { buildGameHeader, postPublicGameMessage, rollbackCreatedSession } from "./publicMessage";
import type { HiloSessionService } from "../../services/casino/hilo/session";
import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";

export function buildHiLoEmbed(
  session: HiloSession,
  config: Config,
  footer?: string,
  userId?: string,
): EmbedBuilder {
  const potMultiple =
    session.status === "cashed_out" ? session.potMultiple : getHiLoPotMultiple(session.streak);
  const potential = calculateHiLoPayout(session.wager, potMultiple);

  let description = "";
  if (userId) {
    description = `${buildGameHeader(userId, "Hi-Lo", session.wager, config)}\n\n`;
  }

  description +=
    `Current card: **${formatHiLoCard(session.currentCard)}**\n` +
    `Pot: **${formatCurrency(potential, config)}** (**${potMultiple.toFixed(2)}×**) · Streak: **${session.streak}**\n` +
    `Cards left: **${session.remainingDeck.length}**\n` +
    `Pick higher or lower — or cash out.` +
    (footer ? `\n\n${footer}` : "");

  const color =
    session.status === "busted"
      ? 0xed4245
      : session.status === "cashed_out"
        ? 0x57f287
        : 0x3498db;

  return new EmbedBuilder().setColor(color).setTitle("Hi-Lo").setDescription(description);
}

export function hiloComponentsForSession(session: HiloSession): ActionRowBuilder<ButtonBuilder>[] {
  const currentRank = cardRankValue(session.currentCard);
  const guessAllowed = session.status === "active" && canGuess(session.remainingDeck.length);
  const nextLabel = formatHiLoNextPayoutLabel(session.streak);
  const higherOk = choiceHasWinningOutcomes(session.remainingDeck, currentRank, "higher");
  const lowerOk = choiceHasWinningOutcomes(session.remainingDeck, currentRank, "lower");

  const guessRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "hl", "higher", session.id))
      .setLabel(`Higher (${nextLabel})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!guessAllowed || !higherOk),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "hl", "lower", session.id))
      .setLabel(`Lower (${nextLabel})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!guessAllowed || !lowerOk),
  );

  const cashRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "hl", "out", session.id))
      .setLabel("Cash Out")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("💰")
      .setDisabled(session.status !== "active"),
  );

  return [guessRow, cashRow];
}

export async function startHiLoPublicSession(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  hilo: HiloSessionService,
  guildId: string,
  userId: string,
  channelId: string,
  amount: number,
  config: Config,
) {
  let sessionId = "";

  try {
    await postPublicGameMessage(
      interaction,
      async () => {
        const session = await hilo.startSession(guildId, userId, channelId, amount);
        sessionId = session.id;
        return {
          embeds: [buildHiLoEmbed(session, config, undefined, userId)],
          components: hiloComponentsForSession(session),
        };
      },
      async (message) => {
        await hilo.setMessageId(sessionId, message.id);
      },
    );
  } catch (err) {
    await rollbackCreatedSession(
      err,
      sessionId,
      (id) => hilo.getSession(id),
      (session) => hilo.expireSession(session).then(() => undefined),
    );
    throw err;
  }
}
