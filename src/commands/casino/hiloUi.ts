import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { Config } from "../../config";
import type { HiloSession } from "../../db/schema";
import { formatCurrency } from "../../utils/bets";
import { buildButtonId } from "../../utils/buttons";
import {
  HI_LO_MAX_STREAK,
  calculateHiLoPayout,
  canGuess,
  cardRankValue,
  formatHiLoCard,
  getHiLoActionPreview,
} from "../../services/casino/hilo";
import { buildGameHeader, postPublicGameMessage, rollbackCreatedSession } from "./publicMessage";
import type { HiloSessionService } from "../../services/casino/hilo/session";
import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";

function formatStepMultiplier(mult: number): string {
  if (mult <= 0) return "—";
  return `×${mult.toFixed(2)}`;
}

export function buildHiLoEmbed(
  session: HiloSession,
  config: Config,
  footer?: string,
  userId?: string,
): EmbedBuilder {
  const potential = calculateHiLoPayout(session.wager, session.potMultiple);

  let description = "";
  if (userId) {
    description = `${buildGameHeader(userId, "Hi-Lo", session.wager, config)}\n\n`;
  }

  description +=
    `Current card: **${formatHiLoCard(session.currentCard)}**\n` +
    `Pot: **${formatCurrency(potential, config)}** (**${session.potMultiple.toFixed(2)}×**) · Streak: **${session.streak}/${HI_LO_MAX_STREAK}**\n` +
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
  const preview = getHiLoActionPreview(session.remainingDeck, currentRank);
  const guessAllowed = session.status === "active" && canGuess(session.streak, session.remainingDeck.length);

  const guessRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "hl", "higher", session.id))
      .setLabel(`Higher (${formatStepMultiplier(preview.higherMult)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!guessAllowed || preview.higherMult <= 0),
    new ButtonBuilder()
      .setCustomId(buildButtonId("casino", "hl", "lower", session.id))
      .setLabel(`Lower (${formatStepMultiplier(preview.lowerMult)})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!guessAllowed || preview.lowerMult <= 0),
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
    const { message } = await postPublicGameMessage(interaction, async () => {
      const session = await hilo.startSession(guildId, userId, channelId, amount);
      sessionId = session.id;
      return {
        embeds: [buildHiLoEmbed(session, config, undefined, userId)],
        components: hiloComponentsForSession(session),
      };
    });
    await hilo.setMessageId(sessionId, message.id);
  } catch (err) {
    await rollbackCreatedSession(
      err,
      sessionId,
      (id) => hilo.getSession(id),
      (session) => hilo.expireSession(session),
    );
    throw err;
  }
}
