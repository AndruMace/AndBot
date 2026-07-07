export const LUCKY_FRAME_DELAY_MS = 400;
export const LUCKY_TICK_COUNT = 10;

export function buildLuckyFrames(finalRoll: number, ticks = LUCKY_TICK_COUNT): number[] {
  const frames: number[] = [];
  for (let i = 0; i < ticks; i++) {
    frames.push((crypto.getRandomValues(new Uint32Array(1))[0]! % 100) + 1);
  }
  frames.push(finalRoll);
  return frames;
}

export function renderLuckyFrame(value: number, pick: number, spinning: boolean): string {
  const display = String(value).padStart(3, " ");
  const block = ["```", "  ╔═══════╗", `  ║  ${display}   ║`, "  ╚═══════╝", "```"].join("\n");
  return `${block}\nYour pick: **${pick}**${spinning ? "\n*Rolling...*" : ""}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
