import { describe, expect, test } from "bun:test";
import {
  ROULETTE_MAX_SPIN_STEPS,
  ROULETTE_MIN_SPIN_STEPS,
  buildRouletteSpinIndices,
  renderRouletteFrame,
  rouletteDelayForStep,
} from "./rouletteAnim";
import { wheelIndexForResult } from "./roulette";

describe("rouletteAnim", () => {
  test("spin indices end on result pocket", () => {
    const indices = buildRouletteSpinIndices(32);
    expect(indices[indices.length - 1]).toBe(wheelIndexForResult(32));
  });

  test("spin indices advance one pocket per frame", () => {
    const indices = buildRouletteSpinIndices(17);
    expect(indices.length).toBeGreaterThanOrEqual(ROULETTE_MIN_SPIN_STEPS + 1);
    expect(indices.length).toBeLessThanOrEqual(ROULETTE_MAX_SPIN_STEPS + 1);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]! - indices[i - 1]!).toBe(1);
    }
  });

  test("delays increase toward the end", () => {
    const early = rouletteDelayForStep(0, 10);
    const late = rouletteDelayForStep(9, 10);
    expect(late).toBeGreaterThan(early);
  });

  test("render puts bet and status outside code block", () => {
    const frame = renderRouletteFrame(0, "red", { spinning: true });
    const [art, betLine] = frame.split("\n");
    expect(art).toBe("```");
    expect(frame).toContain("```");
    expect(frame).toContain("**Red**");
    expect(frame).toContain("*Spinning...*");
    expect(betLine).not.toContain("**Red**");
    expect(frame.indexOf("**Red**")).toBeGreaterThan(frame.lastIndexOf("```"));
  });

  test("render colors every visible pocket", () => {
    const frame = renderRouletteFrame(wheelIndexForResult(32), "red", { spinning: true });
    expect(frame.match(/🔴|⚫|🟢/g)?.length).toBeGreaterThanOrEqual(5);
    expect(frame).toContain("[🔴32]");
  });

  test("landing frame omits spinning text", () => {
    const frame = renderRouletteFrame(0, "red", { spinning: false });
    expect(frame).not.toContain("Spinning");
  });

  test("spinning frame shows status", () => {
    const frame = renderRouletteFrame(0, "red", { spinning: true });
    expect(frame).toContain("*Spinning...*");
  });

  test("can omit bet line on result frame", () => {
    const frame = renderRouletteFrame(0, "red", { showBet: false });
    expect(frame).not.toContain("Your bet");
  });
});
