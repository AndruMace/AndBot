import type { Message } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "./wallet";

function isRewardableMessage(message: Message): boolean {
  if (!message.inGuild()) return false;
  if (!message.author || message.author.bot) return false;
  if (message.system) return false;
  if (message.webhookId) return false;
  return true;
}

export function registerActivityHandler(
  client: { on: (event: "messageCreate", listener: (message: Message) => void) => void },
  wallet: WalletService,
  config: Config,
) {
  client.on("messageCreate", async (message: Message) => {
    if (!isRewardableMessage(message)) return;

    try {
      const credited = await wallet.tryMessageReward(
        message.guildId!,
        message.author.id,
        config.MESSAGE_REWARD_AMOUNT,
        config.MESSAGE_REWARD_COOLDOWN_MS,
        message.id,
      );

      if (credited && process.env.ACTIVITY_DEBUG === "true") {
        console.log(
          `Activity reward +${config.MESSAGE_REWARD_AMOUNT} for ${message.author.id} in ${message.guildId}`,
        );
      }
    } catch (err) {
      console.error("Activity reward error:", err);
    }
  });
}
