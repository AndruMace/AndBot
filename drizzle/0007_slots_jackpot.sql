ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'slots_jackpot_win';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slots_jackpots" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"accumulated_losses" bigint DEFAULT 0 NOT NULL,
	"last_winner_id" text,
	"last_won_at" timestamp with time zone,
	"total_wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
