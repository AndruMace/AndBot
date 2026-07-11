import { eq, and, inArray, lte } from "drizzle-orm";
import type { Database, DbTransaction } from "../../db/client";
import {
  pokerSeats,
  pokerTables,
  type PokerSeat,
  type PokerTable,
} from "../../db/schema";
import type { Config } from "../../config";
import type { WalletService } from "../wallet";
import { addMinutes, addSeconds, isExpired } from "../../utils/time";
import {
  applyAction,
  nextDealerSeat,
  seatedPlayers,
  startHand as engineStartHand,
} from "./betting";
import { pokerTableStakes } from "./config";
import { isBotUserId, makeBotUserId } from "./bots";
import { validateBetAmount } from "../../utils/bets";
import { toTableSnapshot } from "./snapshot";
import type { HandState, PokerAction, PokerTableVisibility, TableSnapshot } from "./types";

export class PokerTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokerTableError";
  }
}

export type CreateTableOptions = {
  visibility: PokerTableVisibility;
  buyIn: number;
  maxSeats?: number;
  botCount?: number;
};

export class PokerTableService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async createTable(
    guildId: string,
    channelId: string,
    hostUserId: string,
    options: CreateTableOptions,
  ): Promise<{ table: PokerTable; seats: PokerSeat[] }> {
    const maxSeats = Math.min(
      Math.max(options.maxSeats ?? this.config.POKER_MAX_PLAYERS, this.config.POKER_MIN_PLAYERS),
      this.config.POKER_MAX_PLAYERS,
    );
    validateBetAmount(options.buyIn, this.config);

    const existing = await this.getActiveSeatForUser(guildId, hostUserId);
    if (existing) {
      throw new PokerTableError("You are already seated at a poker table.");
    }

    const { smallBlind, bigBlind, minBuyIn, maxBuyIn } = pokerTableStakes(options.buyIn, this.config);

    return this.db.transaction(async (tx) => {
      const [table] = await tx
        .insert(pokerTables)
        .values({
          guildId,
          channelId,
          hostUserId,
          visibility: options.visibility,
          maxSeats,
          smallBlind,
          bigBlind,
          minBuyIn,
          maxBuyIn,
          expiresAt: addMinutes(this.config.POKER_TABLE_EXPIRY_MINUTES),
        })
        .returning();

      const seatRows = Array.from({ length: maxSeats }, (_, seatIndex) => ({
        tableId: table!.id,
        seatIndex,
        status: "empty" as const,
      }));
      const seats = await tx.insert(pokerSeats).values(seatRows).returning();

      await this.wallet.debit(guildId, hostUserId, options.buyIn, "poker_buyin", table!.id, undefined, tx);
      const hostSeat = seats[0]!;
      await tx
        .update(pokerSeats)
        .set({
          userId: hostUserId,
          stack: options.buyIn,
          status: "seated",
        })
        .where(eq(pokerSeats.id, hostSeat.id));

      const botCount = Math.min(
        Math.max(0, options.botCount ?? 0),
        maxSeats - 1,
      );
      if (botCount > 0) {
        const botSeats = seats.filter((s) => s.id !== hostSeat.id).slice(0, botCount);
        for (const seat of botSeats) {
          await tx
            .update(pokerSeats)
            .set({
              userId: makeBotUserId(table!.id, seat.seatIndex),
              stack: options.buyIn,
              status: "seated",
              holeCards: [],
            })
            .where(eq(pokerSeats.id, seat.id));
        }
      }

      const refreshed = await this.loadTable(tx, table!.id);
      return refreshed;
    });
  }

  async getTable(tableId: string): Promise<{ table: PokerTable; seats: PokerSeat[] } | null> {
    return this.loadTable(this.db, tableId);
  }

  async getSnapshot(tableId: string): Promise<TableSnapshot | null> {
    const loaded = await this.getTable(tableId);
    if (!loaded) return null;
    return toTableSnapshot(loaded.table, loaded.seats);
  }

  async listPublicTables(guildId: string): Promise<PokerTable[]> {
    return this.db
      .select()
      .from(pokerTables)
      .where(
        and(
          eq(pokerTables.guildId, guildId),
          eq(pokerTables.visibility, "public"),
          inArray(pokerTables.status, ["waiting", "playing"]),
        ),
      )
      .orderBy(pokerTables.createdAt);
  }

  async setMessageId(tableId: string, messageId: string): Promise<void> {
    await this.db.update(pokerTables).set({ messageId }).where(eq(pokerTables.id, tableId));
  }

  async joinTable(tableId: string, userId: string, buyIn: number): Promise<TableSnapshot> {
    return this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      const snapshot = toTableSnapshot(loaded.table, loaded.seats);

      if (snapshot.status === "closed") throw new PokerTableError("Table is closed.");
      if (snapshot.handState && snapshot.handState.street !== "complete") {
        throw new PokerTableError("Cannot join during an active hand.");
      }
      if (buyIn < snapshot.minBuyIn || buyIn > snapshot.maxBuyIn) {
        throw new PokerTableError(`Buy-in must be between ${snapshot.minBuyIn} and ${snapshot.maxBuyIn}.`);
      }

      const existingSeat = snapshot.seats.find((s) => s.userId === userId);
      if (existingSeat) throw new PokerTableError("You are already seated at this table.");

      const activeElsewhere = await this.getActiveSeatForUser(snapshot.guildId, userId, tx);
      if (activeElsewhere && activeElsewhere.tableId !== tableId) {
        throw new PokerTableError("You are already seated at another poker table.");
      }

      const openSeat =
        loaded.seats.find((s) => !s.userId) ??
        loaded.seats.find((s) => s.userId && isBotUserId(s.userId));
      if (!openSeat) throw new PokerTableError("Table is full.");

      await this.wallet.debit(snapshot.guildId, userId, buyIn, "poker_buyin", tableId, undefined, tx);
      await tx
        .update(pokerSeats)
        .set({ userId, stack: buyIn, status: "seated", holeCards: [] })
        .where(eq(pokerSeats.id, openSeat.id));

      const refreshed = await this.loadTable(tx, tableId);
      return toTableSnapshot(refreshed.table, refreshed.seats);
    });
  }

  async leaveTable(tableId: string, userId: string): Promise<TableSnapshot> {
    return this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      const seat = loaded.seats.find((s) => s.userId === userId);
      if (!seat) throw new PokerTableError("You are not seated at this table.");

      if (
        loaded.table.status === "playing" &&
        loaded.table.handState &&
        (loaded.table.handState as HandState).street !== "complete"
      ) {
        throw new PokerTableError("Cannot leave during an active hand. Fold or wait for the hand to end.");
      }

      if (seat.stack > 0 && !isBotUserId(seat.userId)) {
        await this.wallet.credit(
          loaded.table.guildId,
          userId,
          seat.stack,
          "poker_cashout",
          tableId,
          undefined,
          tx,
        );
      }

      await tx
        .update(pokerSeats)
        .set({ userId: null, stack: 0, status: "empty", holeCards: [] })
        .where(eq(pokerSeats.id, seat.id));

      const remaining = loaded.seats.filter(
        (s) => s.userId && s.id !== seat.id && !isBotUserId(s.userId),
      );
      if (remaining.length === 0) {
        await tx.update(pokerTables).set({ status: "closed" }).where(eq(pokerTables.id, tableId));
      }

      const refreshed = await this.loadTable(tx, tableId);
      return toTableSnapshot(refreshed.table, refreshed.seats);
    });
  }

  async startHand(tableId: string, userId: string): Promise<TableSnapshot> {
    return this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      let snapshot = toTableSnapshot(loaded.table, loaded.seats);

      if (snapshot.hostUserId !== userId) {
        throw new PokerTableError("Only the host can start a hand.");
      }
      if (snapshot.handState && snapshot.handState.street !== "complete") {
        throw new PokerTableError("A hand is already in progress.");
      }

      const players = seatedPlayers(snapshot.seats).filter((s) => s.stack > 0);
      if (players.length < this.config.POKER_MIN_PLAYERS) {
        throw new PokerTableError(`Need at least ${this.config.POKER_MIN_PLAYERS} players with chips.`);
      }

      const dealerSeat = snapshot.handState?.dealerSeat ?? 0;
      snapshot = engineStartHand(snapshot, dealerSeat);
      snapshot.handState!.actionDeadlineAt = addSeconds(
        this.config.POKER_ACTION_TIMEOUT_SECONDS,
      ).toISOString();

      await this.persistSnapshot(tx, snapshot);
      return snapshot;
    });
  }

  async act(
    tableId: string,
    userId: string,
    action: PokerAction,
    raiseTo?: number,
  ): Promise<TableSnapshot> {
    return this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      let snapshot = toTableSnapshot(loaded.table, loaded.seats);
      const seat = snapshot.seats.find((s) => s.userId === userId);
      if (!seat) throw new PokerTableError("You are not seated at this table.");

      snapshot = applyAction(snapshot, seat.seatIndex, action, raiseTo);

      if (snapshot.handState?.street === "complete") {
        snapshot.handState.dealerSeat = nextDealerSeat(snapshot);
      } else if (snapshot.handState) {
        snapshot.handState.actionDeadlineAt = addSeconds(
          this.config.POKER_ACTION_TIMEOUT_SECONDS,
        ).toISOString();
      }

      await this.persistSnapshot(tx, snapshot);
      return snapshot;
    });
  }

  async beginNextHand(tableId: string, userId: string): Promise<TableSnapshot> {
    return this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      let snapshot = toTableSnapshot(loaded.table, loaded.seats);

      if (snapshot.hostUserId !== userId) {
        throw new PokerTableError("Only the host can deal the next hand.");
      }
      if (!snapshot.handState || snapshot.handState.street !== "complete") {
        throw new PokerTableError("Current hand is not finished.");
      }

      const players = seatedPlayers(snapshot.seats).filter((s) => s.stack > 0);
      if (players.length < this.config.POKER_MIN_PLAYERS) {
        snapshot.status = "waiting";
        snapshot.handState = null;
        await this.persistSnapshot(tx, snapshot);
        return snapshot;
      }

      const dealerSeat = snapshot.handState.dealerSeat;
      snapshot = engineStartHand(snapshot, dealerSeat);
      snapshot.handState!.actionDeadlineAt = addSeconds(
        this.config.POKER_ACTION_TIMEOUT_SECONDS,
      ).toISOString();

      await this.persistSnapshot(tx, snapshot);
      return snapshot;
    });
  }

  async getActiveSeatForUser(
    guildId: string,
    userId: string,
    tx: Database | DbTransaction = this.db,
  ): Promise<PokerSeat | null> {
    const rows = await tx
      .select({ seat: pokerSeats })
      .from(pokerSeats)
      .innerJoin(pokerTables, eq(pokerSeats.tableId, pokerTables.id))
      .where(
        and(
          eq(pokerTables.guildId, guildId),
          eq(pokerSeats.userId, userId),
          inArray(pokerSeats.status, ["seated", "folded", "all_in"]),
          inArray(pokerTables.status, ["waiting", "playing"]),
        ),
      )
      .limit(1);

    return rows[0]?.seat ?? null;
  }

  async sweepExpiredTables(limit = 20): Promise<number> {
    const stale = await this.db
      .select()
      .from(pokerTables)
      .where(
        and(
          inArray(pokerTables.status, ["waiting", "playing"]),
          lte(pokerTables.expiresAt, new Date()),
        ),
      )
      .limit(limit);

    let closed = 0;
    for (const table of stale) {
      try {
        await this.closeTable(table.id);
        closed++;
      } catch {
        // ignore
      }
    }
    return closed;
  }

  async sweepActionTimeouts(limit = 20): Promise<string[]> {
    const tables = await this.db
      .select()
      .from(pokerTables)
      .where(eq(pokerTables.status, "playing"))
      .limit(limit);

    const actedTableIds: string[] = [];
    for (const table of tables) {
      const hand = table.handState as HandState | null;
      if (!hand?.actionDeadlineAt || !hand.actionSeat) continue;
      if (!isExpired(new Date(hand.actionDeadlineAt))) continue;

      const seat = await this.db
        .select()
        .from(pokerSeats)
        .where(and(eq(pokerSeats.tableId, table.id), eq(pokerSeats.seatIndex, hand.actionSeat)))
        .limit(1);

      const actor = seat[0]?.userId;
      if (!actor) continue;

      try {
        await this.act(table.id, actor, "fold");
        actedTableIds.push(table.id);
      } catch {
        // ignore
      }
    }
    return actedTableIds;
  }

  async closeTable(tableId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const loaded = await this.lockTable(tx, tableId);
      for (const seat of loaded.seats) {
        if (seat.userId && seat.stack > 0 && !isBotUserId(seat.userId)) {
          await this.wallet.credit(
            loaded.table.guildId,
            seat.userId,
            seat.stack,
            "poker_cashout",
            tableId,
            { reason: "table_closed" },
            tx,
          );
          await tx
            .update(pokerSeats)
            .set({ userId: null, stack: 0, status: "empty", holeCards: [] })
            .where(eq(pokerSeats.id, seat.id));
        }
      }
      await tx.update(pokerTables).set({ status: "closed" }).where(eq(pokerTables.id, tableId));
    });
  }

  private async persistSnapshot(tx: DbTransaction, snapshot: TableSnapshot): Promise<void> {
    await tx
      .update(pokerTables)
      .set({
        status: snapshot.status,
        handNumber: snapshot.handNumber,
        handState: snapshot.handState,
        expiresAt: addMinutes(this.config.POKER_TABLE_EXPIRY_MINUTES),
      })
      .where(eq(pokerTables.id, snapshot.id));

    for (const seat of snapshot.seats) {
      await tx
        .update(pokerSeats)
        .set({
          userId: seat.userId,
          stack: seat.stack,
          status: seat.status,
          holeCards: seat.holeCards,
        })
        .where(and(eq(pokerSeats.tableId, snapshot.id), eq(pokerSeats.seatIndex, seat.seatIndex)));
    }
  }

  private async loadTable(
    db: Database | DbTransaction,
    tableId: string,
  ): Promise<{ table: PokerTable; seats: PokerSeat[] }> {
    const [table] = await db.select().from(pokerTables).where(eq(pokerTables.id, tableId)).limit(1);
    if (!table) throw new PokerTableError("Table not found.");
    const seats = await db
      .select()
      .from(pokerSeats)
      .where(eq(pokerSeats.tableId, tableId))
      .orderBy(pokerSeats.seatIndex);
    return { table, seats };
  }

  private async lockTable(
    tx: DbTransaction,
    tableId: string,
  ): Promise<{ table: PokerTable; seats: PokerSeat[] }> {
    const [table] = await tx
      .select()
      .from(pokerTables)
      .where(eq(pokerTables.id, tableId))
      .for("update")
      .limit(1);
    if (!table) throw new PokerTableError("Table not found.");

    const seats = await tx
      .select()
      .from(pokerSeats)
      .where(eq(pokerSeats.tableId, tableId))
      .for("update")
      .orderBy(pokerSeats.seatIndex);

    return { table, seats };
  }
}

export function createPokerTableService(
  db: Database,
  wallet: WalletService,
  config: Config,
): PokerTableService {
  return new PokerTableService(db, wallet, config);
}
