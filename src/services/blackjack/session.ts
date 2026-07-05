import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client";
import { blackjackSessions, type BlackjackSession } from "../../db/schema";
import type { Config } from "../../config";
import type { WalletService } from "../wallet";
import { addMinutes, isExpired } from "../../utils/time";
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

export class BlackjackSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlackjackSessionError";
  }
}

export class BlackjackSessionService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async getActiveSession(guildId: string, userId: string): Promise<BlackjackSession | null> {
    const [session] = await this.db
      .select()
      .from(blackjackSessions)
      .where(
        and(
          eq(blackjackSessions.guildId, guildId),
          eq(blackjackSessions.userId, userId),
          eq(blackjackSessions.status, "active"),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async startSession(
    guildId: string,
    userId: string,
    channelId: string,
    wager: number,
  ): Promise<BlackjackSession> {
    const existing = await this.getActiveSession(guildId, userId);
    if (existing) {
      throw new BlackjackSessionError("You already have an active blackjack game.");
    }

    await this.wallet.debit(guildId, userId, wager, "blackjack_bet");

    const deck = shuffleDeck(createDeck());
    const dealt = dealInitial(deck);

    const [session] = await this.db
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
      return this.completeSession(session!, true);
    }

    return session!;
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
    if (session.status !== "active") {
      throw new BlackjackSessionError("This blackjack game is no longer active.");
    }
    if (isExpired(session.expiresAt)) {
      await this.expireSession(session);
      throw new BlackjackSessionError("This blackjack game expired. Your wager was refunded.");
    }
    return session;
  }

  async hitAction(session: BlackjackSession): Promise<{ session: BlackjackSession; finished: boolean }> {
    const active = await this.ensureActive(session);
    const playerCards = active.playerCards as Card[];
    const deck = active.deck as Card[];

    const result = hit(deck, playerCards);
    const playerValue = evaluateHand(result.hand);

    const [updated] = await this.db
      .update(blackjackSessions)
      .set({
        playerCards: result.hand,
        deck: result.deck,
        expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
      })
      .where(eq(blackjackSessions.id, active.id))
      .returning();

    if (playerValue.isBust) {
      const completed = await this.completeSession(updated!, false);
      return { session: completed, finished: true };
    }

    return { session: updated!, finished: false };
  }

  async standAction(session: BlackjackSession): Promise<BlackjackSession> {
    const active = await this.ensureActive(session);
    return this.completeSession(active, false);
  }

  async doubleAction(session: BlackjackSession): Promise<{ session: BlackjackSession; finished: boolean }> {
    const active = await this.ensureActive(session);
    const playerCards = active.playerCards as Card[];

    if (playerCards.length !== 2) {
      throw new BlackjackSessionError("You can only double down on your first turn.");
    }
    if (active.doubled) {
      throw new BlackjackSessionError("You already doubled down.");
    }

    await this.wallet.debit(active.guildId, active.userId, active.wager, "blackjack_bet", active.id, {
      action: "double",
    });

    const deck = active.deck as Card[];
    const result = hit(deck, playerCards);

    const [updated] = await this.db
      .update(blackjackSessions)
      .set({
        playerCards: result.hand,
        deck: result.deck,
        doubled: true,
        expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
      })
      .where(eq(blackjackSessions.id, active.id))
      .returning();

    const completed = await this.completeSession(updated!, false);
    return { session: completed, finished: true };
  }

  private async completeSession(
    session: BlackjackSession,
    naturalBlackjack: boolean,
  ): Promise<BlackjackSession> {
    let playerCards = session.playerCards as Card[];
    let dealerCards = session.dealerCards as Card[];
    let deck = session.deck as Card[];

    if (!naturalBlackjack) {
      const playerValue = evaluateHand(playerCards);
      if (!playerValue.isBust) {
        const dealerResult = playDealer(deck, dealerCards);
        deck = dealerResult.deck;
        dealerCards = dealerResult.dealerCards;
      }
    }

    const outcome = determineOutcome(playerCards, dealerCards);
    const payout = calculatePayout(session.wager, session.doubled, outcome);

    if (payout > 0) {
      const type =
        outcome === "push"
          ? "blackjack_push"
          : outcome === "blackjack" || outcome === "win"
            ? "blackjack_win"
            : "blackjack_push";

      await this.wallet.credit(session.guildId, session.userId, payout, type, session.id, {
        outcome,
      });
    }

    const [completed] = await this.db
      .update(blackjackSessions)
      .set({
        status: "completed",
        playerCards,
        dealerCards,
        deck,
      })
      .where(eq(blackjackSessions.id, session.id))
      .returning();

    return completed!;
  }

  async expireSession(session: BlackjackSession): Promise<void> {
    const effectiveWager = session.doubled ? session.wager * 2 : session.wager;
    await this.wallet.credit(
      session.guildId,
      session.userId,
      effectiveWager,
      "blackjack_refund",
      session.id,
    );

    await this.db
      .update(blackjackSessions)
      .set({ status: "expired" })
      .where(eq(blackjackSessions.id, session.id));
  }

  getOutcome(session: BlackjackSession): GameOutcome {
    return determineOutcome(session.playerCards as Card[], session.dealerCards as Card[]);
  }
}

export function createBlackjackSessionService(
  db: Database,
  wallet: WalletService,
  config: Config,
): BlackjackSessionService {
  return new BlackjackSessionService(db, wallet, config);
}
