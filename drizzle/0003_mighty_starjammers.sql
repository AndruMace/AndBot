CREATE TYPE "public"."lottery_round_status" AS ENUM('open', 'completed');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'lottery_ticket';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'lottery_win';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'lottery_refund';--> statement-breakpoint
CREATE TABLE "lottery_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"round_number" integer NOT NULL,
	"status" "lottery_round_status" DEFAULT 'open' NOT NULL,
	"ticket_price" bigint NOT NULL,
	"ticket_count" integer DEFAULT 0 NOT NULL,
	"pot_amount" bigint DEFAULT 0 NOT NULL,
	"scheduled_draw_at" timestamp with time zone NOT NULL,
	"announce_channel_id" text,
	"winner_id" text,
	"winning_ticket_id" uuid,
	"payout_amount" bigint,
	"rake_amount" bigint,
	"drawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ticket_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_round_id_lottery_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."lottery_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lottery_rounds_guild_status_idx" ON "lottery_rounds" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "lottery_rounds_scheduled_idx" ON "lottery_rounds" USING btree ("status","scheduled_draw_at");--> statement-breakpoint
CREATE INDEX "lottery_tickets_round_idx" ON "lottery_tickets" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "lottery_tickets_round_user_idx" ON "lottery_tickets" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_tickets_round_number_idx" ON "lottery_tickets" USING btree ("round_id","ticket_number");