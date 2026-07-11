import type { Client } from "discord.js";
import type { Config } from "../../config";
import type { PokerTableService } from "../../services/poker/table";
import type { TableSnapshot } from "../../services/poker/types";
import { formatPokerActor } from "../../services/poker/bots";
import { editPokerTableMessage } from "./tableMessage";
import type { TableEmbedExtras } from "./embeds";
import { formatBotActionLabel } from "../../services/poker/botRunner";
import type { BotActionStep } from "../../services/poker/botRunner";

export const CARD_REVEAL_MS = 650;
export const DEAL_PHASE_MS = 750;
export const SHOWDOWN_MS = 700;
export const SPINNER_MS = 320;
export const ACTION_FLASH_MS = 450;
export const DEFAULT_THINK_DELAY_MS = 1_400;
export const DEFAULT_ACT_DELAY_MS = 900;

import { SPINNER_FRAMES } from "./visuals";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function streetBannerForCardCount(count: number): string {
  if (count >= 5) return "🃏 The River";
  if (count === 4) return "🃏 The Turn";
  if (count === 3) return "🃏 The Flop";
  if (count > 0) return "🃏 Card revealed";
  return "🎴 Dealing…";
}

export async function playAnimationFrames(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  frames: TableEmbedExtras[],
  delayMs: number,
): Promise<void> {
  for (const frame of frames) {
    await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
      ...frame,
      interactive: false,
    });
    await sleep(delayMs);
  }
}

export async function animateHandStart(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
): Promise<void> {
  await playAnimationFrames(
    client,
    poker,
    tableId,
    config,
    viewerUserId,
    [
      { banner: "🔀 Shuffling the deck…" },
      { banner: "🎴 Dealing hole cards…", showHoleBacks: true },
      { banner: "💰 Posting blinds…", showHoleBacks: true },
    ],
    DEAL_PHASE_MS,
  );
}

export async function animateBoardGrowth(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  beforeBoardLen: number,
  snapshot: TableSnapshot,
): Promise<void> {
  const board = snapshot.handState?.board ?? [];
  if (board.length <= beforeBoardLen) return;

  for (let count = beforeBoardLen + 1; count <= board.length; count++) {
    await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
      banner: streetBannerForCardCount(count),
      revealedBoardCount: count,
      interactive: false,
    });
    await sleep(CARD_REVEAL_MS);
  }
}

export async function animateHandEnd(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  snapshot: TableSnapshot,
): Promise<void> {
  const hand = snapshot.handState;
  if (!hand || hand.street !== "complete") return;

  const winners = hand.winners ?? [];
  const foldedWin = hand.board.length === 0 && winners.length > 0;

  if (!foldedWin && hand.board.length > 0) {
    await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
      banner: "🎭 Showdown!",
      interactive: false,
    });
    await sleep(SHOWDOWN_MS);
  }

  if (winners.length > 0) {
    const winnerNames = winners
      .map((w) => {
        const user = snapshot.seats[w.seatIndex]?.userId;
        return user ? formatPokerActor(user) : null;
      })
      .filter(Boolean)
      .join(", ");

    await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
      banner: foldedWin ? `🏁 ${winnerNames} wins the pot!` : `🏆 ${winnerNames} wins!`,
      celebrating: true,
      interactive: false,
    });
    await sleep(900);
  }
}

export async function animateBotThinking(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  step: BotActionStep,
  thinkDelayMs: number,
): Promise<void> {
  const frames = Math.max(2, Math.floor(thinkDelayMs / SPINNER_MS));
  for (let i = 0; i < frames; i++) {
    await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
      thinkingSeat: step.seatIndex,
      spinnerFrame: i % SPINNER_FRAMES.length,
      banner: "⏳ Thinking…",
      interactive: false,
    });
    await sleep(SPINNER_MS);
  }
}

export async function animateBotActed(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  step: BotActionStep,
): Promise<void> {
  if (!step.action) return;
  await editPokerTableMessage(client, poker, tableId, config, viewerUserId, {
    lastAction: {
      seatIndex: step.seatIndex,
      label: formatBotActionLabel(step.action, step.raiseTo),
    },
    banner: "✨ Action!",
    interactive: false,
  });
  await sleep(ACTION_FLASH_MS);
  await sleep(DEFAULT_ACT_DELAY_MS - ACTION_FLASH_MS);
}

export async function animateAfterHumanAction(
  client: Client,
  poker: PokerTableService,
  tableId: string,
  config: Config,
  viewerUserId: string,
  before: TableSnapshot,
): Promise<void> {
  const after = await poker.getSnapshot(tableId);
  if (!after?.handState) return;

  const beforeBoard = before.handState?.board.length ?? 0;
  const afterBoard = after.handState.board.length;

  if (afterBoard > beforeBoard) {
    await animateBoardGrowth(client, poker, tableId, config, viewerUserId, beforeBoard, after);
  }

  if (after.handState.street === "complete" && before.handState?.street !== "complete") {
    await animateHandEnd(client, poker, tableId, config, viewerUserId, after);
  }
}
