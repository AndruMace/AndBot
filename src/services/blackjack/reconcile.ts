import type { Database } from "../../db/client";
import type { Config } from "../../config";
import { createWalletService } from "../wallet";
import { createBlackjackSessionService } from "./session";

/** Refund duplicate/expired active sessions before the unique index is enforced. */
export async function reconcileBlackjackSessions(db: Database, config: Config): Promise<void> {
  const wallet = createWalletService(db, config);
  const blackjack = createBlackjackSessionService(db, wallet, config);

  try {
    const duplicates = await blackjack.reconcileDuplicateActiveSessions();
    const expired = await blackjack.sweepExpiredSessions(200);

    if (duplicates > 0 || expired > 0) {
      console.log(
        `Blackjack startup reconcile: refunded ${duplicates} duplicate and ${expired} expired session(s).`,
      );
    }
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
}

function isMissingTable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "42P01"
  );
}
