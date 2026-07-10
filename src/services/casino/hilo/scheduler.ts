import type { HiloSessionService } from "./session";

export function startHiloScheduler(hilo: HiloSessionService) {
  const tick = async () => {
    try {
      const duplicates = await hilo.reconcileDuplicateActiveSessions();
      const expired = await hilo.sweepExpiredSessions();
      if (duplicates > 0 || expired > 0) {
        console.log(
          `Hi-Lo maintenance: refunded ${duplicates} duplicate and ${expired} expired session(s).`,
        );
      }
    } catch (err) {
      console.error("Hi-Lo scheduler error:", err);
    }
  };

  void tick();
  return setInterval(tick, 60_000);
}
