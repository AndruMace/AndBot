import { eq, and, desc, lte } from "drizzle-orm";
import type { Database, DbTransaction } from "../../../db/client";
import { hiloSessions, type HiloSession } from "../../../db/schema";
import type { Config } from "../../../config";
import type { WalletService } from "../../wallet";
import { InsufficientFundsError } from "../../wallet";
import { addMinutes, isExpired } from "../../../utils/time";
import {
  ActiveCasinoSessionError,
  type ActiveCasinoSessionInfo,
} from "../activeSession";
import {
  canGuess,
  calculateHiLoPayout,
  cardRankValue,
  choiceHasWinningOutcomes,
  createHiLoDeck,
  dealHiLoStart,
  getHiLoPotMultiple,
  resolveHiLoGuess,
  type HiLoChoice,
  type HiLoGuessOutcome,
} from "../hilo";

function toActiveHiloSession(session: HiloSession): ActiveCasinoSessionInfo {
  return {
    kind: "hilo",
    sessionId: session.id,
    label: "Hi-Lo",
    wager: session.wager,
  };
}

export class HiloSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiloSessionError";
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

export type HiloGuessResult = {
  session: HiloSession;
  drawnCard: string;
  outcome: HiLoGuessOutcome;
  deckCleared: boolean;
};

export type HiloCashOutOptions = {
  deckClearBonus?: boolean;
};

export class HiloSessionService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async getActiveSession(guildId: string, userId: string): Promise<HiloSession | null> {
    const rows = await this.db
      .select()
      .from(hiloSessions)
      .where(
        and(
          eq(hiloSessions.guildId, guildId),
          eq(hiloSessions.userId, userId),
          eq(hiloSessions.status, "active"),
        ),
      )
      .orderBy(desc(hiloSessions.createdAt));

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

  async getSession(id: string): Promise<HiloSession | null> {
    const [session] = await this.db
      .select()
      .from(hiloSessions)
      .where(eq(hiloSessions.id, id))
      .limit(1);
    return session ?? null;
  }

