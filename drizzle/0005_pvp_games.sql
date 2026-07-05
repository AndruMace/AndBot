ALTER TYPE "public"."pvp_game_type" ADD VALUE 'russian_roulette';--> statement-breakpoint
ALTER TYPE "public"."pvp_game_type" ADD VALUE 'coinflip_duel';--> statement-breakpoint
CREATE TYPE "public"."pvp_match_format" AS ENUM('single', 'best_of_3');--> statement-breakpoint
ALTER TABLE "pvp_challenges" ADD COLUMN "match_format" "pvp_match_format" DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_challenges" ADD COLUMN "round_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_challenges" ADD COLUMN "challenger_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_challenges" ADD COLUMN "opponent_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_challenges" ADD COLUMN "metadata" jsonb;