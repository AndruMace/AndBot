import { loadConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { closeDb, getDb } from "./db/client";
import { reconcileBlackjackSessions } from "./services/blackjack/reconcile";
import { reconcileHiloSessions } from "./services/casino/hilo/reconcile";

const config = loadConfig();
const db = getDb(config.DATABASE_URL);
await reconcileBlackjackSessions(db, config);
await reconcileHiloSessions(db, config);
await runMigrations(config.DATABASE_URL);
await closeDb();

await import("./index");
