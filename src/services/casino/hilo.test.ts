import { describe, expect, test } from "bun:test";
import {
  HI_LO_MAX_STREAK,
  HI_LO_TARGET_RTP,
  canGuess,
  cardRankValue,
  countOutcomes,
  createHiLoDeck,
  dealHiLoStart,
  getHiLoActionPreview,
  getHiLoStepExpectedRtp,
  getStepMultiplier,
  getStepProbability,
  resolveHiLoGuess,
  simulateHiLoRtp,
} from "./hilo";
import type { Card } from "../blackjack/engine";

describe("hilo engine", () => {
  test("resolveHiLoGuess handles ties as losses", () => {
    expect(resolveHiLoGuess(5, 10, "higher")).toBe(true);
    expect(resolveHiLoGuess(5, 10, "lower")).toBe(false);
    expect(resolveHiLoGuess(5, 5, "higher")).toBe(false);
  });

  test("counts outcomes on a known micro-deck", () => {
    const deck: Card[] = ["2H", "7D", "KC", "AS"];
    const currentRank = cardRankValue("7H");
    expect(countOutcomes(deck, currentRank)).toEqual({
      higher: 1,
      lower: 2,
      tie: 1,
      total: 4,
    });
    expect(getStepProbability(deck, currentRank, "higher")).toBe(0.25);
    expect(getStepProbability(deck, currentRank, "lower")).toBe(0.5);
  });

  test("step multiplier prices each choice at target RTP", () => {
    const deck = createHiLoDeck();
    const { currentCard, remainingDeck } = dealHiLoStart(deck);
    const currentRank = cardRankValue(currentCard);

    for (const choice of ["higher", "lower"] as const) {
      const rtp = getHiLoStepExpectedRtp(remainingDeck, currentRank, choice);
      expect(rtp).toBeCloseTo(HI_LO_TARGET_RTP, 10);
    }
  });

  test("getStepMultiplier is target divided by probability", () => {
    expect(getStepMultiplier(0.5)).toBeCloseTo(HI_LO_TARGET_RTP / 0.5, 10);
  });

  test("canGuess respects streak cap and deck exhaustion", () => {
    expect(canGuess(0, 10)).toBe(true);
    expect(canGuess(HI_LO_MAX_STREAK, 10)).toBe(false);
    expect(canGuess(0, 0)).toBe(false);
  });

  test("preview multipliers match step pricing", () => {
    const deck: Card[] = ["2H", "3D", "KC"];
    const currentRank = 7;
    const preview = getHiLoActionPreview(deck, currentRank);
    expect(preview.higherMult).toBeCloseTo(getStepMultiplier(preview.higherP), 10);
    expect(preview.lowerMult).toBeCloseTo(getStepMultiplier(preview.lowerP), 10);
  });

  test("forced one-step RTP is near target", () => {
    const rtp = simulateHiLoRtp("forced_one", 8000, 100);
    expect(rtp).toBeGreaterThan(1.02);
    expect(rtp).toBeLessThan(1.06);
  });

  test("always-press RTP stays in a fun-but-bounded band", () => {
    const rtp = simulateHiLoRtp("always_press", 8000, 100);
    expect(rtp).toBeGreaterThan(1.0);
    expect(rtp).toBeLessThan(1.12);
  });
});
