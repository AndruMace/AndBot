import { describe, expect, test } from "bun:test";
import {
  evaluateHand,
  determineOutcome,
  calculatePayout,
  dealerShouldHit,
  createDeck,
} from "./engine";

describe("blackjack engine", () => {
  test("evaluates blackjack", () => {
    const value = evaluateHand(["AH", "KD"]);
    expect(value.total).toBe(21);
    expect(value.isBlackjack).toBe(true);
    expect(value.isBust).toBe(false);
  });

  test("evaluates soft ace", () => {
    const value = evaluateHand(["AH", "6D"]);
    expect(value.total).toBe(17);
    expect(value.soft).toBe(true);
  });

  test("evaluates bust", () => {
    const value = evaluateHand(["KH", "QD", "5C"]);
    expect(value.isBust).toBe(true);
  });

  test("dealer hits soft 17", () => {
    expect(dealerShouldHit(["AH", "6D"])).toBe(true);
    expect(dealerShouldHit(["KH", "7D"])).toBe(false);
  });

  test("determines winner", () => {
    expect(determineOutcome(["KH", "9D"], ["10H", "8C"])).toBe("win");
    expect(determineOutcome(["KH", "9D"], ["AH", "KD"])).toBe("lose");
    expect(determineOutcome(["AH", "KD"], ["10H", "8C"])).toBe("blackjack");
  });

  test("calculates payouts", () => {
    expect(calculatePayout(100, false, "win")).toBe(200);
    expect(calculatePayout(100, false, "push")).toBe(100);
    expect(calculatePayout(100, false, "lose")).toBe(0);
    expect(calculatePayout(100, false, "blackjack")).toBe(250);
    expect(calculatePayout(100, true, "win")).toBe(400);
  });

  test("creates full deck", () => {
    expect(createDeck()).toHaveLength(52);
  });
});
