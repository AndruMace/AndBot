import type { Interaction } from "discord.js";
import { ephemeralOptions } from "./discord";

export async function replyInteractionError(
  interaction: Interaction,
  message = "Something went wrong. Check that Postgres is running and the bot has Send Messages permission.",
) {
  if (!interaction.isRepliable()) return;

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message }).catch(() => {});
  } else {
    await interaction.reply(ephemeralOptions({ content: message })).catch(() => {});
  }
}
