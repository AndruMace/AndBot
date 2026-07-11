import { pokerLock } from "./lock";
import type { PokerTableService } from "./table";
import { chooseBotAction, isBotUserId } from "./bots";
import type { PokerAction, TableSnapshot } from "./types";

const MAX_BOT_ACTIONS_PER_TICK = 24;
const DEFAULT_THINK_DELAY_MS = 1_400;
const DEFAULT_ACT_DELAY_MS = 900;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type BotActionStep = {
  phase: "thinking" | "acted";
  snapshot: TableSnapshot;
  seatIndex: number;
  action?: PokerAction;
  raiseTo?: number;
};

export function formatBotActionLabel(action: PokerAction, raiseTo?: number): string {
  switch (action) {
    case "fold":
      return "folds";
    case "check":
      return "checks";
    case "call":
      return "calls";
    case "raise":
      return raiseTo != null ? `raises to ${raiseTo}` : "raises";
    case "all_in":
      return "goes all-in";
    default:
      return action;
  }
}

export type RunBotActionsOptions = {
  onStep?: (step: BotActionStep) => Promise<void>;
  thinkDelayMs?: number;
  actDelayMs?: number;
};

/** Act for each bot whose turn it is until a human must act or the hand ends. */
export async function runPendingBotActions(
  tableId: string,
  poker: PokerTableService,
  options?: RunBotActionsOptions,
): Promise<TableSnapshot | null> {
  const thinkDelay = options?.thinkDelayMs ?? DEFAULT_THINK_DELAY_MS;
  const actDelay = options?.actDelayMs ?? DEFAULT_ACT_DELAY_MS;
  let snapshot: TableSnapshot | null = null;

  for (let i = 0; i < MAX_BOT_ACTIONS_PER_TICK; i++) {
    snapshot = await poker.getSnapshot(tableId);
    if (!snapshot?.handState || snapshot.handState.street === "complete") break;

    const actionSeat = snapshot.handState.actionSeat;
    if (actionSeat == null) break;

    const actor = snapshot.seats[actionSeat];
    if (!actor?.userId || !isBotUserId(actor.userId)) break;

    if (options?.onStep) {
      await options.onStep({ phase: "thinking", snapshot, seatIndex: actionSeat });
      await sleep(thinkDelay);
    }

    const decision = chooseBotAction(snapshot, actionSeat);
    snapshot = await pokerLock.run(tableId, () =>
      poker.act(tableId, actor.userId!, decision.action, decision.raiseTo),
    );

    if (options?.onStep && snapshot) {
      await options.onStep({
        phase: "acted",
        snapshot,
        seatIndex: actionSeat,
        action: decision.action,
        raiseTo: decision.raiseTo,
      });
      await sleep(actDelay);
    }
  }

  return snapshot;
}
