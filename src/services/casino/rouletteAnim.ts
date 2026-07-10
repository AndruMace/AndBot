import {
  EUROPEAN_WHEEL_ORDER,
  ROULETTE_BET_LABELS,
  colorOf,
  wheelIndexForResult,
  type RouletteBet,
} from "./roulette";

export const ROULETTE_MIN_SPIN_STEPS = 26;
export const ROULETTE_MAX_SPIN_STEPS = 34;

const WHEEL_LEN = EUROPEAN_WHEEL_ORDER.length;

const COLOR_EMOJI = {
  red: "🔴",
  black: "⚫",
  green: "🟢",
} as const;

function pocketAt(index: number): number {
  return EUROPEAN_WHEEL_ORDER[((index % WHEEL_LEN) + WHEEL_LEN) % WHEEL_LEN]!;
}

function formatColoredPocket(n: number, highlighted: boolean): string {
  const emoji = COLOR_EMOJI[colorOf(n)];
  const num = n === 0 ? "0" : String(n).padStart(2, " ");
  const core = `${emoji}${num}`;
  return highlighted ? `[${core}]` : ` ${core} `;
}

export type RouletteFrameOptions = {
  spinning?: boolean;
  showBet?: boolean;
};

export function renderRouletteFrame(
  centerIndex: number,
  bet: RouletteBet,
  options: RouletteFrameOptions = {},
): string {
  const { spinning = false, showBet = true } = options;
  const left2 = pocketAt(centerIndex - 2);
  const left1 = pocketAt(centerIndex - 1);
  const center = pocketAt(centerIndex);
  const right1 = pocketAt(centerIndex + 1);
  const right2 = pocketAt(centerIndex + 2);

  const art = [
    "```",
    [
      formatColoredPocket(left2, false),
      formatColoredPocket(left1, false),
      formatColoredPocket(center, true),
      formatColoredPocket(right1, false),
      formatColoredPocket(right2, false),
    ].join(""),
    "```",
  ].join("\n");

  const lines = [art];
  if (showBet) {
    lines.push(`Your bet: **${ROULETTE_BET_LABELS[bet]}**`);
  }
  if (spinning) {
    lines.push("*Spinning...*");
  }

  return lines.join("\n");
}

/** Decelerating delay (ms) for spin frame `step` of `totalDelays` gaps. */
export function rouletteDelayForStep(step: number, totalDelays: number): number {
  if (totalDelays <= 1) return 120;
  const t = step / (totalDelays - 1);
  return Math.round(90 + t * t * 460);
}

/** Wheel indices — one pocket per frame; last entry centers the result. */
export function buildRouletteSpinIndices(result: number): number[] {
  const targetIndex = wheelIndexForResult(result);
  const span = ROULETTE_MAX_SPIN_STEPS - ROULETTE_MIN_SPIN_STEPS + 1;
  const totalSteps =
    ROULETTE_MIN_SPIN_STEPS + (crypto.getRandomValues(new Uint32Array(1))[0]! % span);
  const startIndex = targetIndex - totalSteps;

  const indices: number[] = [];
  for (let step = 0; step <= totalSteps; step++) {
    indices.push(startIndex + step);
  }
  indices[indices.length - 1] = targetIndex;
  return indices;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
