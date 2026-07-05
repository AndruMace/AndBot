import { loadConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { closeDb } from "./db/client";

const config = loadConfig();
await runMigrations(config.DATABASE_URL);
await closeDb();

await import("./index");
