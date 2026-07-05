import { eq, and, gt, desc, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { wallets } from "../db/schema";

export type LeaderboardEntry = {
  userId: string;
  balance: number;
  rank: number;
};

export async function getGuildLeaderboard(
  db: Database,
  guildId: string,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select()
    .from(wallets)
    .where(eq(wallets.guildId, guildId))
    .orderBy(desc(wallets.balance))
    .limit(limit);

  return rows.map((row, i) => ({
    userId: row.userId,
    balance: row.balance,
    rank: i + 1,
  }));
}

export async function getUserRank(
  db: Database,
  guildId: string,
  userId: string,
): Promise<{ rank: number; balance: number } | null> {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
    .limit(1);

  if (!wallet) return null;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), gt(wallets.balance, wallet.balance)));

  return {
    rank: (result?.count ?? 0) + 1,
    balance: wallet.balance,
  };
}
