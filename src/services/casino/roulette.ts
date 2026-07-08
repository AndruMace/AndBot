/** Canonical European single-zero wheel order (clockwise from 0). */
export const EUROPEAN_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33,
  1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColor = "red" | "black" | "green";
export type RouletteBet = "red" | "black" | "odd" | "even" | "zero";

export const ROULETTE_BET_LABELS: Record<RouletteBet, string> = {
  red: "Red",
  black: "Black",
  odd: "Odd",
  even: "Even",
  zero: "0",
};

const EVEN_MONEY_MULT = 2;
const ZERO_MULT = 36;

export function isValidRouletteResult(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 36;
}

export function colorOf(n: number): RouletteColor {
  if (n === 0) return "green";
  if (RED_NUMBERS.has(n)) return "red";
  return "black";
}

export function isRed(n: number): boolean {
  return colorOf(n) === "red";
}

export function isBlack(n: number): boolean {
  return colorOf(n) === "black";
}

export function spinRoulette(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 37;
}

export function wheelIndexForResult(result: number): number {
  const index = EUROPEAN_WHEEL_ORDER.indexOf(result as (typeof EUROPEAN_WHEEL_ORDER)[number]);
  return index >= 0 ? index : 0;
}

export function parseRouletteBet(raw: string): RouletteBet {
  switch (raw) {
    case "red":
    case "black":
    case "odd":
    case "even":
    case "zero":
      return raw;
    default:
      throw new Error("Invalid roulette bet.");
  }
}

export function resolveRouletteBet(
  bet: RouletteBet,
  result: number,
): { won: boolean; payoutMultiplier: number; description: string } {
  if (!isValidRouletteResult(result)) {
    throw new Error("Invalid roulette result.");
  }

  const color = colorOf(result);
  let won = false;

  switch (bet) {
    case "red":
      won = color === "red";
      break;
    case "black":
      won = color === "black";
      break;
    case "odd":
      won = result !== 0 && result % 2 === 1;
      break;
    case "even":
      won = result !== 0 && result % 2 === 0;
      break;
    case "zero":
      won = result === 0;
      break;
  }

  const payoutMultiplier = won ? (bet === "zero" ? ZERO_MULT : EVEN_MONEY_MULT) : 0;
  const colorLabel = color === "green" ? "Green" : color === "red" ? "Red" : "Black";
  const outcome = won ? "**Win!**" : "**Loss.**";

  return {
    won,
    payoutMultiplier,
    description: `Landed **${result}** (${colorLabel}). ${outcome}`,
  };
}

export function calculateRoulettePayout(
  wager: number,
  bet: RouletteBet,
  result: number,
): { payout: number; won: boolean; description: string } {
  const resolved = resolveRouletteBet(bet, result);
  return {
    payout: resolved.won ? Math.floor(wager * resolved.payoutMultiplier) : 0,
    won: resolved.won,
    description: resolved.description,
  };
}

/** Expected return per coin staked for a bet type (European wheel). */
export function getRouletteExpectedRtp(bet: RouletteBet, wager = 100): number {
  let expected = 0;
  for (let result = 0; result <= 36; result++) {
    const { payoutMultiplier } = resolveRouletteBet(bet, result);
    expected += (Math.floor(wager * payoutMultiplier) / wager) * (1 / 37);
  }
  return expected;
}
