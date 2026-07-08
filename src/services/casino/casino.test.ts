import { describe, expect, test } from "bun:test";
import { calculateSlotsPayout, spinSlots, buildSlotsFrames, renderSlotsFrame, SLOTS_SPIN_TICKS } from "./slots";
import { resolveHiLo } from "./hilo";
import { calculateLuckyPayout } from "./lucky";
import {
  buildCoinflipFrames,
  renderCoinflipResultFrame,
  renderCoinflipSpinFrame,
} from "./coinflipAnim";
import { buildLuckyFrames, renderLuckyFrame } from "./luckyAnim";
import { calculatePlinkoPayout, dropPlinko, generatePlinkoPath, getPlinkoExpectedRtp, renderPlinkoFrame, PLINKO_BUCKETS, PLINKO_PEG_ROWS, PLINKO_COL_WIDTH } from "./plinko";
import { gemMultiplier, generateMinePositions, calculateMinesPayout } from "./mines/engine";
import {
  calculateKenoPayout,
  countKenoHits,
  drawKenoNumbers,
  generateQuickPick,
  getKenoMultiplier,
  parseKenoPicks,
  KENO_DRAW_COUNT,
} from "./keno";
import { buildKenoRevealFrames, renderKenoFrame } from "./kenoAnim";

describe("slots", () => {
  test("pays triple match", () => {
    const reels = ["7️⃣", "7️⃣", "7️⃣"] as ["7️⃣", "7️⃣", "7️⃣"];
    const result = calculateSlotsPayout(reels, 100);
    expect(result.payout).toBe(2000);
  });

  test("pays double match", () => {
    const reels = ["🍒", "🍒", "🍋"] as ["🍒", "🍒", "🍋"];
    const result = calculateSlotsPayout(reels, 50);
    expect(result.payout).toBe(100);
  });

  test("spin produces three symbols", () => {
    const reels = spinSlots();
    expect(reels).toHaveLength(3);
  });

  test("animation ends on final reels", () => {
    const final = spinSlots();
    const frames = buildSlotsFrames(final);
    expect(frames).toHaveLength(SLOTS_SPIN_TICKS + 3);
    expect(frames[frames.length - 1]).toEqual(final);
    expect(frames[frames.length - 3]?.[0]).toEqual(final[0]);
    expect(frames[frames.length - 2]?.[1]).toEqual(final[1]);
  });

  test("render produces code block", () => {
    const frame = renderSlotsFrame(["🍒", "🍋", "🔔"]);
    expect(frame).toContain("```");
    expect(frame).toContain("🍒");
  });
});

describe("hilo", () => {
  test("higher wins when next is higher", () => {
    expect(resolveHiLo(5, 10, "higher")).toBe(true);
    expect(resolveHiLo(5, 10, "lower")).toBe(false);
  });

  test("tie loses", () => {
    expect(resolveHiLo(5, 5, "higher")).toBe(false);
  });
});

describe("lucky number", () => {
  test("exact match pays 25x", () => {
    expect(calculateLuckyPayout(100, 42, 42).payout).toBe(2500);
  });

  test("far miss pays nothing", () => {
    expect(calculateLuckyPayout(100, 1, 100).payout).toBe(0);
  });

  test("animation ends on final roll", () => {
    const frames = buildLuckyFrames(42, 5);
    expect(frames).toHaveLength(6);
    expect(frames[frames.length - 1]).toBe(42);
  });

  test("render produces code block", () => {
    const frame = renderLuckyFrame(42, 7, true);
    expect(frame).toContain("```");
    expect(frame).toContain("42");
    expect(frame).toContain("Rolling");
  });
});

describe("coinflip animation", () => {
  test("animation ends on final side", () => {
    const frames = buildCoinflipFrames("tails");
    expect(frames[frames.length - 1]).toBe(renderCoinflipResultFrame("tails"));
  });

  test("spin frames show flipping text", () => {
    const frame = renderCoinflipSpinFrame("🪙");
    expect(frame).toContain("Flipping");
    expect(frame).toContain("```");
  });

  test("result frame shows side", () => {
    expect(renderCoinflipResultFrame("heads")).toContain("HEADS");
  });
});

