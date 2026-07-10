import { Events, type Client } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "./wallet";

/** Bump when changing deploy diagnostics so logs confirm the running build. */
export const ACTIVITY_HANDLER_VERSION = "gateway-raw-v2";

type MessageCreatePayload = {
  id: string;
  guild_id?: string;
  author?: { id: string; bot?: boolean };
  webhook_id?: string | null;
  type?: number;
};

/** Default user messages and replies — not joins, pins, boosts, etc. */
const REWARDABLE_MESSAGE_TYPES = new Set([0, 19]);

/**
 * In-memory cooldown gate so messages sent during a known cooldown skip the DB
 * entirely. The DB timestamp remains the source of truth for actual credits.
 */
class CooldownCache {
  private lastRewardAt = new Map<string, number>();
  private lastSweepAt = 0;

  constructor(private cooldownMs: number) {}

  isOnCooldown(guildId: string, userId: string, now: number): boolean {
    const last = this.lastRewardAt.get(`${guildId}:${userId}`);
    return last !== undefined && now - last < this.cooldownMs;
  }

  markRewarded(guildId: string, userId: string, now: number): void {
    this.lastRewardAt.set(`${guildId}:${userId}`, now);
    this.sweep(now);
  }

  /** Drop expired entries at most once per cooldown period to bound memory. */
  private sweep(now: number): void {
    if (now - this.lastSweepAt < this.cooldownMs) return;
    this.lastSweepAt = now;
    for (const [key, ts] of this.lastRewardAt) {
      if (now - ts >= this.cooldownMs) this.lastRewardAt.delete(key);
    }
  }
}

function isRewardablePayload(data: MessageCreatePayload): boolean {
  if (!data.guild_id || !data.author || data.author.bot) return false;
  if (data.webhook_id) return false;
  if (data.type !== undefined && !REWARDABLE_MESSAGE_TYPES.has(data.type)) return false;
  return true;
}

export function registerActivityHandler(
  client: Client,
  wallet: WalletService,
  config: Config,
) {
  const debug = config.ACTIVITY_DEBUG;
  const cooldowns = new CooldownCache(config.MESSAGE_REWARD_COOLDOWN_MS);
  let rawMessageCount = 0;
  let loggedFirstGatewayMessage = false;

  console.log(`Activity handler ${ACTIVITY_HANDLER_VERSION} registered`);

  if (debug) {
    console.log("ACTIVITY_DEBUG enabled — logging MESSAGE_CREATE packets");
  }

  client.on(Events.Raw, async (packet: { t: string; d: unknown }) => {
    if (packet.t !== "MESSAGE_CREATE") return;

    const data = packet.d as MessageCreatePayload;

    if (!loggedFirstGatewayMessage) {
      loggedFirstGatewayMessage = true;
      console.log("First MESSAGE_CREATE from Discord gateway", {
        guildId: data.guild_id ?? null,
        authorId: data.author?.id ?? null,
      });
    }

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

    const now = Date.now();
    if (cooldowns.isOnCooldown(data.guild_id!, data.author!.id, now)) {
      if (debug) {
        console.log(`Activity cooldown (cached) for ${data.author!.id} in ${data.guild_id}`);
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

      if (credited) {
        cooldowns.markRewarded(data.guild_id!, data.author!.id, now);
      }

      if (debug) {
        console.log(
          credited
            ? `Activity reward +${config.MESSAGE_REWARD_AMOUNT} for ${data.author!.id} in ${data.guild_id}`
            : `Activity cooldown for ${data.author!.id} in ${data.guild_id}`,
        );
      } else if (credited) {
        console.log(`Activity reward +${config.MESSAGE_REWARD_AMOUNT} for ${data.author!.id}`);
      }
    } catch (err) {
      console.error("Activity reward error:", err);
    }
  });
}

export { isRewardablePayload, REWARDABLE_MESSAGE_TYPES };
