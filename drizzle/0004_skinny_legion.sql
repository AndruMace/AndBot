ALTER TYPE "public"."transaction_type" ADD VALUE 'activity_message';--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "daily_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "last_message_reward_at" timestamp with time zone;