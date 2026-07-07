import { describe, expect, test } from "bun:test";
import { getWagerPresets, resolveWagerAmount, formatWagerButtonLabel, getMaxAffordableWager, parseCustomWagerAmount } from "../../commands/casino/wagers";
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

  test("getMaxAffordableWager caps at balance", () => {
    expect(getMaxAffordableWager(config, 500)).toBe(500);
    expect(getMaxAffordableWager(config, 500_000)).toBe(100_000);
  });

  test("parseCustomWagerAmount respects balance", () => {
    expect(parseCustomWagerAmount("250", config, 1000)).toBe(250);
    expect(() => parseCustomWagerAmount("2000", config, 1000)).toThrow();
  });
});
