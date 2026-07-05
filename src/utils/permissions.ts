import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";

export function hasManageGuild(interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export function assertManageGuild(interaction: ChatInputCommandInteraction): void {
  if (!hasManageGuild(interaction)) {
    throw new Error("You need the Manage Server permission to use this command.");
  }
}

export function assertGuild(interaction: { guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new Error("This command can only be used in a server.");
  }
  return interaction.guildId;
}
