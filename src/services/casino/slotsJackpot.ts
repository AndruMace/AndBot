import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { slotsJackpots, type SlotsJackpot } from "../../db/schema";

export const SLOTS_JACKPOT_PAYOUT_PERCENT = 90;

export function calculateJackpotPayout(accumulatedLosses: number): number {
  if (accumulatedLosses <= 0) return 0;
  return Math.floor((accumulatedLosses * SLOTS_JACKPOT_PAYOUT_PERCENT) / 100);
}

export type SlotsJackpotSettleResult = {
  accumulatedLosses: number;
  jackpotPayout: number;
};

export class SlotsJackpotService {
  constructor(private db: Database) {}

  async getJackpot(guildId: string): Promise<SlotsJackpot> {
    return this.db.transaction(async (tx) => this.getOrCreateRow(tx, guildId));
  }

  /** Apply jackpot feed and/or progressive award in one locked transaction. */
  async settleSpin(
    guildId: string,
    userId: string,
    netLoss: number,
    isJackpotWin: boolean,
    potBeforeSpin: number,
  ): Promise<SlotsJackpotSettleResult> {
    if (!isJackpotWin && netLoss <= 0) {
      return { accumulatedLosses: potBeforeSpin, jackpotPayout: 0 };
    }

    return this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, guildId);
      let accumulatedLosses = row.accumulatedLosses;
      let jackpotPayout = 0;

      if (isJackpotWin) {
        jackpotPayout = calculateJackpotPayout(row.accumulatedLosses);
        accumulatedLosses = 0;
      }

      if (netLoss > 0) {
        accumulatedLosses += netLoss;
      }

      await tx
        .update(slotsJackpots)
        .set({
          accumulatedLosses,
          lastWinnerId: isJackpotWin && jackpotPayout > 0 ? userId : row.lastWinnerId,
          lastWonAt: isJackpotWin && jackpotPayout > 0 ? new Date() : row.lastWonAt,
          totalWins: isJackpotWin && jackpotPayout > 0 ? row.totalWins + 1 : row.totalWins,
          updatedAt: new Date(),
        })
        .where(eq(slotsJackpots.guildId, guildId));

      return { accumulatedLosses, jackpotPayout };
    });
  }

  async feedJackpot(guildId: string, netLoss: number): Promise<number> {
    if (netLoss <= 0) {
      const row = await this.getJackpot(guildId);
      return row.accumulatedLosses;
    }

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

  async awardJackpot(guildId: string, userId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, guildId);
      const payout = calculateJackpotPayout(row.accumulatedLosses);

      await tx
        .update(slotsJackpots)
        .set({
          accumulatedLosses: 0,
          lastWinnerId: payout > 0 ? userId : row.lastWinnerId,
          lastWonAt: payout > 0 ? new Date() : row.lastWonAt,
          totalWins: payout > 0 ? row.totalWins + 1 : row.totalWins,
          updatedAt: new Date(),
        })
        .where(eq(slotsJackpots.guildId, guildId));

      return payout;
    });
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
