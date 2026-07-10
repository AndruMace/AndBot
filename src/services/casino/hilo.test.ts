import { describe, expect, test } from "bun:test";
import {
  HI_LO_DECK_CLEAR_BONUS_MULT,
  HI_LO_STREAK_STEP,
  canGuess,
  cardRankValue,
  choiceHasWinningOutcomes,
  countOutcomes,
  getHiLoNextPotMultiple,
  getHiLoPotMultiple,
  resolveHiLoGuess,
} from "./hilo";
import type { Card } from "../blackjack/engine";

describe("hilo engine", () => {
  test("resolveHiLoGuess classifies wins, losses, and ties", () => {
    expect(resolveHiLoGuess(5, 10, "higher")).toBe("win");
    expect(resolveHiLoGuess(5, 10, "lower")).toBe("loss");
    expect(resolveHiLoGuess(5, 5, "higher")).toBe("tie");
    expect(resolveHiLoGuess(5, 5, "lower")).toBe("tie");
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
  });

  test("streak payout schedule adds 0.5x per correct guess", () => {
    expect(getHiLoPotMultiple(0)).toBe(1);
    expect(getHiLoPotMultiple(1)).toBe(1 + HI_LO_STREAK_STEP);
    expect(getHiLoPotMultiple(2)).toBe(1 + HI_LO_STREAK_STEP * 2);
    expect(getHiLoNextPotMultiple(0)).toBe(1.5);
    expect(getHiLoNextPotMultiple(1)).toBe(2);
  });

  test("deck-clear bonus doubles the streak payout", () => {
    expect(getHiLoPotMultiple(3, true)).toBe((1 + HI_LO_STREAK_STEP * 3) * HI_LO_DECK_CLEAR_BONUS_MULT);
  });

  test("canGuess only depends on cards remaining", () => {
    expect(canGuess(10)).toBe(true);
    expect(canGuess(0)).toBe(false);
  });

  test("choice availability follows winning outcomes", () => {
    const deck: Card[] = ["2H", "3D", "KC"];
    const currentRank = 7;
    expect(choiceHasWinningOutcomes(deck, currentRank, "higher")).toBe(true);
    expect(choiceHasWinningOutcomes(deck, currentRank, "lower")).toBe(true);
    expect(choiceHasWinningOutcomes(["KC"], 13, "higher")).toBe(false);
    expect(choiceHasWinningOutcomes(["2H"], 1, "lower")).toBe(false);
  });
});
