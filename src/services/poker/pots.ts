import type { PotInfo } from "./types";

export type PotContributor = {
  seatIndex: number;
  totalCommitted: number;
  folded: boolean;
};

/** Build main + side pots from per-player total commitments. */
export function calculatePots(contributors: PotContributor[]): PotInfo[] {
  const active = contributors.filter((c) => c.totalCommitted > 0);
  if (active.length === 0) return [];

  const levels = [...new Set(active.map((c) => c.totalCommitted))].sort((a, b) => a - b);
  const pots: PotInfo[] = [];
  let previous = 0;

  for (const level of levels) {
    const increment = level - previous;
    const eligible = active.filter((c) => c.totalCommitted >= level && !c.folded);
    const contributorsAtLevel = active.filter((c) => c.totalCommitted >= level);
    const amount = increment * contributorsAtLevel.length;
    if (amount > 0 && eligible.length > 0) {
      pots.push({
        amount,
        eligibleSeatIndices: eligible.map((c) => c.seatIndex),
      });
    }
    previous = level;
  }

  return pots;
}

export function totalPotAmount(pots: PotInfo[]): number {
  return pots.reduce((sum, pot) => sum + pot.amount, 0);
}

/** Split a pot evenly among winners; remainder goes to lowest seat index first. */
export function splitPot(amount: number, winnerSeatIndices: number[]): Map<number, number> {
  const payouts = new Map<number, number>();
  if (winnerSeatIndices.length === 0) return payouts;

  const sorted = [...winnerSeatIndices].sort((a, b) => a - b);
  const share = Math.floor(amount / sorted.length);
  let remainder = amount - share * sorted.length;

  for (const seat of sorted) {
    let payout = share;
    if (remainder > 0) {
      payout += 1;
      remainder -= 1;
    }
    payouts.set(seat, (payouts.get(seat) ?? 0) + payout);
  }

  return payouts;
}
