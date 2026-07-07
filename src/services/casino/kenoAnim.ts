import { formatKenoNumbers } from "./keno";

export const KENO_FRAME_DELAY_MS = 450;
export const KENO_REVEAL_BATCH = 4;

export function buildKenoRevealFrames(drawn: number[], batchSize = KENO_REVEAL_BATCH): number[][] {
  const frames: number[][] = [];
  for (let i = batchSize; i < drawn.length; i += batchSize) {
    frames.push(drawn.slice(0, i));
  }
  frames.push(drawn);
  return frames;
}

export function renderKenoFrame(
  picks: number[],
  revealed: number[],
  spinning: boolean,
): string {
  const hitSet = new Set(picks.filter((n) => revealed.includes(n)));
  const picksLine = `Your picks: ${formatKenoNumbers(picks)}`;
  const drawLine =
    revealed.length > 0
      ? `Drawn (${revealed.length}): ${formatKenoNumbers(revealed, hitSet)}`
      : "Drawn: —";
  const hits = hitSet.size;
  const status = spinning
    ? "*Drawing numbers...*"
    : hits > 0
      ? `Hits so far: **${hits}**`
      : "";

  return [picksLine, drawLine, status].filter(Boolean).join("\n");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
