import { eq, and, desc, lte } from "drizzle-orm";
import type { Database, DbTransaction } from "../../db/client";
import { blackjackSessions, type BlackjackSession } from "../../db/schema";
import type { Config } from "../../config";
import type { WalletService } from "../wallet";
import { addMinutes, isExpired } from "../../utils/time";
import {
  ActiveCasinoSessionError,
  type ActiveCasinoSessionInfo,
} from "../casino/activeSession";
import {
  createDeck,
  shuffleDeck,
  dealInitial,
  hit,
  playDealer,
  evaluateHand,
  determineOutcome,
  calculatePayout,
  type Card,
  type GameOutcome,
} from "./engine";

function toActiveBlackjackSession(session: BlackjackSession): ActiveCasinoSessionInfo {
  return {
    kind: "blackjack",
    sessionId: session.id,
    label: "Blackjack",
    wager: effectiveBlackjackWager(session),
  };
}

export class BlackjackSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlackjackSessionError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export function effectiveBlackjackWager(session: Pick<BlackjackSession, "wager" | "doubled">): number {
  return session.doubled ? session.wager * 2 : session.wager;
}

export class BlackjackSessionService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async getActiveSession(guildId: string, userId: string): Promise<BlackjackSession | null> {
    const rows = await this.db
      .select()
      .from(blackjackSessions)
      .where(
        and(
          eq(blackjackSessions.guildId, guildId),
          eq(blackjackSessions.userId, userId),
          eq(blackjackSessions.status, "active"),
        ),
      )
      .orderBy(desc(blackjackSessions.createdAt));

    if (rows.length === 0) return null;

    const [newest, ...duplicates] = rows;
    for (const duplicate of duplicates) {
      await this.expireSession(duplicate);
    }

    if (isExpired(newest!.expiresAt)) {
      await this.expireSession(newest!);
      return null;
    }

