import type { Message } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "./wallet";

export function registerActivityHandler(
  client: { on: (event: "messageCreate", listener: (message: Message) => void) => void },
  wallet: WalletService,
  config: Config,
) {
  client.on("messageCreate", async (message: Message) => {
    if (!message.guildId || message.author.bot || message.system) return;
    if (message.webhookId) return;

    try {
      await wallet.tryMessageReward(
        message.guildId,
        message.author.id,
        config.MESSAGE_REWARD_AMOUNT,
        config.MESSAGE_REWARD_COOLDOWN_MS,
        message.id,
      );
    } catch (err) {
      console.error("Activity reward error:", err);
    }
  });
}
