import type { Interaction } from "discord.js";
import { ephemeralOptions } from "./discord";

export function isInteractionAlreadyAcknowledged(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 40060
  );
}

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
