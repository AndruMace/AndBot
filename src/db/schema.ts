import {
  pgTable,
  serial,
  text,
  timestamp,
  bigint,
  uniqueIndex,
  index,
  pgEnum,
  boolean,
  integer,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "daily",
  "weekly",
  "pay_sent",
  "pay_received",
  "coinflip_bet",
  "coinflip_win",
  "blackjack_bet",
  "blackjack_win",
  "blackjack_push",
  "blackjack_refund",
  "slots_bet",
  "slots_win",
  "hilo_bet",
  "hilo_win",
  "lucky_bet",
  "lucky_win",
  "mines_bet",
  "mines_win",
  "mines_refund",
  "plinko_bet",
  "plinko_win",
  "pvp_escrow",
  "pvp_payout",
  "pvp_refund",
  "admin_give",
  "admin_take",
  "lottery_ticket",
  "lottery_win",
  "lottery_refund",
  "activity_message",
]);

export const minesSessionStatusEnum = pgEnum("mines_session_status", [
  "active",
  "busted",
  "cashed_out",
  "expired",
]);

export const lotteryRoundStatusEnum = pgEnum("lottery_round_status", ["open", "completed"]);

export const pvpGameTypeEnum = pgEnum("pvp_game_type", ["rps", "dice"]);

export const pvpChallengeStatusEnum = pgEnum("pvp_challenge_status", [
  "pending",
  "active",
  "completed",
  "declined",
  "expired",
  "cancelled",
]);

export const blackjackSessionStatusEnum = pgEnum("blackjack_session_status", [
  "active",
  "completed",
  "expired",
]);

export const wallets = pgTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    lastWager: bigint("last_wager", { mode: "number" }),
    dailyStreak: integer("daily_streak").notNull().default(0),
    lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
    lastWeeklyAt: timestamp("last_weekly_at", { withTimezone: true }),
    lastMessageRewardAt: timestamp("last_message_reward_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wallets_guild_user_idx").on(table.guildId, table.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_guild_user_created_idx").on(table.guildId, table.userId, table.createdAt),
  ],
);

export const pvpChallenges = pgTable(
  "pvp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),
    challengerId: text("challenger_id").notNull(),
    opponentId: text("opponent_id").notNull(),
    gameType: pvpGameTypeEnum("game_type").notNull(),
    wager: bigint("wager", { mode: "number" }).notNull(),
    status: pvpChallengeStatusEnum("status").notNull().default("pending"),
    challengerChoice: text("challenger_choice"),
    opponentChoice: text("opponent_choice"),
    challengerRoll: integer("challenger_roll"),
    opponentRoll: integer("opponent_roll"),
    winnerId: text("winner_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pvp_challenges_guild_status_idx").on(table.guildId, table.status),
    index("pvp_challenges_pair_idx").on(
      table.guildId,
      table.challengerId,
      table.opponentId,
      table.gameType,
    ),
  ],
);

export const blackjackSessions = pgTable(
  "blackjack_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),
    wager: bigint("wager", { mode: "number" }).notNull(),
    status: blackjackSessionStatusEnum("status").notNull().default("active"),
    playerCards: jsonb("player_cards").$type<string[]>().notNull(),
    dealerCards: jsonb("dealer_cards").$type<string[]>().notNull(),
    deck: jsonb("deck").$type<string[]>().notNull(),
    doubled: boolean("doubled").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("blackjack_sessions_guild_user_status_idx").on(
      table.guildId,
      table.userId,
      table.status,
    ),
  ],
);

export const minesSessions = pgTable(
  "mines_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),
    wager: bigint("wager", { mode: "number" }).notNull(),
    mineCount: integer("mine_count").notNull(),
    minePositions: jsonb("mine_positions").$type<number[]>().notNull(),
    revealed: jsonb("revealed").$type<number[]>().notNull().default([]),
    gemsFound: integer("gems_found").notNull().default(0),
    status: minesSessionStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mines_sessions_guild_user_status_idx").on(
      table.guildId,
      table.userId,
      table.status,
    ),
  ],
);

export const lotteryRounds = pgTable(
  "lottery_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    roundNumber: integer("round_number").notNull(),
    status: lotteryRoundStatusEnum("status").notNull().default("open"),
    ticketPrice: bigint("ticket_price", { mode: "number" }).notNull(),
    ticketCount: integer("ticket_count").notNull().default(0),
    potAmount: bigint("pot_amount", { mode: "number" }).notNull().default(0),
    scheduledDrawAt: timestamp("scheduled_draw_at", { withTimezone: true }).notNull(),
    announceChannelId: text("announce_channel_id"),
    winnerId: text("winner_id"),
    winningTicketId: uuid("winning_ticket_id"),
    payoutAmount: bigint("payout_amount", { mode: "number" }),
    rakeAmount: bigint("rake_amount", { mode: "number" }),
    drawnAt: timestamp("drawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lottery_rounds_guild_status_idx").on(table.guildId, table.status),
    index("lottery_rounds_scheduled_idx").on(table.status, table.scheduledDrawAt),
  ],
);

export const lotteryTickets = pgTable(
  "lottery_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => lotteryRounds.id),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    ticketNumber: integer("ticket_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lottery_tickets_round_idx").on(table.roundId),
    index("lottery_tickets_round_user_idx").on(table.roundId, table.userId),
    uniqueIndex("lottery_tickets_round_number_idx").on(table.roundId, table.ticketNumber),
  ],
);

export type Wallet = typeof wallets.$inferSelect;
export type PvpChallenge = typeof pvpChallenges.$inferSelect;
export type BlackjackSession = typeof blackjackSessions.$inferSelect;
export type MinesSession = typeof minesSessions.$inferSelect;
export type LotteryRound = typeof lotteryRounds.$inferSelect;
export type LotteryTicket = typeof lotteryTickets.$inferSelect;
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
