import { describe, expect, test } from "bun:test";
import { msUntilNextClaim, formatDuration, DAILY_COOLDOWN_MS } from "./time";

describe("time utils", () => {
  test("msUntilNextClaim returns 0 when never claimed", () => {
    expect(msUntilNextClaim(null, DAILY_COOLDOWN_MS)).toBe(0);
  });

  test("msUntilNextClaim returns remaining time", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const remaining = msUntilNextClaim(oneHourAgo, DAILY_COOLDOWN_MS);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(DAILY_COOLDOWN_MS);
  });

  test("formatDuration", () => {
    expect(formatDuration(90 * 60 * 1000)).toBe("1h 30m");
    expect(formatDuration(30 * 60 * 1000)).toBe("30m");
  });
});

describe("bet validation", () => {
  test("validateBetAmount rejects out of range", async () => {
    const { validateBetAmount, BetValidationError } = await import("./bets");
    const config = {
      MIN_BET: 1,
      MAX_BET: 1000,
      CURRENCY_NAME: "coins",
    } as import("../config").Config;

    expect(() => validateBetAmount(0, config)).toThrow(BetValidationError);
    expect(() => validateBetAmount(1001, config)).toThrow(BetValidationError);
    expect(() => validateBetAmount(100, config)).not.toThrow();
  });
});

describe("pvp logic", () => {
  test("determineRpsWinner", async () => {
    const { determineRpsWinner } = await import("../services/pvp/challenges");
    expect(determineRpsWinner("rock", "scissors")).toBe("challenger");
    expect(determineRpsWinner("rock", "paper")).toBe("opponent");
    expect(determineRpsWinner("rock", "rock")).toBe("tie");
  });

  test("determineDiceWinner", async () => {
    const { determineDiceWinner } = await import("../services/pvp/challenges");
    expect(determineDiceWinner(5, 3)).toBe("challenger");
    expect(determineDiceWinner(2, 6)).toBe("opponent");
    expect(determineDiceWinner(4, 4)).toBe("tie");
  });
});
