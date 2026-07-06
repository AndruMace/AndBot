import { describe, expect, test } from "bun:test";
import { extractRecentOpponentIds } from "./recentOpponents";

describe("recent PvP opponents", () => {
  test("returns unique opponents newest-first", () => {
    const ids = extractRecentOpponentIds(
      [
        { challengerId: "me", opponentId: "a" },
        { challengerId: "b", opponentId: "me" },
        { challengerId: "me", opponentId: "a" },
        { challengerId: "c", opponentId: "me" },
      ],
      "me",
      5,
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });

  test("respects limit", () => {
    const ids = extractRecentOpponentIds(
      [
        { challengerId: "me", opponentId: "a" },
        { challengerId: "me", opponentId: "b" },
        { challengerId: "me", opponentId: "c" },
      ],
      "me",
      2,
    );
    expect(ids).toEqual(["a", "b"]);
  });

  test("excludes self", () => {
    const ids = extractRecentOpponentIds(
      [{ challengerId: "me", opponentId: "me" }],
      "me",
      5,
    );
    expect(ids).toEqual([]);
  });
});
