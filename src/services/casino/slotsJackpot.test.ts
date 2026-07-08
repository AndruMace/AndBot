import { describe, expect, test } from "bun:test";
import {
  calculateJackpotPayout,
  resolveJackpotSettlement,
  SLOTS_JACKPOT_PAYOUT_PERCENT,
} from "./slotsJackpot";

describe("slotsJackpot", () => {
  test("pays 90% of accumulated losses", () => {
    expect(SLOTS_JACKPOT_PAYOUT_PERCENT).toBe(90);
    expect(calculateJackpotPayout(1000)).toBe(900);
    expect(calculateJackpotPayout(101)).toBe(90);
  });

  test("returns zero for empty pot", () => {
    expect(calculateJackpotPayout(0)).toBe(0);
    expect(calculateJackpotPayout(-5)).toBe(0);
  });

  test("settleSpin logic feeds pot on net loss", () => {
    expect(resolveJackpotSettlement(100, 50, false)).toEqual({
      accumulatedLosses: 150,
      jackpotPayout: 0,
    });
  });

  test("settleSpin logic leaves pot unchanged on win with no net loss", () => {
    expect(resolveJackpotSettlement(100, 0, false)).toEqual({
      accumulatedLosses: 100,
      jackpotPayout: 0,
    });
  });

  test("settleSpin logic awards and resets pot on five of a kind", () => {
    expect(resolveJackpotSettlement(1000, 0, true)).toEqual({
      accumulatedLosses: 0,
      jackpotPayout: 900,
    });
  });
});
