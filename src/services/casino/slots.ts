import type { Config } from "../../config";
import { formatCurrency } from "../../utils/bets";

export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣", "🔥", "🤑"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
export const SLOT_REEL_COUNT = 5;

export type SlotReels = [SlotSymbol, SlotSymbol, SlotSymbol, SlotSymbol, SlotSymbol];

/** Common → rare; length must match SLOT_SYMBOLS. */
const SYMBOL_WEIGHTS = [22, 20, 17, 14, 12, 9, 6];

/** ~100% base RTP (progressive 5-of-a-kind excluded). Only 3+ matches pay. */
const THREE_OF_KIND_MULT: Record<SlotSymbol, number> = {
  "🍒": 1.5,
  "🍋": 2.5,
  "🔔": 4,
  "💎": 6,
  "7️⃣": 8,
  "🔥": 12,
  "🤑": 20,
};

const FOUR_OF_KIND_MULT: Record<SlotSymbol, number> = {
  "🍒": 8,
  "🍋": 12,
  "🔔": 20,
  "💎": 30,
  "7️⃣": 45,
  "🔥": 70,
  "🤑": 110,
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

export function spinSlots(): SlotReels {
  return [
    weightedSymbol(),
    weightedSymbol(),
    weightedSymbol(),
    weightedSymbol(),
    weightedSymbol(),
  ];
}

export const SLOTS_SPIN_TICKS = 5;
export const SLOTS_FRAME_DELAY_MS = 500;

/** Spin all reels, then stop left → right on the final result. */
export function buildSlotsFrames(
  finalReels: SlotReels,
  spinTicks = SLOTS_SPIN_TICKS,
): SlotReels[] {
  const frames: SlotReels[] = [];

  for (let tick = 0; tick < spinTicks; tick++) {
    frames.push([
      weightedSymbol(),
      weightedSymbol(),
      weightedSymbol(),
      weightedSymbol(),
      weightedSymbol(),
    ]);
  }

  for (let locked = 1; locked <= SLOT_REEL_COUNT; locked++) {
    frames.push([
      ...finalReels.slice(0, locked),
      ...Array.from({ length: SLOT_REEL_COUNT - locked }, () => weightedSymbol()),
    ] as SlotReels);
  }

  return frames;
}

export function renderSlotsFrame(reels: SlotReels): string {
  return ["```", reels.join("  │  "), "```"].join("\n");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function countSymbolFrequencies(reels: SlotReels): Map<SlotSymbol, number> {
  const counts = new Map<SlotSymbol, number>();
  for (const symbol of reels) {
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return counts;
}

export function getMaxMatchCount(reels: SlotReels): number {
  return Math.max(...countSymbolFrequencies(reels).values(), 0);
}

export function isFiveOfAKind(reels: SlotReels): boolean {
  return getMaxMatchCount(reels) === SLOT_REEL_COUNT;
}

function dominantSymbol(reels: SlotReels): SlotSymbol {
  const counts = countSymbolFrequencies(reels);
  let bestSymbol: SlotSymbol = reels[0]!;
  let bestCount = 0;
  for (const symbol of SLOT_SYMBOLS) {
    const count = counts.get(symbol) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestSymbol = symbol;
    }
  }
  return bestSymbol;
}

function formatMultiplier(mult: number): string {
  return Number.isInteger(mult) ? `${mult}` : mult.toFixed(2).replace(/\.?0+$/, "");
}

export function calculateSlotsPayout(
  reels: SlotReels,
  wager: number,
): { multiplier: number; payout: number; description: string; isJackpot: boolean } {
  const maxCount = getMaxMatchCount(reels);
  const symbol = dominantSymbol(reels);

  if (maxCount === SLOT_REEL_COUNT) {
    return {
      multiplier: 0,
      payout: 0,
      description: `Five ${symbol}! **Progressive jackpot!**`,
      isJackpot: true,
    };
  }

  if (maxCount === 4) {
    const multiplier = FOUR_OF_KIND_MULT[symbol];
    return {
      multiplier,
      payout: Math.floor(wager * multiplier),
      description: `Four ${symbol}! **${formatMultiplier(multiplier)}x** payout.`,
      isJackpot: false,
    };
  }

  if (maxCount === 3) {
    const multiplier = THREE_OF_KIND_MULT[symbol];
    return {
      multiplier,
      payout: Math.floor(wager * multiplier),
      description: `Three ${symbol}! **${formatMultiplier(multiplier)}x** payout.`,
      isJackpot: false,
    };
  }

  if (maxCount === 2) {
    return {
      multiplier: 0,
      payout: 0,
      description: "Two of a kind — no payout.",
      isJackpot: false,
    };
  }

  return { multiplier: 0, payout: 0, description: "No match.", isJackpot: false };
}

export function formatReels(reels: SlotReels): string {
  return reels.join(" | ");
}

export function formatSlotsJackpotLine(jackpot: number, config: Config): string {
  return `Jackpot: **${formatCurrency(jackpot, config)}**`;
}

function symbolProbabilities(): number[] {
  const total = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
  return SYMBOL_WEIGHTS.map((weight) => weight / total);
}

function buildWeightedOutcomes(): { counts: number[]; probability: number }[] {
  const probabilities = symbolProbabilities();
  let outcomes: { counts: number[]; probability: number }[] = [
    { counts: Array(SLOT_SYMBOLS.length).fill(0), probability: 1 },
  ];

  for (let reel = 0; reel < SLOT_REEL_COUNT; reel++) {
    const next: { counts: number[]; probability: number }[] = [];
    for (const outcome of outcomes) {
      for (let symbolIndex = 0; symbolIndex < SLOT_SYMBOLS.length; symbolIndex++) {
        const counts = [...outcome.counts];
        counts[symbolIndex]! += 1;
        next.push({
          counts,
          probability: outcome.probability * probabilities[symbolIndex]!,
        });
      }
    }
    outcomes = next;
  }

  return outcomes;
}

/** Expected base-game return per coin staked (excludes progressive jackpot). */
export function getSlotsExpectedRtp(wager = 100): number {
  const outcomes = buildWeightedOutcomes();

  return outcomes.reduce((rtp, outcome) => {
    const maxCount = Math.max(...outcome.counts);
    let multiplier = 0;

    if (maxCount === SLOT_REEL_COUNT) {
      multiplier = 0;
    } else if (maxCount === 4) {
      const symbolIndex = outcome.counts.indexOf(4);
      multiplier = FOUR_OF_KIND_MULT[SLOT_SYMBOLS[symbolIndex]!]!;
    } else if (maxCount === 3) {
      const symbolIndex = outcome.counts.indexOf(3);
      multiplier = THREE_OF_KIND_MULT[SLOT_SYMBOLS[symbolIndex]!]!;
    }

    const payout = Math.floor(wager * multiplier);
    return rtp + (payout / wager) * outcome.probability;
  }, 0);
}