describe("plinko", () => {
  test("drop returns a bucket", () => {
    expect(dropPlinko().multiplier).toBeGreaterThan(0);
  });

  test("calculates payout", () => {
    expect(calculatePlinkoPayout(100, { label: "2x", multiplier: 2, weight: 1 })).toBe(200);
  });

  test("expected RTP is break-even", () => {
    expect(getPlinkoExpectedRtp(100)).toBeCloseTo(1, 10);
    expect(getPlinkoExpectedRtp(10)).toBeCloseTo(1, 10);
  });

  test("path ends at target bucket", () => {
    for (let target = 0; target < PLINKO_BUCKETS.length; target++) {
      const path = generatePlinkoPath(target);
      expect(path[path.length - 1]).toBe(target);
    }
  });

  test("path ends on target column at last peg row", () => {
    for (let target = 0; target < PLINKO_BUCKETS.length; target++) {
      const path = generatePlinkoPath(target);
      expect(path).toHaveLength(PLINKO_PEG_ROWS);
      expect(path[path.length - 1]).toBe(target);
      if (path.length > 1) {
        expect(Math.abs(path[path.length - 1]! - path[path.length - 2]!)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("render ball column matches bucket on final frame", () => {
    const colWith = (line: string, marker: string) => {
      for (let col = 0; col < PLINKO_BUCKETS.length; col++) {
        const cell = line.slice(col * PLINKO_COL_WIDTH, (col + 1) * PLINKO_COL_WIDTH);
        if (cell.includes(marker)) return col;
      }
      return -1;
    };

    for (let target = 0; target < PLINKO_BUCKETS.length; target++) {
      const path = generatePlinkoPath(target);
      const frame = renderPlinkoFrame(path, path.length - 1);
      const lines = frame.split("\n").filter((line) => !line.startsWith("```"));
      const ballLine = lines[lines.length - 3]!;
      const bucketLine = lines[lines.length - 2]!;
      const ballCol = colWith(ballLine, "[O]");
      const bucketCol = colWith(bucketLine, "[");
      expect(ballCol).toBe(target);
      expect(bucketCol).toBe(target);
    }
  });

  test("render produces code block", () => {
    const path = generatePlinkoPath(3);
    expect(renderPlinkoFrame(path, 0)).toContain("```");
    expect(renderPlinkoFrame(path, path.length - 1)).toContain("[1.5x]");
  });

  test("render aligns winning bucket with pointer", () => {
    const target = 1;
    const path = generatePlinkoPath(target);
    const frame = renderPlinkoFrame(path, path.length - 1);
    const lines = frame.split("\n").filter((line) => !line.startsWith("```"));
    const bucketLine = lines[lines.length - 2]!;
    const pointerLine = lines[lines.length - 1]!;

    for (let col = 0; col < PLINKO_BUCKETS.length; col++) {
      const cell = bucketLine.slice(col * PLINKO_COL_WIDTH, col * PLINKO_COL_WIDTH + PLINKO_COL_WIDTH);
      const pointer = pointerLine.slice(col * PLINKO_COL_WIDTH, col * PLINKO_COL_WIDTH + PLINKO_COL_WIDTH).trim();
      if (col === target) {
        expect(cell.trim()).toBe("[0.5x]");
        expect(pointer).toBe("^");
      } else {
        expect(cell).not.toContain("[");
        expect(pointer).not.toBe("^");
      }
    }
  });
});

describe("keno", () => {
  test("draws 20 unique numbers", () => {
    const drawn = drawKenoNumbers();
    expect(drawn).toHaveLength(KENO_DRAW_COUNT);
    expect(new Set(drawn).size).toBe(KENO_DRAW_COUNT);
    expect(drawn.every((n) => n >= 1 && n <= 80)).toBe(true);
  });

  test("parses comma-separated picks", () => {
    expect(parseKenoPicks("3, 7, 14, 22")).toEqual([3, 7, 14, 22]);
  });

  test("rejects duplicate picks", () => {
    expect(() => parseKenoPicks("3, 3, 7")).toThrow();
  });

  test("quick pick returns requested count", () => {
    const picks = generateQuickPick(5);
    expect(picks).toHaveLength(5);
    expect(new Set(picks).size).toBe(5);
  });

  test("counts hits", () => {
    expect(countKenoHits([3, 7, 14], [3, 9, 14, 20])).toBe(2);
  });

  test("pays from paytable", () => {
    expect(getKenoMultiplier(5, 5)).toBe(250);
    const result = calculateKenoPayout(100, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.hits).toBe(5);
    expect(result.payout).toBe(25000);
  });

  test("reveal frames end on full draw", () => {
    const drawn = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const frames = buildKenoRevealFrames(drawn);
    expect(frames[frames.length - 1]).toEqual(drawn);
  });

  test("render highlights hits", () => {
    const text = renderKenoFrame([3, 7], [3, 9, 14], false);
    expect(text).toContain("**3**");
    expect(text).toContain("9");
  });
});

describe("mines", () => {
  test("generates unique mine positions", () => {
    const positions = generateMinePositions(5);
    expect(positions).toHaveLength(5);
    expect(new Set(positions).size).toBe(5);
  });

  test("multiplier scales with gems", () => {
    expect(gemMultiplier(0)).toBe(1);
    expect(gemMultiplier(3)).toBeGreaterThan(1);
    expect(calculateMinesPayout(100, 3)).toBeGreaterThan(100);
  });
});
