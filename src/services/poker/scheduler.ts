import type { PokerTableService } from "./table";

export function startPokerScheduler(poker: PokerTableService) {
  const tick = async () => {
    try {
      const expired = await poker.sweepExpiredTables();
      const timeouts = await poker.sweepActionTimeouts();
      if (expired > 0 || timeouts > 0) {
        console.log(
          `Poker maintenance: closed ${expired} table(s), auto-folded ${timeouts} timed-out action(s).`,
        );
      }
    } catch (err) {
      console.error("Poker scheduler error:", err);
    }
  };

  void tick();
  return setInterval(tick, 30_000);
}
