import { describe, expect, test } from "bun:test";
import {
  calculateRoulettePayout,
  colorOf,
  getRouletteExpectedRtp,
  isBlack,
  isRed,
  parseRouletteBet,
  resolveRouletteBet,
  spinRoulette,
  wheelIndexForResult,
} from "./roulette";

describe("roulette", () => {
  test("color mapping", () => {
    expect(colorOf(0)).toBe("green");
    expect(isRed(1)).toBe(true);
    expect(isBlack(2)).toBe(true);
    expect(isRed(0)).toBe(false);
  });

  test("zero causes even-money bets to lose", () => {
    expect(resolveRouletteBet("red", 0).won).toBe(false);
    expect(resolveRouletteBet("black", 0).won).toBe(false);
    expect(resolveRouletteBet("odd", 0).won).toBe(false);
    expect(resolveRouletteBet("even", 0).won).toBe(false);
    expect(resolveRouletteBet("zero", 0).won).toBe(true);
  });

  test("even-money payout doubles wager", () => {
    const result = calculateRoulettePayout(100, "red", 1);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(200);
  });

  test("zero bet pays 36x", () => {
    const result = calculateRoulettePayout(50, "zero", 0);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(1800);
  });

  test("loss pays zero", () => {
    const result = calculateRoulettePayout(100, "black", 1);
    expect(result.won).toBe(false);
    expect(result.payout).toBe(0);
  });

  test("spin produces valid results", () => {
    for (let i = 0; i < 50; i++) {
      const n = spinRoulette();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(36);
    }
  });

  test("wheel index resolves for all pockets", () => {
    for (let n = 0; n <= 36; n++) {
      expect(wheelIndexForResult(n)).toBeGreaterThanOrEqual(0);
    }
  });

  test("parses bet tokens", () => {
    expect(parseRouletteBet("red")).toBe("red");
    expect(parseRouletteBet("zero")).toBe("zero");
    expect(() => parseRouletteBet("green")).toThrow();
  });

  test("expected RTP is near 97.3%", () => {
    for (const bet of ["red", "black", "odd", "even", "zero"] as const) {
      const rtp = getRouletteExpectedRtp(bet, 100);
      expect(rtp).toBeGreaterThan(0.97);
      expect(rtp).toBeLessThan(0.98);
    }
  });
});
