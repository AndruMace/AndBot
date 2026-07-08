export type PlinkoBucket = {
  label: string;
  multiplier: number;
  weight: number;
};

/** ~95.4% RTP at normal stakes (4.6% house edge). Weights sum to 100. */
export const PLINKO_BUCKETS: PlinkoBucket[] = [
  { label: "0.2x", multiplier: 0.2, weight: 27 },
  { label: "0.5x", multiplier: 0.5, weight: 25 },
  { label: "1x", multiplier: 1, weight: 23 },
  { label: "1.5x", multiplier: 1.5, weight: 11 },
  { label: "2x", multiplier: 2, weight: 8 },
  { label: "3x", multiplier: 3, weight: 4 },
  { label: "5x", multiplier: 5, weight: 2 },
];

export const PLINKO_PEG_ROWS = 6;
export const PLINKO_FRAME_DELAY_MS = 650;

const COLS = PLINKO_BUCKETS.length;
const START_COL = Math.floor(COLS / 2);

export function dropPlinko(): PlinkoBucket {
  return PLINKO_BUCKETS[dropPlinkoIndex()]!;
}

export function dropPlinkoIndex(): number {
  const total = PLINKO_BUCKETS.reduce((sum, b) => sum + b.weight, 0);
  let roll = crypto.getRandomValues(new Uint32Array(1))[0]! % total;

  for (let i = 0; i < PLINKO_BUCKETS.length; i++) {
    roll -= PLINKO_BUCKETS[i]!.weight;
    if (roll < 0) return i;
  }

  return 0;
}

/** One column per peg row; the last entry is the landing bucket column. */
export function generatePlinkoPath(
  targetIndex: number,
  pegRows = PLINKO_PEG_ROWS,
): number[] {
  const path: number[] = [START_COL];

  for (let row = 1; row < pegRows; row++) {
    const prev = path[row - 1]!;
    const remaining = pegRows - row - 1;
    const dist = targetIndex - prev;
    let step: number;

    if (remaining === 0) {
      step = dist;
      if (step > 1) step = 1;
      else if (step < -1) step = -1;
    } else if (dist > remaining) {
      step = 1;
    } else if (dist < -remaining) {
      step = -1;
    } else {
      step = crypto.getRandomValues(new Uint32Array(1))[0]! % 2 === 0 ? -1 : 1;
      if (Math.abs(dist - step) > remaining) {
        step = dist > 0 ? 1 : -1;
      }
    }

    const next =
      remaining === 0
        ? targetIndex
        : Math.max(0, Math.min(COLS - 1, prev + step));

    path.push(next);
  }

  return path;
}

export const PLINKO_COL_WIDTH = 6;

function fixedCol(text: string): string {
  if (text.length >= PLINKO_COL_WIDTH) {
    return text.slice(0, PLINKO_COL_WIDTH);
  }
  const pad = PLINKO_COL_WIDTH - text.length;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + text + " ".repeat(pad - left);
}

export function renderPlinkoFrame(path: number[], step: number): string {
  const pegRowCount = path.length;
  const landed = step >= pegRowCount - 1;
  const ballRow = landed ? pegRowCount - 1 : step;
  const ballCol = path[ballRow]!;
  const bucketCol = path[pegRowCount - 1]!;
  const lines: string[] = [];

  for (let row = 0; row < pegRowCount; row++) {
    const parts = PLINKO_BUCKETS.map((_, col) => {
      if (row === ballRow && col === ballCol) {
        return fixedCol("[O]");
      }
      return fixedCol("·");
    });
    lines.push(parts.join(""));
  }

  const bucketParts = PLINKO_BUCKETS.map((bucket, col) => {
    const win = landed && col === bucketCol;
    return fixedCol(win ? `[${bucket.label}]` : bucket.label);
  });
  lines.push(bucketParts.join(""));

  if (landed) {
    const pointer = PLINKO_BUCKETS.map((_, col) =>
      fixedCol(col === bucketCol ? "^" : " "),
    ).join("");
    lines.push(pointer);
  }

  return ["```", ...lines, "```"].join("\n");
}

export function calculatePlinkoPayout(wager: number, bucket: PlinkoBucket): number {
  return Math.max(0, Math.floor(wager * bucket.multiplier));
}

/** Expected return per coin staked (1.0 = break-even). */
export function getPlinkoExpectedRtp(wager = 100): number {
  const totalWeight = PLINKO_BUCKETS.reduce((sum, bucket) => sum + bucket.weight, 0);
  return PLINKO_BUCKETS.reduce((rtp, bucket) => {
    const payout = calculatePlinkoPayout(wager, bucket);
    return rtp + (payout / wager) * (bucket.weight / totalWeight);
  }, 0);
}

export function formatPlinkoBoard(landed: PlinkoBucket): string {
  return PLINKO_BUCKETS.map((b) => (b.label === landed.label ? `[${b.label}]` : b.label)).join(
    " → ",
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
