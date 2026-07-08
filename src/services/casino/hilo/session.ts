import { eq, and } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { hiloSessions, type HiloSession } from "../../../db/schema";
import type { Config } from "../../../config";
import type { WalletService } from "../../wallet";
import { addMinutes, isExpired } from "../../../utils/time";
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
} from "../hilo";

export class HiloSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HiloSessionError";
  }
}

export type HiloGuessResult = {
  session: HiloSession;
  drawnCard: string;
  won: boolean;
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
    const [session] = await this.db
      .select()
      .from(hiloSessions)
      .where(
        and(
          eq(hiloSessions.guildId, guildId),
          eq(hiloSessions.userId, userId),
          eq(hiloSessions.status, "active"),
        ),
      )
      .limit(1);
    if (!session) return null;

    if (isExpired(session.expiresAt)) {
      await this.expireSession(session);
      return null;
    }

    return session;
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
    const existing = await this.getActiveSession(guildId, userId);
    if (existing) {
      throw new HiloSessionError("You already have an active Hi-Lo game.");
    }

    await this.wallet.debit(guildId, userId, wager, "hilo_bet");

    const deck = createHiLoDeck();
    const { currentCard, remainingDeck } = dealHiLoStart(deck);

    const [session] = await this.db
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
  }

  async setMessageId(id: string, messageId: string): Promise<void> {
    await this.db.update(hiloSessions).set({ messageId }).where(eq(hiloSessions.id, id));
  }

  async ensureActive(session: HiloSession): Promise<HiloSession> {
    if (session.status !== "active") {
      throw new HiloSessionError("This Hi-Lo game is no longer active.");
    }
    if (isExpired(session.expiresAt)) {
      await this.expireSession(session);
      throw new HiloSessionError("This Hi-Lo game expired. Your wager was refunded.");
    }
    return session;
  }

  async guess(session: HiloSession, choice: HiLoChoice): Promise<HiloGuessResult> {
    const active = await this.ensureActive(session);

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
    const won = resolveHiLoGuess(currentRank, nextRank, choice);

    if (!won) {
      const [updated] = await this.db
        .update(hiloSessions)
        .set({
          status: "busted",
          remainingDeck,
          potMultiple: getHiLoPotMultiple(active.streak),
        })
        .where(eq(hiloSessions.id, active.id))
        .returning();

      return { session: updated!, drawnCard, won: false, deckCleared: false };
    }

    const streak = active.streak + 1;
    const potMultiple = getHiLoPotMultiple(streak);
    const deckCleared = remainingDeck.length === 0;

    const [updated] = await this.db
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

    return { session: updated!, drawnCard, won: true, deckCleared };
  }

  async cashOut(
    session: HiloSession,
    options: HiloCashOutOptions = {},
  ): Promise<{ session: HiloSession; payout: number }> {
    const active = await this.ensureActive(session);
    const deckClearBonus =
      options.deckClearBonus ??
      (active.remainingDeck.length === 0 && active.streak > 0);
    const potMultiple = getHiLoPotMultiple(active.streak, deckClearBonus);
    const payout = calculateHiLoPayout(active.wager, potMultiple);

    await this.wallet.credit(active.guildId, active.userId, payout, "hilo_win", active.id, {
      potMultiple,
      streak: active.streak,
      deckClearBonus,
    });

    const [updated] = await this.db
      .update(hiloSessions)
      .set({ status: "cashed_out", potMultiple })
      .where(eq(hiloSessions.id, active.id))
      .returning();

    return { session: updated!, payout };
  }

  async expireSession(session: HiloSession): Promise<void> {
    await this.wallet.credit(
      session.guildId,
      session.userId,
      session.wager,
      "hilo_refund",
      session.id,
    );

    await this.db
      .update(hiloSessions)
      .set({ status: "expired" })
      .where(eq(hiloSessions.id, session.id));
  }
}

export function createHiloSessionService(
  db: Database,
  wallet: WalletService,
  config: Config,
): HiloSessionService {
  return new HiloSessionService(db, wallet, config);
}
