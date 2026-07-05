CREATE TYPE "public"."blackjack_session_status" AS ENUM('active', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."pvp_challenge_status" AS ENUM('pending', 'active', 'completed', 'declined', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pvp_game_type" AS ENUM('rps', 'dice');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('daily', 'weekly', 'pay_sent', 'pay_received', 'coinflip_bet', 'coinflip_win', 'blackjack_bet', 'blackjack_win', 'blackjack_push', 'blackjack_refund', 'pvp_escrow', 'pvp_payout', 'pvp_refund', 'admin_give', 'admin_take');--> statement-breakpoint
CREATE TABLE "blackjack_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"wager" bigint NOT NULL,
	"status" "blackjack_session_status" DEFAULT 'active' NOT NULL,
	"player_cards" jsonb NOT NULL,
	"dealer_cards" jsonb NOT NULL,
	"deck" jsonb NOT NULL,
	"doubled" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pvp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"challenger_id" text NOT NULL,
	"opponent_id" text NOT NULL,
	"game_type" "pvp_game_type" NOT NULL,
	"wager" bigint NOT NULL,
	"status" "pvp_challenge_status" DEFAULT 'pending' NOT NULL,
	"challenger_choice" text,
	"opponent_choice" text,
	"challenger_roll" integer,
	"opponent_roll" integer,
	"winner_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"type" "transaction_type" NOT NULL,
	"reference_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"last_daily_at" timestamp with time zone,
	"last_weekly_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "blackjack_sessions_guild_user_status_idx" ON "blackjack_sessions" USING btree ("guild_id","user_id","status");--> statement-breakpoint
CREATE INDEX "pvp_challenges_guild_status_idx" ON "pvp_challenges" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "pvp_challenges_pair_idx" ON "pvp_challenges" USING btree ("guild_id","challenger_id","opponent_id","game_type");--> statement-breakpoint
CREATE INDEX "transactions_guild_user_created_idx" ON "transactions" USING btree ("guild_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_guild_user_idx" ON "wallets" USING btree ("guild_id","user_id");