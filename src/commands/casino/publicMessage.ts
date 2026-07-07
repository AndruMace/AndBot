import {
  EmbedBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type Message,
  type MessageEditOptions,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Config } from "../../config";
import { formatCurrency } from "../../utils/bets";
import { ephemeralOptions, EPHEMERAL } from "../../utils/discord";

export type PublicMessageEdit = (payload: MessageEditOptions) => Promise<unknown>;

export type SetupInteraction = ButtonInteraction | ModalSubmitInteraction;

const SETUP_ACK = "Your game is now visible in the channel below.";

export function buildGameHeader(
  userId: string,
  gameLabel: string,
  wager: number,
  config: Config,
): string {
  return `<@${userId}> · **${gameLabel}** · wager **${formatCurrency(wager, config)}**`;
}

export function publicResultFooter(
  wager: number,
  payout: number,
  config: Config,
  options?: { lost?: boolean; balance?: number },
): string {
  let footer = `Wager: **${formatCurrency(wager, config)}**`;
  if (payout > 0) {
    footer += `\nPayout: **${formatCurrency(payout, config)}**`;
  } else if (options?.lost) {
    footer += `\nLost: **${formatCurrency(wager, config)}**`;
  }
  if (options?.balance != null) {
    footer += `\nBalance: **${formatCurrency(options.balance, config)}**`;
  }
  return footer;
}

export function prefixDescription(header: string, body: string): string {
  return `${header}\n\n${body}`;
}

export async function deferSetupInteraction(interaction: SetupInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) return;

  if (interaction.isButton()) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: EPHEMERAL });
  }
}

export async function finalizeSetupInteraction(interaction: SetupInteraction): Promise<void> {
  await interaction.editReply({
    content: SETUP_ACK,
    embeds: [],
    components: [],
  });
}

/** @deprecated use finalizeSetupInteraction after deferSetupInteraction */
export async function acknowledgeSetup(interaction: SetupInteraction): Promise<void> {
  await finalizeSetupInteraction(interaction);
}

type PublicPayload = {
  content?: string | null;
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
};

export type PublicPayloadFactory = () => Promise<PublicPayload>;

export class PublicGameMessageError extends Error {
  constructor(
    message: string,
    public readonly publishedMessageId?: string,
  ) {
    super(message);
    this.name = "PublicGameMessageError";
  }
}

/** Refund and close a session when posting the public game message failed before publish. */
export async function rollbackCreatedSession<T extends { status: string }>(
  err: unknown,
  sessionId: string | undefined,
  getSession: (id: string) => Promise<T | null>,
  expireSession: (session: T) => Promise<void>,
): Promise<void> {
  if (!sessionId) return;
  if (err instanceof PublicGameMessageError && err.publishedMessageId) return;

  const session = await getSession(sessionId);
  if (session?.status === "active") {
    await expireSession(session);
  }
}

export async function postPublicGameMessage(
  interaction: SetupInteraction,
  payload: PublicPayload | PublicPayloadFactory,
): Promise<{ message: Message; edit: PublicMessageEdit }> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error("This command can only be used in a server channel.");
  }

  await deferSetupInteraction(interaction);

  let message: Message | undefined;

  try {
    const resolved = typeof payload === "function" ? await payload() : payload;

    message = await channel.send({
      content: resolved.content ?? undefined,
      embeds: resolved.embeds ?? [],
      components: resolved.components ?? [],
    });

    await finalizeSetupInteraction(interaction);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to post public game message.";
    throw new PublicGameMessageError(reason, message?.id);
  }

  return {
    message: message!,
    edit: (p) => message!.edit(p),
  };
}

export function buildLotteryPublicDescription(
  userId: string,
  count: number,
  totalCost: number,
  roundNumber: number,
  potAmount: number,
  ticketCount: number,
  drawIn: string,
  config: Config,
): string {
  return (
    `<@${userId}> bought **${count}** ticket${count === 1 ? "" : "s"} for **${formatCurrency(totalCost, config)}**\n` +
    `Round **#${roundNumber}** · Pot: **${formatCurrency(potAmount, config)}** · ${ticketCount} tickets sold · Draw in **${drawIn}**`
  );
}

export async function postLotteryPublicAnnouncement(
  interaction: SetupInteraction,
  description: string,
  config: Config,
): Promise<void> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return;
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Lottery")
        .setDescription(description)
        .setFooter({
          text: `${config.LOTTERY_RAKE_PERCENT}% house fee · Draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
        }),
    ],
  });
}

export { ephemeralOptions };
