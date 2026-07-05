import { describe, expect, test } from "bun:test";
import { calculateLotteryPayout, pickWinningTicketNumber } from "./engine";

describe("lottery engine", () => {
  test("calculateLotteryPayout applies rake", () => {
    expect(calculateLotteryPayout(1000, 5)).toEqual({ payout: 950, rake: 50 });
    expect(calculateLotteryPayout(100, 0)).toEqual({ payout: 100, rake: 0 });
    expect(calculateLotteryPayout(99, 5)).toEqual({ payout: 95, rake: 4 });
  });

  test("pickWinningTicketNumber stays in range", () => {
    for (let i = 0; i < 100; i++) {
      const n = pickWinningTicketNumber(10);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  test("pickWinningTicketNumber rejects empty pool", () => {
    expect(() => pickWinningTicketNumber(0)).toThrow();
  });
});
