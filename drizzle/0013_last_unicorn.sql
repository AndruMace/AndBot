CREATE INDEX IF NOT EXISTS "blackjack_sessions_status_expires_idx" ON "blackjack_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hilo_sessions_status_expires_idx" ON "hilo_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mines_sessions_status_expires_idx" ON "mines_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_guild_balance_idx" ON "wallets" USING btree ("guild_id","balance" DESC NULLS LAST);
