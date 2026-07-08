import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { slotsJackpots, type SlotsJackpot } from "../../db/schema";

export const SLOTS_JACKPOT_PAYOUT_PERCENT = 90;

export function calculateJackpotPayout(accumulatedLosses: number): number {
  if (accumulatedLosses <= 0) return 0;
  return Math.floor((accumulatedLosses * SLOTS_JACKPOT_PAYOUT_PERCENT) / 100);
}

export function resolveJackpotSettlement(
  currentPot: number,
  netLoss: number,
  isJackpotWin: boolean,
): { accumulatedLosses: number; jackpotPayout: number } {
  if (isJackpotWin) {
    return {
      accumulatedLosses: 0,
      jackpotPayout: calculateJackpotPayout(currentPot),
    };
  }
  if (netLoss > 0) {
    return { accumulatedLosses: currentPot + netLoss, jackpotPayout: 0 };
  }
  return { accumulatedLosses: currentPot, jackpotPayout: 0 };
}

export class SlotsJackpotService {
  constructor(private db: Database) {}

  async getJackpot(guildId: string): Promise<SlotsJackpot> {
    return this.db.transaction(async (tx) => this.getOrCreateRow(tx, guildId));
  }

  async settleSpin(
    guildId: string,
    userId: string,
    netLoss: number,
    isJackpotWin: boolean,
  ): Promise<{ accumulatedLosses: number; jackpotPayout: number }> {
    return this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, guildId);
      const { accumulatedLosses, jackpotPayout } = resolveJackpotSettlement(
        row.accumulatedLosses,
        netLoss,
        isJackpotWin,
      );

      if (isJackpotWin) {
        await tx
          .update(slotsJackpots)
          .set({
            accumulatedLosses: 0,
            lastWinnerId: jackpotPayout > 0 ? userId : row.lastWinnerId,
            lastWonAt: jackpotPayout > 0 ? new Date() : row.lastWonAt,
            totalWins: jackpotPayout > 0 ? row.totalWins + 1 : row.totalWins,
            updatedAt: new Date(),
          })
          .where(eq(slotsJackpots.guildId, guildId));
      } else if (netLoss > 0) {
        await tx
          .update(slotsJackpots)
          .set({ accumulatedLosses, updatedAt: new Date() })
          .where(eq(slotsJackpots.guildId, guildId));
      }

      return { accumulatedLosses, jackpotPayout };
    });
  }

  /** @deprecated use settleSpin */
  async feedJackpot(
    guildId: string,
    netLoss: number,
    knownPot = 0,
  ): Promise<number> {
    if (netLoss <= 0) return knownPot;

    return this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, guildId);
      const accumulatedLosses = row.accumulatedLosses + netLoss;

      await tx
        .update(slotsJackpots)
        .set({ accumulatedLosses, updatedAt: new Date() })
        .where(eq(slotsJackpots.guildId, guildId));

      return accumulatedLosses;
    });
  }

  /** @deprecated use settleSpin */
  async awardJackpot(guildId: string, userId: string): Promise<number> {
    const { jackpotPayout } = await this.settleSpin(guildId, userId, 0, true);
    return jackpotPayout;
  }

  private async getOrCreateRow(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    guildId: string,
  ): Promise<SlotsJackpot> {
    const [existing] = await tx
      .select()
      .from(slotsJackpots)
      .where(eq(slotsJackpots.guildId, guildId))
      .for("update");

    if (existing) return existing;

    const [created] = await tx
      .insert(slotsJackpots)
      .values({ guildId })
      .onConflictDoNothing()
      .returning();

    if (created) return created;

    const [row] = await tx
      .select()
      .from(slotsJackpots)
      .where(eq(slotsJackpots.guildId, guildId))
      .for("update");

    return row!;
  }

  private async lockRow(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    guildId: string,
  ): Promise<SlotsJackpot> {
    return this.getOrCreateRow(tx, guildId);
  }
}

export function createSlotsJackpotService(db: Database): SlotsJackpotService {
  return new SlotsJackpotService(db);
}
