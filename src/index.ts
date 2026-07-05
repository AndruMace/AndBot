import { loadConfig } from "./config";
import { createClient } from "./bot/client";
import { getDb, closeDb } from "./db/client";
import { registerInteractionHandler } from "./handlers/interactions";
import { registerActivityHandler } from "./services/activity";
import { createWalletService } from "./services/wallet";
import { createLotteryService } from "./services/lottery/rounds";
import { startLotteryScheduler } from "./services/lottery/scheduler";

const config = loadConfig();
const db = getDb(config.DATABASE_URL);
const client = createClient();

const wallet = createWalletService(db, config);
const lottery = createLotteryService(db, wallet, config);

registerInteractionHandler(client, db, config);
registerActivityHandler(client, wallet, config);
let lotteryScheduler: ReturnType<typeof setInterval> | undefined;

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}`);
  lotteryScheduler = startLotteryScheduler(client, lottery, config);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  if (lotteryScheduler) clearInterval(lotteryScheduler);
  client.destroy();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (lotteryScheduler) clearInterval(lotteryScheduler);
  client.destroy();
  await closeDb();
  process.exit(0);
});

await client.login(config.DISCORD_TOKEN);
