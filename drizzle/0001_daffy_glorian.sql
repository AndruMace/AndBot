CREATE TYPE "public"."mines_session_status" AS ENUM('active', 'busted', 'cashed_out', 'expired');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'slots_bet' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'slots_win' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'hilo_bet' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'hilo_win' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'lucky_bet' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'lucky_win' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'mines_bet' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'mines_win' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'mines_refund' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'plinko_bet' BEFORE 'pvp_escrow';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'plinko_win' BEFORE 'pvp_escrow';--> statement-breakpoint
CREATE TABLE "mines_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"wager" bigint NOT NULL,
	"mine_count" integer NOT NULL,
	"mine_positions" jsonb NOT NULL,
	"revealed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gems_found" integer DEFAULT 0 NOT NULL,
	"status" "mines_session_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mines_sessions_guild_user_status_idx" ON "mines_sessions" USING btree ("guild_id","user_id","status");