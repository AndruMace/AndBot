import { MessageFlags, type InteractionReplyOptions } from "discord.js";

export const EPHEMERAL = MessageFlags.Ephemeral;

export function ephemeralOptions(
  options: Omit<InteractionReplyOptions, "flags">,
): InteractionReplyOptions {
  return { ...options, flags: EPHEMERAL };
}
