import { describe, expect, test } from "bun:test";
import { calculateJackpotPayout, SLOTS_JACKPOT_PAYOUT_PERCENT } from "./slotsJackpot";

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
});
