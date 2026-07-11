import { EmbedBuilder, Routes, type Client } from "discord.js";
import { buildHoleCardsEmbed } from "./embeds";

type StoredEphemeral = {
  messageId: string;
  token: string;
  applicationId: string;
};

const store = new Map<string, StoredEphemeral>();

function storeKey(tableId: string, userId: string): string {
  return `${tableId}:${userId}`;
}

function applicationId(client: Client): string | null {
  return client.application?.id ?? client.user?.id ?? null;
}

async function patchEphemeral(
  client: Client,
  stored: StoredEphemeral,
  embed: EmbedBuilder,
): Promise<boolean> {
  try {
    await client.rest.patch(
      Routes.webhookMessage(stored.applicationId, stored.token, stored.messageId),
      { body: { embeds: [embed.toJSON()] } },
    );
    return true;
  } catch {
    return false;
  }
}

function holeCardsEmbed(cards: string[], handActive: boolean): EmbedBuilder {
  if (handActive && cards.length > 0) return buildHoleCardsEmbed(cards);
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("Your Hole Cards")
    .setDescription("_No active hand._");
}

type EphemeralInteraction = {
  user: { id: string };
  client: Client;
  token: string;
  followUp: (opts: {
    embeds: EmbedBuilder[];
    ephemeral: boolean;
    fetchReply: boolean;
  }) => Promise<{ id: string }>;
};

/** One ephemeral hole-card message per player per table; edits in place when possible. */
export async function upsertHoleCardsEphemeral(
  interaction: EphemeralInteraction,
  tableId: string,
  userId: string,
  cards: string[],
  handActive: boolean,
): Promise<void> {
  const appId = applicationId(interaction.client);
  if (!appId) return;

  const embed = holeCardsEmbed(cards, handActive);
  const key = storeKey(tableId, userId);
  const existing = store.get(key);

  if (existing) {
    const ok = await patchEphemeral(interaction.client, existing, embed);
    if (ok) return;
    store.delete(key);
  }

  if (interaction.user.id !== userId) return;

  const msg = await interaction.followUp({
    embeds: [embed],
    ephemeral: true,
    fetchReply: true,
  });

  store.set(key, {
    messageId: msg.id,
    token: interaction.token,
    applicationId: appId,
  });
}

export function forgetHoleCardsEphemeral(tableId: string, userId: string): void {
  store.delete(storeKey(tableId, userId));
}
