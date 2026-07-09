import { describe, expect, test } from "bun:test";
import { effectiveBlackjackWager } from "./session";

describe("blackjack session helpers", () => {
  test("effectiveBlackjackWager doubles when session was doubled down", () => {
    expect(effectiveBlackjackWager({ wager: 500, doubled: false })).toBe(500);
    expect(effectiveBlackjackWager({ wager: 500, doubled: true })).toBe(1000);
  });
});
