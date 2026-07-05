import { describe, expect, test } from "bun:test";
import { calculateDailyPayout, resolveDailyStreak, utcDayKey } from "./streak";

describe("daily streak", () => {
  test("first claim starts at day 1", () => {
    expect(resolveDailyStreak(null, 0)).toEqual({ ready: true, streak: 1 });
  });

  test("same calendar day is on cooldown", () => {
    const now = new Date("2026-07-04T15:00:00.000Z");
    const last = new Date("2026-07-04T08:00:00.000Z");
    const state = resolveDailyStreak(last, 5, now);
    expect(state.ready).toBe(false);
    if (!state.ready) {
      expect(state.streak).toBe(5);
      expect(state.remainingMs).toBeGreaterThan(0);
    }
  });

  test("consecutive day increments streak", () => {
    const now = new Date("2026-07-04T12:00:00.000Z");
    const last = new Date("2026-07-03T20:00:00.000Z");
    expect(resolveDailyStreak(last, 4, now)).toEqual({ ready: true, streak: 5 });
  });

  test("missed day resets streak", () => {
    const now = new Date("2026-07-04T12:00:00.000Z");
    const last = new Date("2026-07-02T12:00:00.000Z");
    expect(resolveDailyStreak(last, 10, now)).toEqual({ ready: true, streak: 1 });
  });

  test("calculateDailyPayout applies streak bonus and cap", () => {
    expect(calculateDailyPayout(500, 1, 10, 10_000)).toEqual({
      total: 510,
      base: 500,
      streakBonus: 10,
      capped: false,
    });
    expect(calculateDailyPayout(500, 12, 10, 10_000)).toEqual({
      total: 620,
      base: 500,
      streakBonus: 120,
      capped: false,
    });
    expect(calculateDailyPayout(500, 950, 10, 10_000)).toEqual({
      total: 10_000,
      base: 500,
      streakBonus: 9500,
      capped: true,
    });
    expect(calculateDailyPayout(500, 1000, 10, 10_000).total).toBe(10_000);
  });

  test("utcDayKey uses UTC date", () => {
    expect(utcDayKey(new Date("2026-07-04T23:59:00.000Z"))).toBe("2026-07-04");
  });
});
