import type { Database } from "../../../db/client";
import type { Config } from "../../../config";
import { createWalletService } from "../../wallet";
import { createHiloSessionService } from "./session";

/** Refund duplicate/expired active sessions before the unique index is enforced. */
export async function reconcileHiloSessions(db: Database, config: Config): Promise<void> {
  const wallet = createWalletService(db, config);
  const hilo = createHiloSessionService(db, wallet, config);

  try {
    const duplicates = await hilo.reconcileDuplicateActiveSessions();
    const expired = await hilo.sweepExpiredSessions(200);

    if (duplicates > 0 || expired > 0) {
      console.log(
        `Hi-Lo startup reconcile: refunded ${duplicates} duplicate and ${expired} expired session(s).`,
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
