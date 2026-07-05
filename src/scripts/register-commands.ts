import { loadConfig } from "../config";
import { syncSlashCommands } from "./sync-commands";

const config = loadConfig();

console.log("Registering slash commands...");
await syncSlashCommands(config);