  async startSession(
    guildId: string,
    userId: string,
    channelId: string,
    wager: number,
  ): Promise<HiloSession> {
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.findActiveSessionForUpdate(tx, guildId, userId);
        if (existing) {
          if (isExpired(existing.expiresAt)) {
            await this.expireSessionInTx(tx, existing);
          } else {
            throw new ActiveCasinoSessionError(toActiveHiloSession(existing));
          }
        }

        await this.wallet.debit(guildId, userId, wager, "hilo_bet", undefined, undefined, tx);

        const deck = createHiLoDeck();
        const { currentCard, remainingDeck } = dealHiLoStart(deck);

        const [session] = await tx
          .insert(hiloSessions)
          .values({
            guildId,
            userId,
            channelId,
            wager,
            currentCard,
            remainingDeck,
            potMultiple: getHiLoPotMultiple(0),
            expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
          })
          .returning();

        return session!;
      });
    } catch (err) {
      if (err instanceof HiloSessionError || err instanceof InsufficientFundsError) {
        throw err;
      }
      if (err instanceof ActiveCasinoSessionError) throw err;
      if (isUniqueViolation(err)) {
        const active = await this.getActiveSession(guildId, userId);
        if (active) {
          throw new ActiveCasinoSessionError(toActiveHiloSession(active));
        }
        throw new ActiveCasinoSessionError({
          kind: "hilo",
          sessionId: "",
          label: "Hi-Lo",
          wager: 0,
        });
      }
      throw err;
    }
  }

  async setMessageId(id: string, messageId: string): Promise<void> {
    await this.db.update(hiloSessions).set({ messageId }).where(eq(hiloSessions.id, id));
  }

  async ensureActive(session: HiloSession): Promise<HiloSession> {
    const current = await this.getSession(session.id);
    if (!current || current.status !== "active") {
      throw new HiloSessionError("This Hi-Lo game is no longer active.");
    }
    if (isExpired(current.expiresAt)) {
      await this.expireSession(current);
      throw new HiloSessionError("This Hi-Lo game expired. Your wager was refunded.");
    }
    return current;
  }

  async guess(session: HiloSession, choice: HiLoChoice): Promise<HiloGuessResult> {
    return this.db.transaction(async (tx) => {
      const active = await this.lockActiveSessionById(tx, session.id);

      if (!canGuess(active.remainingDeck.length)) {
        throw new HiloSessionError("No cards left — cash out to collect your winnings.");
      }

      const currentRank = cardRankValue(active.currentCard);
      if (!choiceHasWinningOutcomes(active.remainingDeck, currentRank, choice)) {
        throw new HiloSessionError("That guess has no winning outcomes left.");
      }

      const [drawnCard, ...remainingDeck] = active.remainingDeck;
      if (!drawnCard) {
        throw new HiloSessionError("No cards left in the deck.");
      }

      const nextRank = cardRankValue(drawnCard);
      const outcome = resolveHiLoGuess(currentRank, nextRank, choice);

      if (outcome === "loss") {
        const [updated] = await tx
          .update(hiloSessions)
          .set({
            status: "busted",
            remainingDeck,
            potMultiple: getHiLoPotMultiple(active.streak),
          })
          .where(eq(hiloSessions.id, active.id))
          .returning();

        return { session: updated!, drawnCard, outcome, deckCleared: false };
      }

      if (outcome === "tie") {
        const [updated] = await tx
          .update(hiloSessions)
          .set({
            currentCard: drawnCard,
            remainingDeck,
            expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
          })
          .where(eq(hiloSessions.id, active.id))
          .returning();

        return { session: updated!, drawnCard, outcome, deckCleared: false };
      }

      const streak = active.streak + 1;
      const potMultiple = getHiLoPotMultiple(streak);
      const deckCleared = remainingDeck.length === 0;

      const [updated] = await tx
        .update(hiloSessions)
        .set({
          currentCard: drawnCard,
          remainingDeck,
          potMultiple,
          streak,
          expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
        })
        .where(eq(hiloSessions.id, active.id))
        .returning();

      return { session: updated!, drawnCard, outcome: "win", deckCleared };
    });
  }

  async cashOut(
    session: HiloSession,
    options: HiloCashOutOptions = {},
  ): Promise<{ session: HiloSession; payout: number }> {
    return this.db.transaction(async (tx) => {
      const active = await this.lockActiveSessionById(tx, session.id);
      const deckClearBonus =
        options.deckClearBonus ??
        (active.remainingDeck.length === 0 && active.streak > 0);
      const potMultiple = getHiLoPotMultiple(active.streak, deckClearBonus);
      const payout = calculateHiLoPayout(active.wager, potMultiple);

      await this.wallet.credit(active.guildId, active.userId, payout, "hilo_win", active.id, {
        potMultiple,
        streak: active.streak,
        deckClearBonus,
      }, tx);

      const [updated] = await tx
        .update(hiloSessions)
        .set({ status: "cashed_out", potMultiple })
        .where(eq(hiloSessions.id, active.id))
        .returning();

      return { session: updated!, payout };
    });
  }

  async expireSession(session: HiloSession): Promise<boolean> {
    return this.db.transaction(async (tx) => this.expireSessionInTx(tx, session));
  }

  async forfeitSession(session: HiloSession): Promise<boolean> {
    return this.db.transaction(async (tx) => this.forfeitSessionInTx(tx, session));
  }

  async reconcileDuplicateActiveSessions(): Promise<number> {
    const rows = await this.db
      .select()
      .from(hiloSessions)
      .where(eq(hiloSessions.status, "active"))
      .orderBy(desc(hiloSessions.createdAt));

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
      .from(hiloSessions)
      .where(
        and(
          eq(hiloSessions.status, "active"),
          lte(hiloSessions.expiresAt, new Date()),
        ),
      )
      .limit(limit);

    let refunded = 0;
    for (const session of stale) {
      if (await this.expireSession(session)) refunded++;
    }
    return refunded;
  }

  private async findActiveSessionForUpdate(
    tx: DbTransaction,
    guildId: string,
    userId: string,
  ): Promise<HiloSession | null> {
    const [session] = await tx
      .select()
      .from(hiloSessions)
      .where(
        and(
          eq(hiloSessions.guildId, guildId),
          eq(hiloSessions.userId, userId),
          eq(hiloSessions.status, "active"),
        ),
      )
      .orderBy(desc(hiloSessions.createdAt))
      .limit(1)
      .for("update");

    return session ?? null;
  }

  private async lockActiveSessionById(
    tx: DbTransaction,
    sessionId: string,
  ): Promise<HiloSession> {
    const [session] = await tx
      .select()
      .from(hiloSessions)
      .where(and(eq(hiloSessions.id, sessionId), eq(hiloSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!session) {
      throw new HiloSessionError("This Hi-Lo game is no longer active.");
    }

    if (isExpired(session.expiresAt)) {
      await this.expireSessionInTx(tx, session);
      throw new HiloSessionError("This Hi-Lo game expired. Your wager was refunded.");
    }

    return session;
  }

  private async expireSessionInTx(tx: DbTransaction, session: HiloSession): Promise<boolean> {
    const [locked] = await tx
      .select()
      .from(hiloSessions)
      .where(and(eq(hiloSessions.id, session.id), eq(hiloSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!locked) return false;

    await this.wallet.credit(
      locked.guildId,
      locked.userId,
      locked.wager,
      "hilo_refund",
      locked.id,
      undefined,
      tx,
    );

    await tx
      .update(hiloSessions)
      .set({ status: "expired" })
      .where(eq(hiloSessions.id, locked.id));

    return true;
  }

  private async forfeitSessionInTx(tx: DbTransaction, session: HiloSession): Promise<boolean> {
    const [locked] = await tx
      .select()
      .from(hiloSessions)
      .where(and(eq(hiloSessions.id, session.id), eq(hiloSessions.status, "active")))
      .for("update")
      .limit(1);

    if (!locked) return false;

    await tx
      .update(hiloSessions)
      .set({ status: "busted" })
      .where(eq(hiloSessions.id, locked.id));

    return true;
  }
}

export function createHiloSessionService(
  db: Database,
  wallet: WalletService,
  config: Config,
): HiloSessionService {
  return new HiloSessionService(db, wallet, config);
}
