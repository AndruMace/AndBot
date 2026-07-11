import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  GUILD_ID: z.string().optional(),
  CURRENCY_NAME: z.string().default("coins"),
  STARTING_BALANCE: z.coerce.number().int().min(0).default(0),
  DAILY_AMOUNT: z.coerce.number().int().positive().default(500),
  WEEKLY_AMOUNT: z.coerce.number().int().positive().default(2500),
  MIN_BET: z.coerce.number().int().positive().default(1),
  MAX_BET: z.coerce.number().int().positive().default(100_000),
  CHALLENGE_EXPIRY_MINUTES: z.coerce.number().int().positive().default(5),
  BLACKJACK_SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
  LOTTERY_TICKET_PRICE: z.coerce.number().int().positive().default(100),
  LOTTERY_DRAW_INTERVAL_DAYS: z.coerce.number().int().positive().default(7),
  LOTTERY_RAKE_PERCENT: z.coerce.number().int().min(0).max(50).default(5),
  LOTTERY_MAX_TICKETS_PER_PURCHASE: z.coerce.number().int().positive().default(50),
  DAILY_STREAK_BONUS_PER_DAY: z.coerce.number().int().positive().default(10),
  DAILY_MAX_PAYOUT: z.coerce.number().int().positive().default(10_000),
  MESSAGE_REWARD_AMOUNT: z.coerce.number().int().positive().default(1),
  MESSAGE_REWARD_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
  ACTIVITY_DEBUG: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  TICKET_MOD_CHANNEL_ID: z.string().optional(),
  TICKET_MAX_OPEN_PER_USER: z.coerce.number().int().positive().default(3),
  TICKET_TITLE_MAX_LENGTH: z.coerce.number().int().positive().default(100),
  TICKET_BODY_MAX_LENGTH: z.coerce.number().int().positive().default(1000),
  POKER_MIN_PLAYERS: z.coerce.number().int().positive().default(2),
  POKER_MAX_PLAYERS: z.coerce.number().int().positive().default(6),
  POKER_ACTION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  POKER_TABLE_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),
  POKER_DEFAULT_SMALL_BLIND: z.coerce.number().int().positive().optional(),
  POKER_DEFAULT_BIG_BLIND: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }

  const config = result.data;
  if (config.MIN_BET > config.MAX_BET) {
    console.error("MIN_BET cannot be greater than MAX_BET");
    process.exit(1);
  }

  return config;
}
