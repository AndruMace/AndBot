import type { PokerTableService } from "./table";
import { runPendingBotActions } from "./botRunner";

export function startPokerScheduler(poker: PokerTableService) {
  const tick = async () => {
    try {
      const expired = await poker.sweepExpiredTables();
      const timedOutTables = await poker.sweepActionTimeouts();
      for (const tableId of timedOutTables) {
        await runPendingBotActions(tableId, poker);
      }
      if (expired > 0 || timedOutTables.length > 0) {
        console.log(
          `Poker maintenance: closed ${expired} table(s), auto-folded ${timedOutTables.length} timed-out action(s).`,
        );
      }
    } catch (err) {
      console.error("Poker scheduler error:", err);
    }
  };

  void tick();
  return setInterval(tick, 30_000);
}
