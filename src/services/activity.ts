import { Events, type Client } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "./wallet";

type MessageCreatePayload = {
  id: string;
  guild_id?: string;
  author?: { id: string; bot?: boolean };
  webhook_id?: string | null;
  type?: number;
};

/** Default user messages and replies — not joins, pins, boosts, etc. */
const REWARDABLE_MESSAGE_TYPES = new Set([0, 19]);

function isRewardablePayload(data: MessageCreatePayload): boolean {
  if (!data.guild_id || !data.author || data.author.bot) return false;
  if (data.webhook_id) return false;
  if (data.type !== undefined && !REWARDABLE_MESSAGE_TYPES.has(data.type)) return false;
  return true;
}

function activityDebugEnabled(): boolean {
  return process.env.ACTIVITY_DEBUG === "true";
}

export function registerActivityHandler(
  client: Client,
  wallet: WalletService,
  config: Config,
) {
  const debug = activityDebugEnabled();
  let rawMessageCount = 0;

  if (debug) {
    console.log("ACTIVITY_DEBUG enabled — logging MESSAGE_CREATE packets");
  }

  client.on(Events.Raw, async (packet: { t: string; d: unknown }) => {
    if (packet.t !== "MESSAGE_CREATE") return;

    const data = packet.d as MessageCreatePayload;
    if (debug && rawMessageCount < 5) {
      rawMessageCount++;
      console.log("MESSAGE_CREATE received", {
        guildId: data.guild_id,
        authorId: data.author?.id,
        bot: data.author?.bot,
        type: data.type,
        webhook: Boolean(data.webhook_id),
      });
    }

    if (!isRewardablePayload(data)) {
      if (debug && data.guild_id && data.author && !data.author.bot) {
        console.log("Activity skip: message type not rewardable", {
          type: data.type,
          authorId: data.author.id,
        });
      }
      return;
    }

    try {
      const credited = await wallet.tryMessageReward(
        data.guild_id!,
        data.author!.id,
        config.MESSAGE_REWARD_AMOUNT,
        config.MESSAGE_REWARD_COOLDOWN_MS,
        data.id,
      );

      if (debug) {
        console.log(
          credited
            ? `Activity reward +${config.MESSAGE_REWARD_AMOUNT} for ${data.author!.id} in ${data.guild_id}`
            : `Activity cooldown for ${data.author!.id} in ${data.guild_id}`,
        );
      }
    } catch (err) {
      console.error("Activity reward error:", err);
    }
  });
}

export { isRewardablePayload, REWARDABLE_MESSAGE_TYPES };
