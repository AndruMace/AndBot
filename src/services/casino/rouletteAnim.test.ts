import { describe, expect, test } from "bun:test";
import { buildRouletteSpinIndices, renderRouletteFrame } from "./rouletteAnim";
import { wheelIndexForResult } from "./roulette";

describe("rouletteAnim", () => {
  test("spin indices end on result pocket", () => {
    const indices = buildRouletteSpinIndices(32);
    expect(indices[indices.length - 1]).toBe(wheelIndexForResult(32));
  });

  test("render includes bet and code block", () => {
    const frame = renderRouletteFrame(0, "red", true);
    expect(frame).toContain("```");
    expect(frame).toContain("Red");
    expect(frame).toContain("Spinning");
  });

  test("final frame omits spinning text", () => {
    const frame = renderRouletteFrame(0, "red", false);
    expect(frame).not.toContain("Spinning");
  });
});
