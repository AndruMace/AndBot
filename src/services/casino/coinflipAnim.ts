import type { CoinSide } from "../coinflip";

export const COINFLIP_FRAME_DELAY_MS = 450;

const SIDE_EMOJI: Record<CoinSide, string> = {
  heads: "🦅",
  tails: "🔵",
};

function coinBox(center: string, label?: string): string {
  const lines = ["   ┌─────┐", `   │  ${center}  │`];
  if (label) {
    lines.push(`   │ ${label.padEnd(5)} │`);
  }
  lines.push("   └─────┘");
  return ["```", ...lines, "```"].join("\n");
}

export function renderCoinflipSpinFrame(symbol: string): string {
  return `${coinBox(symbol)}\n*Flipping...*`;
}

export function renderCoinflipResultFrame(side: CoinSide): string {
  return coinBox(SIDE_EMOJI[side], side.toUpperCase());
}

/** Spin symbols, then land on the final side. */
export function buildCoinflipFrames(finalSide: CoinSide): string[] {
  const spinSymbols = ["🪙", "✨", "🌑", "✨"];
  return [...spinSymbols.map(renderCoinflipSpinFrame), renderCoinflipResultFrame(finalSide)];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
