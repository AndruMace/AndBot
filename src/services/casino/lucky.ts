export function rollLuckyNumber(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0]! % 100) + 1;
}

export function calculateLuckyPayout(
  wager: number,
  pick: number,
  roll: number,
): { payout: number; description: string } {
  const diff = Math.abs(pick - roll);

  if (pick === roll) {
    return { payout: wager * 25, description: "Exact match! 25x payout." };
  }
  if (diff <= 3) {
    return { payout: wager * 5, description: `Within 3 (${diff} away)! 5x payout.` };
  }
  if (diff <= 7) {
    return { payout: wager * 3, description: `Within 7 (${diff} away)! 3x payout.` };
  }
  if (diff <= 15) {
    return { payout: wager * 2, description: `Within 15 (${diff} away)! 2x payout.` };
  }

  return { payout: 0, description: `Too far off (${diff} away).` };
}
