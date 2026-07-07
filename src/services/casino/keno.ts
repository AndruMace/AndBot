export const KENO_POOL_SIZE = 80;
export const KENO_DRAW_COUNT = 20;
export const KENO_MIN_SPOTS = 1;
export const KENO_MAX_SPOTS = 10;

/** Multiplier on wager by [spots picked][hits]. */
export const KENO_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 2: 15, 1: 1 },
  3: { 3: 50, 2: 3 },
  4: { 4: 120, 3: 8, 2: 1 },
  5: { 5: 250, 4: 25, 3: 4 },
  6: { 6: 500, 5: 60, 4: 10, 3: 1 },
  7: { 7: 1000, 6: 120, 5: 20, 4: 4 },
  8: { 8: 2000, 7: 250, 6: 40, 5: 8 },
  9: { 9: 5000, 8: 500, 7: 80, 6: 15, 5: 3 },
  10: { 10: 10000, 9: 1000, 8: 200, 7: 40, 6: 8 },
};

export class KenoPickError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KenoPickError";
  }
}

function uniqueIntsInRange(count: number, min: number, max: number): number[] {
  if (count < 1 || count > max - min + 1) {
    throw new KenoPickError("Invalid quick-pick count.");
  }
  const picked = new Set<number>();
  while (picked.size < count) {
    picked.add((crypto.getRandomValues(new Uint32Array(1))[0]! % (max - min + 1)) + min);
  }
  return [...picked].sort((a, b) => a - b);
}

export function generateQuickPick(spotCount: number): number[] {
  if (spotCount < KENO_MIN_SPOTS || spotCount > KENO_MAX_SPOTS) {
    throw new KenoPickError(`Quick pick must be between ${KENO_MIN_SPOTS} and ${KENO_MAX_SPOTS} numbers.`);
  }
  return uniqueIntsInRange(spotCount, 1, KENO_POOL_SIZE);
}

export function parseKenoPicks(raw: string): number[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new KenoPickError("Enter at least one number.");
  }
  if (tokens.length > KENO_MAX_SPOTS) {
    throw new KenoPickError(`You can pick at most ${KENO_MAX_SPOTS} numbers.`);
  }

  const picks: number[] = [];
  const seen = new Set<number>();

  for (const token of tokens) {
    const n = Number.parseInt(token, 10);
    if (Number.isNaN(n) || n < 1 || n > KENO_POOL_SIZE) {
      throw new KenoPickError(`Each number must be between 1 and ${KENO_POOL_SIZE}.`);
    }
    if (seen.has(n)) {
      throw new KenoPickError("Duplicate numbers are not allowed.");
    }
    seen.add(n);
    picks.push(n);
  }

  return picks.sort((a, b) => a - b);
}

export function drawKenoNumbers(): number[] {
  return uniqueIntsInRange(KENO_DRAW_COUNT, 1, KENO_POOL_SIZE);
}

export function countKenoHits(picks: number[], drawn: number[]): number {
  const drawnSet = new Set(drawn);
  return picks.filter((n) => drawnSet.has(n)).length;
}

export function getKenoMultiplier(spots: number, hits: number): number {
  return KENO_PAYTABLE[spots]?.[hits] ?? 0;
}

export function calculateKenoPayout(
  wager: number,
  picks: number[],
  drawn: number[],
): { payout: number; hits: number; multiplier: number; description: string } {
  const hits = countKenoHits(picks, drawn);
  const spots = picks.length;
  const multiplier = getKenoMultiplier(spots, hits);
  const payout = Math.max(0, Math.floor(wager * multiplier));

  let description: string;
  if (multiplier > 0) {
    description = `**${hits}/${spots}** hits — **${multiplier}x** payout!`;
  } else if (hits > 0) {
    description = `**${hits}/${spots}** hits — not enough for a payout.`;
  } else {
    description = "No hits this round.";
  }

  return { payout, hits, multiplier, description };
}

export function formatKenoNumbers(numbers: number[], highlight?: Set<number>): string {
  return numbers
    .map((n) => {
      const label = String(n);
      return highlight?.has(n) ? `**${label}**` : label;
    })
    .join(", ");
}
