const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const SUITS = ["♥", "♦", "♣", "♠"] as const;

export type HiLoChoice = "higher" | "lower";

export function drawCard(): { rank: number; label: string } {
  const rankIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % RANKS.length;
  const suitIndex = crypto.getRandomValues(new Uint32Array(1))[0]! % SUITS.length;
  const rank = rankIndex + 1;
  return { rank, label: `${RANKS[rankIndex]}${SUITS[suitIndex]}` };
}

export function resolveHiLo(
  currentRank: number,
  nextRank: number,
  choice: HiLoChoice,
): boolean {
  if (nextRank === currentRank) return false;
  if (choice === "higher") return nextRank > currentRank;
  return nextRank < currentRank;
}

export function rankLabel(rank: number): string {
  return RANKS[rank - 1] ?? String(rank);
}
