export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

const SYMBOL_WEIGHTS = [30, 25, 20, 15, 10];

const THREE_OF_KIND_MULT: Record<SlotSymbol, number> = {
  "🍒": 5,
  "🍋": 6,
  "🔔": 8,
  "💎": 12,
  "7️⃣": 20,
};

function weightedSymbol(): SlotSymbol {
  const total = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = crypto.getRandomValues(new Uint32Array(1))[0]! % total;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    roll -= SYMBOL_WEIGHTS[i]!;
    if (roll < 0) return SLOT_SYMBOLS[i]!;
  }
  return SLOT_SYMBOLS[0]!;
}

export function spinSlots(): [SlotSymbol, SlotSymbol, SlotSymbol] {
  return [weightedSymbol(), weightedSymbol(), weightedSymbol()];
}

export const SLOTS_SPIN_TICKS = 5;
export const SLOTS_FRAME_DELAY_MS = 500;

/** Spin all reels, then stop left → middle → right on the final result. */
export function buildSlotsFrames(
  finalReels: [SlotSymbol, SlotSymbol, SlotSymbol],
  spinTicks = SLOTS_SPIN_TICKS,
): [SlotSymbol, SlotSymbol, SlotSymbol][] {
  const frames: [SlotSymbol, SlotSymbol, SlotSymbol][] = [];

  for (let tick = 0; tick < spinTicks; tick++) {
    frames.push([weightedSymbol(), weightedSymbol(), weightedSymbol()]);
  }

  frames.push([finalReels[0], weightedSymbol(), weightedSymbol()]);
  frames.push([finalReels[0], finalReels[1], weightedSymbol()]);
  frames.push([...finalReels]);

  return frames;
}

export function renderSlotsFrame(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): string {
  return ["```", `${reels[0]}  │  ${reels[1]}  │  ${reels[2]}`, "```"].join("\n");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateSlotsPayout(
  reels: [SlotSymbol, SlotSymbol, SlotSymbol],
  wager: number,
): { multiplier: number; payout: number; description: string } {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    const multiplier = THREE_OF_KIND_MULT[a];
    return {
      multiplier,
      payout: wager * multiplier,
      description: `Jackpot! Three ${a}`,
    };
  }

  if (a === b || b === c || a === c) {
    return {
      multiplier: 2,
      payout: wager * 2,
      description: "Two of a kind!",
    };
  }

  return { multiplier: 0, payout: 0, description: "No match." };
}

export function formatReels(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): string {
  return reels.join(" | ");
}
