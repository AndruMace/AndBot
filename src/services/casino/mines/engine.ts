export const MINES_GRID_SIZE = 20;
export const MINES_COLUMNS = 5;
export const MINES_ROWS = 4;

export const MINES_OPTIONS = [3, 5, 8] as const;
export type MinesCount = (typeof MINES_OPTIONS)[number];

export function generateMinePositions(count: MinesCount): number[] {
  const positions = new Set<number>();
  while (positions.size < count) {
    positions.add(crypto.getRandomValues(new Uint32Array(1))[0]! % MINES_GRID_SIZE);
  }
  return [...positions];
}

export function gemMultiplier(gemsFound: number): number {
  return 1 + gemsFound * 0.35;
}

export function calculateMinesPayout(wager: number, gemsFound: number): number {
  return Math.floor(wager * gemMultiplier(gemsFound));
}

export function tileLabel(index: number, revealed: boolean, isMine: boolean): string {
  if (!revealed) return "⬜";
  if (isMine) return "💥";
  return "💎";
}
