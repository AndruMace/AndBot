import { describe, expect, test } from "bun:test";
import { getWagerPresets, resolveWagerAmount, formatWagerButtonLabel } from "../../commands/casino/wagers";
import type { Config } from "../../config";

const config = {
  MIN_BET: 1,
  MAX_BET: 100_000,
  CURRENCY_NAME: "coins",
} as Config;

describe("wager presets", () => {
  test("returns affordable presets", () => {
    const presets = getWagerPresets(config, 1000);
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p <= 1000)).toBe(true);
  });

  test("resolve repeat uses last wager", () => {
    expect(resolveWagerAmount("repeat", 250, config, 1000)).toBe(250);
    expect(resolveWagerAmount("repeat", null, config, 1000)).toBeNull();
  });

  test("format wager labels", () => {
    expect(formatWagerButtonLabel(1000)).toBe("1K");
    expect(formatWagerButtonLabel(50)).toBe("50");
  });
});
