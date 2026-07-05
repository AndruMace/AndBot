import { eq, and, desc, sql, lte } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  lotteryRounds,
  lotteryTickets,
  type LotteryRound,
  type LotteryTicket,
} from "../../db/schema";
import type { Config } from "../../config";
import type { WalletService } from "../wallet";
import { InsufficientFundsError } from "../wallet";
import { addDays } from "../../utils/time";
import { calculateLotteryPayout, pickWinningTicketNumber } from "./engine";

export class LotteryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LotteryError";
  }
}

export type LotteryDrawResult = {
  round: LotteryRound;
  nextRound: LotteryRound;
  winningTicket: LotteryTicket | null;
  payout: number;
  rake: number;
  noTickets: boolean;
};

export type LotteryStatus = {
  round: LotteryRound;
  userTicketCount: number;
  uniquePlayers: number;
  lastCompleted: LotteryRound | null;
};

export class LotteryService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async getOpenRound(guildId: string): Promise<LotteryRound | null> {
    const [round] = await this.db
      .select()
      .from(lotteryRounds)
      .where(and(eq(lotteryRounds.guildId, guildId), eq(lotteryRounds.status, "open")))
      .limit(1);
    return round ?? null;
  }

  async getOrCreateOpenRound(guildId: string, channelId?: string): Promise<LotteryRound> {
    const existing = await this.getOpenRound(guildId);
    if (existing) {
      if (channelId && !existing.announceChannelId) {
        const [updated] = await this.db
          .update(lotteryRounds)
          .set({ announceChannelId: channelId })
          .where(eq(lotteryRounds.id, existing.id))
          .returning();
        return updated!;
      }
      return existing;
    }

    const [lastRound] = await this.db
      .select({ roundNumber: lotteryRounds.roundNumber })
      .from(lotteryRounds)
      .where(eq(lotteryRounds.guildId, guildId))
      .orderBy(desc(lotteryRounds.roundNumber))
      .limit(1);

    const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

    const [created] = await this.db
      .insert(lotteryRounds)
      .values({
        guildId,
        roundNumber,
        ticketPrice: this.config.LOTTERY_TICKET_PRICE,
        scheduledDrawAt: addDays(this.config.LOTTERY_DRAW_INTERVAL_DAYS),
        announceChannelId: channelId,
      })
      .returning();

    return created!;
  }

  async buyTickets(
    guildId: string,
    userId: string,
    channelId: string,
    count: number,
  ): Promise<{ round: LotteryRound; tickets: LotteryTicket[]; balance: number }> {
    if (count < 1 || count > this.config.LOTTERY_MAX_TICKETS_PER_PURCHASE) {
      throw new LotteryError(
        `You can buy between 1 and ${this.config.LOTTERY_MAX_TICKETS_PER_PURCHASE} tickets at a time.`,
      );
    }

    const ticketPrice = this.config.LOTTERY_TICKET_PRICE;
    const totalCost = ticketPrice * count;
    const openRound = await this.getOrCreateOpenRound(guildId, channelId);

    const balance = await this.wallet.debit(
      guildId,
      userId,
      totalCost,
      "lottery_ticket",
      openRound.id,
      { count, ticketPrice },
    );

    try {
      const result = await this.db.transaction(async (tx) => {
        const [round] = await tx
          .select()
          .from(lotteryRounds)
          .where(and(eq(lotteryRounds.id, openRound.id), eq(lotteryRounds.status, "open")))
          .for("update");

        if (!round) {
          throw new LotteryError("This lottery round just closed. Try again.");
        }

        if (channelId && round.announceChannelId !== channelId) {
          await tx
            .update(lotteryRounds)
            .set({ announceChannelId: channelId })
            .where(eq(lotteryRounds.id, round.id));
        }

        const startNumber = round.ticketCount + 1;
        const ticketRows = Array.from({ length: count }, (_, i) => ({
          roundId: round.id,
          guildId,
          userId,
          ticketNumber: startNumber + i,
        }));

        const tickets = await tx.insert(lotteryTickets).values(ticketRows).returning();

        const [updatedRound] = await tx
          .update(lotteryRounds)
          .set({
            ticketCount: round.ticketCount + count,
            potAmount: round.potAmount + totalCost,
          })
          .where(eq(lotteryRounds.id, round.id))
          .returning();

        return { round: updatedRound!, tickets };
      });

      return { ...result, balance };
    } catch (err) {
      await this.wallet.credit(guildId, userId, totalCost, "lottery_refund", openRound.id, {
        reason: "ticket_purchase_failed",
      });
      throw err;
    }
  }

  async getStatus(guildId: string, userId: string): Promise<LotteryStatus> {
    const round = await this.getOrCreateOpenRound(guildId);

    const [userTickets] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(lotteryTickets)
      .where(and(eq(lotteryTickets.roundId, round.id), eq(lotteryTickets.userId, userId)));

    const [players] = await this.db
      .select({ count: sql<number>`count(distinct ${lotteryTickets.userId})::int` })
      .from(lotteryTickets)
      .where(eq(lotteryTickets.roundId, round.id));

    const [lastCompleted] = await this.db
      .select()
      .from(lotteryRounds)
      .where(and(eq(lotteryRounds.guildId, guildId), eq(lotteryRounds.status, "completed")))
      .orderBy(desc(lotteryRounds.drawnAt))
      .limit(1);

    return {
      round,
      userTicketCount: userTickets?.count ?? 0,
      uniquePlayers: players?.count ?? 0,
      lastCompleted: lastCompleted ?? null,
    };
  }

  async findOverdueOpenRounds(): Promise<LotteryRound[]> {
    return this.db
      .select()
      .from(lotteryRounds)
      .where(
        and(eq(lotteryRounds.status, "open"), lte(lotteryRounds.scheduledDrawAt, new Date())),
      );
  }

  async drawRound(guildId: string): Promise<LotteryDrawResult> {
    const result = await this.db.transaction(async (tx) => {
      const [round] = await tx
        .select()
        .from(lotteryRounds)
        .where(and(eq(lotteryRounds.guildId, guildId), eq(lotteryRounds.status, "open")))
        .for("update");

      if (!round) {
        throw new LotteryError("There is no open lottery round for this server.");
      }

      return this.completeRound(tx, round);
    });

    await this.payDrawWinner(result);
    return result;
  }

  async drawRoundById(roundId: string): Promise<LotteryDrawResult> {
    const result = await this.db.transaction(async (tx) => {
      const [round] = await tx
        .select()
        .from(lotteryRounds)
        .where(and(eq(lotteryRounds.id, roundId), eq(lotteryRounds.status, "open")))
        .for("update");

      if (!round) {
        throw new LotteryError("Lottery round not found or already drawn.");
      }

      return this.completeRound(tx, round);
    });

    await this.payDrawWinner(result);
    return result;
  }

  private async payDrawWinner(result: LotteryDrawResult): Promise<void> {
    if (result.noTickets || !result.winningTicket || result.payout <= 0) return;

    await this.wallet.credit(
      result.round.guildId,
      result.winningTicket.userId,
      result.payout,
      "lottery_win",
      result.round.id,
      {
        winningTicketNumber: result.winningTicket.ticketNumber,
        ticketCount: result.round.ticketCount,
        rake: result.rake,
      },
    );
  }

  private async completeRound(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    round: LotteryRound,
  ): Promise<LotteryDrawResult> {
    if (round.ticketCount === 0) {
      const [completed] = await tx
        .update(lotteryRounds)
        .set({
          status: "completed",
          drawnAt: new Date(),
          payoutAmount: 0,
          rakeAmount: 0,
        })
        .where(eq(lotteryRounds.id, round.id))
        .returning();

      const nextRound = await this.createNextRound(tx, round.guildId, round.roundNumber, round.announceChannelId);

      return {
        round: completed!,
        nextRound,
        winningTicket: null,
        payout: 0,
        rake: 0,
        noTickets: true,
      };
    }

    const winningNumber = pickWinningTicketNumber(round.ticketCount);
    const [winningTicket] = await tx
      .select()
      .from(lotteryTickets)
      .where(
        and(
          eq(lotteryTickets.roundId, round.id),
          eq(lotteryTickets.ticketNumber, winningNumber),
        ),
      )
      .limit(1);

    if (!winningTicket) {
      throw new LotteryError("Failed to resolve winning ticket.");
    }

    const { payout, rake } = calculateLotteryPayout(round.potAmount, this.config.LOTTERY_RAKE_PERCENT);

    const [completed] = await tx
      .update(lotteryRounds)
      .set({
        status: "completed",
        winnerId: winningTicket.userId,
        winningTicketId: winningTicket.id,
        payoutAmount: payout,
        rakeAmount: rake,
        drawnAt: new Date(),
      })
      .where(eq(lotteryRounds.id, round.id))
      .returning();

    const nextRound = await this.createNextRound(tx, round.guildId, round.roundNumber, round.announceChannelId);

    return {
      round: completed!,
      nextRound,
      winningTicket,
      payout,
      rake,
      noTickets: false,
    };
  }

  private async createNextRound(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    guildId: string,
    previousRoundNumber: number,
    announceChannelId: string | null,
  ): Promise<LotteryRound> {
    const [nextRound] = await tx
      .insert(lotteryRounds)
      .values({
        guildId,
        roundNumber: previousRoundNumber + 1,
        ticketPrice: this.config.LOTTERY_TICKET_PRICE,
        scheduledDrawAt: addDays(this.config.LOTTERY_DRAW_INTERVAL_DAYS),
        announceChannelId: announceChannelId ?? undefined,
      })
      .returning();

    return nextRound!;
  }
}

export function createLotteryService(
  db: Database,
  wallet: WalletService,
  config: Config,
): LotteryService {
  return new LotteryService(db, wallet, config);
}

export { InsufficientFundsError };
