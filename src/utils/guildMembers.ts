import type { Guild, GuildMember } from "discord.js";

export class MemberLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberLookupError";
  }
}

/** Normalize user input from modal (strip @, mention markup, whitespace). */
export function normalizeMemberQuery(raw: string): string {
  const trimmed = raw.trim();
  const mention = trimmed.match(/^<@!?(\d+)>$/);
  if (mention) return mention[1]!;
  if (trimmed.startsWith("@")) return trimmed.slice(1).trim();
  return trimmed;
}

function memberSearchNames(member: GuildMember): string[] {
  const names = [
    member.user.username,
    member.user.globalName,
    member.displayName,
    member.nickname,
  ];
  return names.filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase());
}

export function pickMemberFromCandidates(
  candidates: GuildMember[],
  query: string,
): GuildMember | "ambiguous" | null {
  const lower = query.toLowerCase();

  const exact = candidates.filter((member) => memberSearchNames(member).includes(lower));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return "ambiguous";

  if (candidates.length === 1) return candidates[0]!;

  const partial = candidates.filter((member) =>
    memberSearchNames(member).some((name) => name.includes(lower) || lower.includes(name)),
  );
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1) return "ambiguous";

  return candidates.length > 0 ? "ambiguous" : null;
}

export async function resolveGuildMemberByQuery(
  guild: Guild,
  rawQuery: string,
  excludeUserId?: string,
): Promise<GuildMember> {
  const query = normalizeMemberQuery(rawQuery);
  if (!query) {
    throw new MemberLookupError("Enter a username or display name.");
  }

  if (/^\d{17,20}$/.test(query)) {
    const member = await guild.members.fetch(query).catch(() => null);
    if (!member) {
      throw new MemberLookupError("No member found with that ID in this server.");
    }
    if (member.user.bot) {
      throw new MemberLookupError("You cannot challenge bots.");
    }
    if (excludeUserId && member.id === excludeUserId) {
      throw new MemberLookupError("You cannot challenge yourself.");
    }
    return member;
  }

  const fetched = await guild.members.fetch({ query, limit: 25 });
  const candidates = [...fetched.values()].filter(
    (member) => !member.user.bot && member.id !== excludeUserId,
  );

  const picked = pickMemberFromCandidates(candidates, query);

  if (picked === "ambiguous") {
    const sample = candidates
      .slice(0, 5)
      .map((member) => `**${member.displayName}** (@${member.user.username})`)
      .join(", ");
    throw new MemberLookupError(
      `Multiple members match "${query}". Try a more specific name.${sample ? ` Matches include: ${sample}` : ""}`,
    );
  }

  if (!picked) {
    throw new MemberLookupError(
      `No member found matching "${query}". Check spelling or use their exact username.`,
    );
  }

  return picked;
}
