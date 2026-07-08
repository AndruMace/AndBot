CREATE TYPE "public"."ticket_status" AS ENUM('open', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('issue', 'suggestion');--> statement-breakpoint
CREATE TABLE "andbot_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"submitter_id" text NOT NULL,
	"type" "ticket_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"reviewer_id" text,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "andbot_tickets_guild_status_idx" ON "andbot_tickets" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "andbot_tickets_guild_submitter_idx" ON "andbot_tickets" USING btree ("guild_id","submitter_id");
