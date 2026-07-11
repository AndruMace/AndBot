CREATE TYPE "public"."poker_table_status" AS ENUM('waiting', 'playing', 'closed');
--> statement-breakpoint
CREATE TYPE "public"."poker_table_visibility" AS ENUM('public', 'private');
--> statement-breakpoint
CREATE TYPE "public"."poker_seat_status" AS ENUM('empty', 'seated', 'folded', 'all_in', 'sitting_out');
--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'poker_buyin';
--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'poker_cashout';
--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'poker_win';
--> statement-breakpoint
CREATE TABLE "poker_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"host_user_id" text NOT NULL,
	"visibility" "poker_table_visibility" DEFAULT 'public' NOT NULL,
	"max_seats" integer DEFAULT 6 NOT NULL,
	"small_blind" bigint NOT NULL,
	"big_blind" bigint NOT NULL,
	"min_buy_in" bigint NOT NULL,
	"max_buy_in" bigint NOT NULL,
	"status" "poker_table_status" DEFAULT 'waiting' NOT NULL,
	"hand_number" integer DEFAULT 0 NOT NULL,
	"hand_state" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poker_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"seat_index" integer NOT NULL,
	"user_id" text,
	"stack" bigint DEFAULT 0 NOT NULL,
	"status" "poker_seat_status" DEFAULT 'empty' NOT NULL,
	"hole_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poker_seats" ADD CONSTRAINT "poker_seats_table_id_poker_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."poker_tables"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "poker_tables_guild_status_idx" ON "poker_tables" USING btree ("guild_id","status");
--> statement-breakpoint
CREATE INDEX "poker_tables_status_expires_idx" ON "poker_tables" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "poker_seats_table_seat_idx" ON "poker_seats" USING btree ("table_id","seat_index");
--> statement-breakpoint
CREATE INDEX "poker_seats_table_user_idx" ON "poker_seats" USING btree ("table_id","user_id");
--> statement-breakpoint
CREATE INDEX "poker_seats_user_idx" ON "poker_seats" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "poker_seats_one_active_user_per_guild_idx" ON "poker_seats" ("user_id") WHERE "user_id" IS NOT NULL AND "status" IN ('seated', 'folded', 'all_in');
