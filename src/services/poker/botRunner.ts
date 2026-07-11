import { pokerLock } from "./lock";
import type { PokerTableService } from "./table";
import { chooseBotAction, isBotUserId } from "./bots";
import type { TableSnapshot } from "./types";

const MAX_BOT_ACTIONS_PER_TICK = 24;

/** Act for each bot whose turn it is until a human must act or the hand ends. */
export async function runPendingBotActions(
  tableId: string,
  poker: PokerTableService,
): Promise<TableSnapshot | null> {
  let snapshot: TableSnapshot | null = null;

  for (let i = 0; i < MAX_BOT_ACTIONS_PER_TICK; i++) {
    snapshot = await poker.getSnapshot(tableId);
    if (!snapshot?.handState || snapshot.handState.street === "complete") break;

    const actionSeat = snapshot.handState.actionSeat;
    if (actionSeat == null) break;

    const actor = snapshot.seats[actionSeat];
    if (!actor?.userId || !isBotUserId(actor.userId)) break;

    const decision = chooseBotAction(snapshot, actionSeat);
    snapshot = await pokerLock.run(tableId, () =>
      poker.act(tableId, actor.userId!, decision.action, decision.raiseTo),
    );
  }

  return snapshot;
}
