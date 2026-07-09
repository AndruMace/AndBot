import type { BlackjackSessionService } from "./session";

export function startBlackjackScheduler(blackjack: BlackjackSessionService) {
  const tick = async () => {
    try {
      const duplicates = await blackjack.reconcileDuplicateActiveSessions();
      const expired = await blackjack.sweepExpiredSessions();
      if (duplicates > 0 || expired > 0) {
        console.log(
          `Blackjack maintenance: refunded ${duplicates} duplicate and ${expired} expired session(s).`,
        );
      }
    } catch (err) {
      console.error("Blackjack scheduler error:", err);
    }
  };

  void tick();
  return setInterval(tick, 60_000);
}
