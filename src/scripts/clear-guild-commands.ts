import { loadConfig } from "../config";
import { clearGuildCommands } from "./sync-commands";

const config = loadConfig();

console.log("Clearing guild slash commands...");
await clearGuildCommands(config);
