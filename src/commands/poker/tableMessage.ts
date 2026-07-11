import { type Client, type TextChannel } from "discord.js";
import type { Config } from "../../config";
import type { PokerTableService } from "../../services/poker/table";
import type { TableSnapshot } from "../../services/poker/types";
import { buildPokerTableEmbed, type TableEmbedExtras } from "./embeds";
import { pokerTableComponents } from "./components";

export type { TableEmbedExtras } from "./embeds";

export async function editPokerTableMessage(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  extras?: TableEmbedExtras,
): Promise<TableSnapshot | null> {
  const snapshot = await poker.getSnapshot(tableId);
  if (!snapshot) return null;

  const loaded = await poker.getTable(tableId);
  if (!loaded?.table.messageId) return snapshot;

  const channel = await client.channels.fetch(loaded.table.channelId).catch(() => null);
  if (!channel?.isTextBased()) return snapshot;

  const embed = buildPokerTableEmbed(snapshot, config, extras);
  const components =
    extras?.interactive === false ? [] : pokerTableComponents(snapshot, viewerUserId);

  try {
    const msg = await (channel as TextChannel).messages.fetch(loaded.table.messageId);
    await msg.edit({ embeds: [embed], components });
  } catch {
    // message may be gone
  }

  return snapshot;
}
