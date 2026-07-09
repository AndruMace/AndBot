import { loadConfig } from "./config";
import { createClient } from "./bot/client";
import { getDb, closeDb } from "./db/client";
import { registerInteractionHandler } from "./handlers/interactions";
import { registerActivityHandler } from "./services/activity";
import { createWalletService } from "./services/wallet";
import { createLotteryService } from "./services/lottery/rounds";
import { startLotteryScheduler } from "./services/lottery/scheduler";
import { createBlackjackSessionService } from "./services/blackjack/session";
import { startBlackjackScheduler } from "./services/blackjack/scheduler";

const config = loadConfig();
const db = getDb(config.DATABASE_URL);
const client = createClient();

const wallet = createWalletService(db, config);
const lottery = createLotteryService(db, wallet, config);
const blackjack = createBlackjackSessionService(db, wallet, config);

registerInteractionHandler(client, db, config);
registerActivityHandler(client, wallet, config);
let lotteryScheduler: ReturnType<typeof setInterval> | undefined;
let blackjackScheduler: ReturnType<typeof setInterval> | undefined;

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  console.log(
    `Activity rewards: ${config.MESSAGE_REWARD_AMOUNT} ${config.CURRENCY_NAME} per message (${config.MESSAGE_REWARD_COOLDOWN_MS / 1000}s cooldown)`,
  );

  await Promise.allSettled(
    [...client.guilds.cache.values()].map((guild) => guild.channels.fetch()),
  );

  lotteryScheduler = startLotteryScheduler(client, lottery, config);
  blackjackScheduler = startBlackjackScheduler(blackjack);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  if (lotteryScheduler) clearInterval(lotteryScheduler);
  if (blackjackScheduler) clearInterval(blackjackScheduler);
  client.destroy();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (lotteryScheduler) clearInterval(lotteryScheduler);
  if (blackjackScheduler) clearInterval(blackjackScheduler);
  client.destroy();
  await closeDb();
  process.exit(0);
});

await client.login(config.DISCORD_TOKEN);
