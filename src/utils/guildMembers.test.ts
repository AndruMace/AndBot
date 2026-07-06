import { describe, expect, test } from "bun:test";
import { normalizeMemberQuery, pickMemberFromCandidates } from "./guildMembers";
import type { GuildMember } from "discord.js";

function mockMember(
  id: string,
  username: string,
  displayName: string,
  globalName?: string,
): GuildMember {
  return {
    id,
    user: { username, globalName: globalName ?? null, bot: false },
    displayName,
    nickname: null,
  } as GuildMember;
}

describe("guild member lookup", () => {
  test("normalizeMemberQuery strips mentions and @", () => {
    expect(normalizeMemberQuery("@Alice")).toBe("Alice");
    expect(normalizeMemberQuery("<@123456789012345678>")).toBe("123456789012345678");
    expect(normalizeMemberQuery("  bob  ")).toBe("bob");
  });

  test("pickMemberFromCandidates finds exact username match", () => {
    const members = [
      mockMember("1", "alice", "Alice"),
      mockMember("2", "bob", "Bob"),
    ];
    expect(pickMemberFromCandidates(members, "alice")?.id).toBe("1");
  });

  test("pickMemberFromCandidates returns ambiguous for multiple matches", () => {
    const members = [
      mockMember("1", "coolguy", "Cool"),
      mockMember("2", "coolgal", "Cool"),
    ];
    expect(pickMemberFromCandidates(members, "cool")).toBe("ambiguous");
  });

  test("pickMemberFromCandidates picks sole search result", () => {
    const members = [mockMember("1", "uniqueplayer", "Unique")];
    expect(pickMemberFromCandidates(members, "uniq")?.id).toBe("1");
  });
});
