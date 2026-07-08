CREATE TYPE "public"."hilo_session_status" AS ENUM('active', 'busted', 'cashed_out', 'expired');--> statement-breakpoint
CREATE TABLE "hilo_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"wager" bigint NOT NULL,
	"current_card" text NOT NULL,
	"remaining_deck" jsonb NOT NULL,
	"pot_multiple" real DEFAULT 1 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"status" "hilo_session_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "hilo_sessions_guild_user_status_idx" ON "hilo_sessions" USING btree ("guild_id","user_id","status");--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE IF NOT EXISTS 'hilo_refund';
