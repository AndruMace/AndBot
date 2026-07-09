CREATE UNIQUE INDEX "blackjack_sessions_one_active_per_user_idx" ON "blackjack_sessions" USING btree ("guild_id","user_id") WHERE "status" = 'active';
