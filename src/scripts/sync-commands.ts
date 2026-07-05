import { REST, Routes } from "discord.js";
import type { Config } from "../config";
import { commands } from "../commands/definitions";

function guildInstantCommandsEnabled(config: Config): boolean {
  return process.env.GUILD_INSTANT_COMMANDS === "true";
}

export async function clearGuildCommands(config: Config): Promise<void> {
  if (!config.GUILD_ID) {
    throw new Error("GUILD_ID is required to clear guild commands.");
  }

  const rest = new REST().setToken(config.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
    body: [],
  });
  console.log(`Cleared guild commands for ${config.GUILD_ID}. Global commands are unchanged.`);
}

export async function syncSlashCommands(config: Config): Promise<void> {
  const rest = new REST().setToken(config.DISCORD_TOKEN);
  const names = commands.map((cmd) => cmd.name);
  const guildOnly = process.env.GUILD_COMMANDS_ONLY === "true";
  const guildInstant = guildInstantCommandsEnabled(config);

  if (guildOnly) {
    if (!config.GUILD_ID) {
      throw new Error("GUILD_COMMANDS_ONLY requires GUILD_ID to be set.");
    }

    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
      body: commands,
    });
    console.log(
      `Registered ${commands.length} guild-only commands for ${config.GUILD_ID}: ${names.join(", ")}`,
    );
    console.warn(
      "Commands are only available in this guild. Unset GUILD_COMMANDS_ONLY and run register-commands for global deploy.",
    );
    return;
  }

  await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global commands: ${names.join(", ")}`);

  if (config.GUILD_ID && guildInstant) {
    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
      body: commands,
    });
    console.warn(
      `Also registered guild commands for ${config.GUILD_ID}. ` +
        "This causes duplicate commands in that server. " +
        "Run 'bun run clear-guild-commands' to remove guild copies and keep global only.",
    );
    return;
  }

  if (config.GUILD_ID) {
    console.log(
      `GUILD_ID is set but guild commands were not registered (avoids duplicates). ` +
        "Global updates can take up to 1 hour in that server. " +
        "For instant dev updates without duplicates, use GUILD_COMMANDS_ONLY=true. " +
        "For instant + global (with duplicates), use GUILD_INSTANT_COMMANDS=true.",
    );
  } else {
    console.warn("Global command updates can take up to 1 hour to appear in Discord.");
  }
}