    return newest!;
  }

  async startSession(
    guildId: string,
    userId: string,
    channelId: string,
    wager: number,
  ): Promise<BlackjackSession> {
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.findActiveSessionForUpdate(tx, guildId, userId);
        if (existing) {
          if (isExpired(existing.expiresAt)) {
            await this.expireSessionInTx(tx, existing);
          } else {
            throw new ActiveCasinoSessionError(toActiveBlackjackSession(existing));
          }
        }

        await this.wallet.debit(guildId, userId, wager, "blackjack_bet", undefined, undefined, tx);

        const deck = shuffleDeck(createDeck());
        const dealt = dealInitial(deck);

        const [session] = await tx
          .insert(blackjackSessions)
          .values({
            guildId,
            userId,
            channelId,
            wager,
            playerCards: dealt.playerCards,
            dealerCards: dealt.dealerCards,
            deck: dealt.deck,
            expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
          })
          .returning();

        const playerValue = evaluateHand(dealt.playerCards);
        const dealerValue = evaluateHand(dealt.dealerCards);

        if (playerValue.isBlackjack || dealerValue.isBlackjack) {
          return this.completeSessionInTx(tx, session!, true);
        }

        return session!;
      });
    } catch (err) {
      if (err instanceof ActiveCasinoSessionError) throw err;
      if (isUniqueViolation(err)) {
        const active = await this.getActiveSession(guildId, userId);
        if (active) {
          throw new ActiveCasinoSessionError(toActiveBlackjackSession(active));
        }
        throw new ActiveCasinoSessionError({
          kind: "blackjack",
          sessionId: "",
          label: "Blackjack",
          wager: 0,
        });
      }
      throw err;
    }
  }

  async setMessageId(sessionId: string, messageId: string): Promise<void> {
    await this.db
      .update(blackjackSessions)
      .set({ messageId })
      .where(eq(blackjackSessions.id, sessionId));
  }

  async getSession(sessionId: string): Promise<BlackjackSession | null> {
    const [session] = await this.db
      .select()
      .from(blackjackSessions)
      .where(eq(blackjackSessions.id, sessionId))
      .limit(1);
    return session ?? null;
  }

  async ensureActive(session: BlackjackSession): Promise<BlackjackSession> {
    const current = await this.getSession(session.id);
    if (!current || current.status !== "active") {
      throw new BlackjackSessionError("This blackjack game is no longer active.");
    }
    if (isExpired(current.expiresAt)) {
      await this.expireSession(current);
      throw new BlackjackSessionError("This blackjack game expired. Your wager was refunded.");
    }
    return current;
  }

  async hitAction(session: BlackjackSession): Promise<{ session: BlackjackSession; finished: boolean }> {
    return this.db.transaction(async (tx) => {
      const active = await this.lockActiveSessionById(tx, session.id);
      const playerCards = active.playerCards as Card[];
      const deck = active.deck as Card[];

      const result = hit(deck, playerCards);
      const playerValue = evaluateHand(result.hand);

      const [updated] = await tx
        .update(blackjackSessions)
        .set({
          playerCards: result.hand,
          deck: result.deck,
          expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
        })
        .where(eq(blackjackSessions.id, active.id))
        .returning();

      if (playerValue.isBust) {
        const completed = await this.completeSessionInTx(tx, updated!, false);
        return { session: completed, finished: true };
      }

      return { session: updated!, finished: false };
    });
  }

  async standAction(session: BlackjackSession): Promise<BlackjackSession> {
    return this.db.transaction(async (tx) => {
      const active = await this.lockActiveSessionById(tx, session.id);
      return this.completeSessionInTx(tx, active, false);
    });
  }

  async doubleAction(session: BlackjackSession): Promise<{ session: BlackjackSession; finished: boolean }> {
    return this.db.transaction(async (tx) => {
      const active = await this.lockActiveSessionById(tx, session.id);
      const playerCards = active.playerCards as Card[];

      if (playerCards.length !== 2) {
        throw new BlackjackSessionError("You can only double down on your first turn.");
      }
      if (active.doubled) {
        throw new BlackjackSessionError("You already doubled down.");
      }

      await this.wallet.debit(
        active.guildId,
        active.userId,
        active.wager,
        "blackjack_bet",
        active.id,
        { action: "double" },
        tx,
      );

      const deck = active.deck as Card[];
      const result = hit(deck, playerCards);

      const [updated] = await tx
        .update(blackjackSessions)
        .set({
          playerCards: result.hand,
          deck: result.deck,
          doubled: true,
          expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
        })
        .where(eq(blackjackSessions.id, active.id))
        .returning();

      const completed = await this.completeSessionInTx(tx, updated!, false);
      return { session: completed, finished: true };
    });
  }

  /** Refund and close an active session. Returns false if already settled. */
  async expireSession(session: BlackjackSession): Promise<boolean> {
    return this.db.transaction(async (tx) => this.expireSessionInTx(tx, session));
  }

  /** Close an active session without refunding the wager. */
  async forfeitSession(session: BlackjackSession): Promise<boolean> {
    return this.db.transaction(async (tx) => this.forfeitSessionInTx(tx, session));
  }

  async reconcileDuplicateActiveSessions(): Promise<number> {
    const rows = await this.db
      .select()
      .from(blackjackSessions)
      .where(eq(blackjackSessions.status, "active"))
      .orderBy(desc(blackjackSessions.createdAt));

    const seen = new Set<string>();
    let refunded = 0;

    for (const session of rows) {
      const key = `${session.guildId}:${session.userId}`;
      if (seen.has(key)) {
        if (await this.expireSession(session)) refunded++;
      } else {
        seen.add(key);
      }
    }

    return refunded;
  }

  async sweepExpiredSessions(limit = 50): Promise<number> {
    const stale = await this.db
      .select()
      .from(blackjackSessions)
      .where(
        and(
          eq(blackjackSessions.status, "active"),
          lte(blackjackSessions.expiresAt, new Date()),
        ),
      )
      .limit(limit);

    let refunded = 0;
    for (const session of stale) {
      if (await this.expireSession(session)) refunded++;
    }
    return refunded;
  }

  getOutcome(session: BlackjackSession): GameOutcome {
    return determineOutcome(session.playerCards as Card[], session.dealerCards as Card[]);
  }

  private async findActiveSessionForUpdate(
    tx: DbTransaction,
    guildId: string,
    userId: string,
  ): Promise<BlackjackSession | null> {
    const [session] = await tx
      .select()
      .from(blackjackSessions)
      .where(
        and(
          eq(blackjackSessions.guildId, guildId),
          eq(blackjackSessions.userId, userId),
          eq(blackjackSessions.status, "active"),
        ),
      )
      .orderBy(desc(blackjackSessions.createdAt))
      .limit(1)
      .for("update");

    return session ?? null;
  }

  private async lockActiveSessionById(
    tx: DbTransaction,
    sessionId: string,
  ): Promise<BlackjackSession> {
    const [session] = await tx
      .select()
      .from(blackjackSessions)
      .where(and(eq(blackjackSessions.id, sessionId), eq(blackjackSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!session) {
      throw new BlackjackSessionError("This blackjack game is no longer active.");
    }

    if (isExpired(session.expiresAt)) {
      await this.expireSessionInTx(tx, session);
      throw new BlackjackSessionError("This blackjack game expired. Your wager was refunded.");
    }

    return session;
  }

  private async expireSessionInTx(tx: DbTransaction, session: BlackjackSession): Promise<boolean> {
    const [locked] = await tx
      .select()
      .from(blackjackSessions)
      .where(and(eq(blackjackSessions.id, session.id), eq(blackjackSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!locked) return false;

    const refund = effectiveBlackjackWager(locked);
    await this.wallet.credit(
      locked.guildId,
      locked.userId,
      refund,
      "blackjack_refund",
      locked.id,
      undefined,
      tx,
    );

    await tx
      .update(blackjackSessions)
      .set({ status: "expired" })
      .where(eq(blackjackSessions.id, locked.id));

    return true;
  }

  private async forfeitSessionInTx(tx: DbTransaction, session: BlackjackSession): Promise<boolean> {
    const [locked] = await tx
      .select()
      .from(blackjackSessions)
      .where(and(eq(blackjackSessions.id, session.id), eq(blackjackSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!locked) return false;

    await tx
      .update(blackjackSessions)
      .set({ status: "expired" })
      .where(eq(blackjackSessions.id, locked.id));

    return true;
  }

  private async completeSessionInTx(
    tx: DbTransaction,
    session: BlackjackSession,
    naturalBlackjack: boolean,
  ): Promise<BlackjackSession> {
    const [locked] = await tx
      .select()
      .from(blackjackSessions)
      .where(and(eq(blackjackSessions.id, session.id), eq(blackjackSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!locked) {
      const [completed] = await tx
        .select()
        .from(blackjackSessions)
        .where(eq(blackjackSessions.id, session.id))
        .limit(1);

      if (completed?.status === "completed") return completed;
      throw new BlackjackSessionError("This blackjack game is no longer active.");
    }

    let playerCards = locked.playerCards as Card[];
    let dealerCards = locked.dealerCards as Card[];
    let deck = locked.deck as Card[];

    if (!naturalBlackjack) {
      const playerValue = evaluateHand(playerCards);
      if (!playerValue.isBust) {
        const dealerResult = playDealer(deck, dealerCards);
        deck = dealerResult.deck;
        dealerCards = dealerResult.dealerCards;
      }
    }

    const outcome = determineOutcome(playerCards, dealerCards);
    const payout = calculatePayout(locked.wager, locked.doubled, outcome);

    if (payout > 0) {
      const type =
        outcome === "push"
          ? "blackjack_push"
          : outcome === "blackjack" || outcome === "win"
            ? "blackjack_win"
            : "blackjack_push";

      await this.wallet.credit(locked.guildId, locked.userId, payout, type, locked.id, { outcome }, tx);
    }

    const [completed] = await tx
      .update(blackjackSessions)
      .set({
        status: "completed",
        playerCards,
        dealerCards,
        deck,
      })
      .where(eq(blackjackSessions.id, locked.id))
      .returning();

    return completed!;
  }
}

export function createBlackjackSessionService(
  db: Database,
  wallet: WalletService,
  config: Config,
): BlackjackSessionService {
  return new BlackjackSessionService(db, wallet, config);
}
