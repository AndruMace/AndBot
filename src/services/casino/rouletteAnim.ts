import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_BET_LABELS,
  colorOf,
  wheelIndexForResult,
  type RouletteBet,
} from "./roulette";

export const ROULETTE_FRAME_DELAYS = [120, 120, 160, 200, 280, 360, 480, 600] as const;

const WHEEL_LEN = EUROPEAN_WHEEL_ORDER.length;

const COLOR_EMOJI = {
  red: "🔴",
  black: "⚫",
  green: "🟢",
} as const;

function pocketAt(index: number): number {
  return EUROPEAN_WHEEL_ORDER[((index % WHEEL_LEN) + WHEEL_LEN) % WHEEL_LEN]!;
}

function formatPocket(n: number, highlighted: boolean): string {
  const label = n === 0 ? "0" : String(n).padStart(2, " ");
  return highlighted ? `[${label}]` : ` ${label} `;
}

export function renderRouletteFrame(
  centerIndex: number,
  bet: RouletteBet,
  spinning: boolean,
): string {
  const center = pocketAt(centerIndex);
  const left2 = pocketAt(centerIndex - 2);
  const left1 = pocketAt(centerIndex - 1);
  const right1 = pocketAt(centerIndex + 1);
  const right2 = pocketAt(centerIndex + 2);
  const emoji = COLOR_EMOJI[colorOf(center)];

  const lines = [
    "        ▼",
    `${formatPocket(left2, false)} ${formatPocket(left1, false)} ${formatPocket(center, true)} ${formatPocket(right1, false)} ${formatPocket(right2, false)}`,
    `       ${emoji} ${center}`,
    `Your bet: **${ROULETTE_BET_LABELS[bet]}**`,
  ];

  if (spinning) {
    lines.push("*Spinning...*");
  }

  return ["```", ...lines, "```"].join("\n");
}

/** Indices into EUROPEAN_WHEEL_ORDER — last entry centers the result under the pointer. */
export function buildRouletteSpinIndices(result: number): number[] {
  const targetIndex = wheelIndexForResult(result);
  const startOffset = crypto.getRandomValues(new Uint32Array(1))[0]! % WHEEL_LEN;
  const startIndex = targetIndex - startOffset;
  const totalSteps = WHEEL_LEN * 2 + startOffset;
  const frameCount = ROULETTE_FRAME_DELAYS.length + 1;

  const indices: number[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const progress = frame / (frameCount - 1);
    const step = Math.round(progress * totalSteps);
    indices.push(startIndex + step);
  }

  indices[indices.length - 1] = targetIndex;
  return indices;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
