import { and, desc, eq, or } from "drizzle-orm";
import type { Guild } from "discord.js";
import type { Database } from "../../db/client";
import { pvpChallenges } from "../../db/schema";

export type RecentOpponentChoice = {
  id: string;
  label: string;
};

/** Most recent unique opponents for a user in a guild (newest first). */
export function extractRecentOpponentIds(
  challenges: { challengerId: string; opponentId: string }[],
  userId: string,
  limit = 5,
): string[] {
  const seen = new Set<string>();
  const opponents: string[] = [];

  for (const challenge of challenges) {
    const other =
      challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId;
    if (other === userId || seen.has(other)) continue;
    seen.add(other);
    opponents.push(other);
    if (opponents.length >= limit) break;
  }

  return opponents;
}

export async function getRecentPvpOpponentIds(
  db: Database,
  guildId: string,
  userId: string,
  limit = 5,
): Promise<string[]> {
  const rows = await db
    .select({
      challengerId: pvpChallenges.challengerId,
      opponentId: pvpChallenges.opponentId,
    })
    .from(pvpChallenges)
    .where(
      and(
        eq(pvpChallenges.guildId, guildId),
        or(eq(pvpChallenges.challengerId, userId), eq(pvpChallenges.opponentId, userId)),
      ),
    )
    .orderBy(desc(pvpChallenges.createdAt))
    .limit(50);

  return extractRecentOpponentIds(rows, userId, limit);
}

export async function getRecentOpponentChoices(
  guild: Guild,
  db: Database,
  userId: string,
  limit = 5,
): Promise<RecentOpponentChoice[]> {
  const ids = await getRecentPvpOpponentIds(db, guild.id, userId, limit);
  const choices: RecentOpponentChoice[] = [];

  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null);
    const label = member?.displayName ?? member?.user.username ?? "Player";
    choices.push({ id, label: label.slice(0, 80) });
  }

  return choices;
}
