import { eq, and } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { minesSessions, type MinesSession } from "../../../db/schema";
import type { Config } from "../../../config";
import type { WalletService } from "../../wallet";
import { addMinutes, isExpired } from "../../../utils/time";
import {
  generateMinePositions,
  calculateMinesPayout,
  type MinesCount,
} from "./engine";

export class MinesSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MinesSessionError";
  }
}

export class MinesSessionService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async getActiveSession(guildId: string, userId: string): Promise<MinesSession | null> {
    const [session] = await this.db
      .select()
      .from(minesSessions)
      .where(
        and(
          eq(minesSessions.guildId, guildId),
          eq(minesSessions.userId, userId),
          eq(minesSessions.status, "active"),
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

  async getSession(id: string): Promise<MinesSession | null> {
    const [session] = await this.db
      .select()
      .from(minesSessions)
      .where(eq(minesSessions.id, id))
      .limit(1);
    return session ?? null;
  }

  async startSession(
    guildId: string,
    userId: string,
    channelId: string,
    wager: number,
    mineCount: MinesCount,
  ): Promise<MinesSession> {
    const existing = await this.getActiveSession(guildId, userId);
    if (existing) {
      throw new MinesSessionError("You already have an active mines game.");
    }

    await this.wallet.debit(guildId, userId, wager, "mines_bet");

    const [session] = await this.db
      .insert(minesSessions)
      .values({
        guildId,
        userId,
        channelId,
        wager,
        mineCount,
        minePositions: generateMinePositions(mineCount),
        revealed: [],
        expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
      })
      .returning();

    return session!;
  }

  async setMessageId(id: string, messageId: string): Promise<void> {
    await this.db.update(minesSessions).set({ messageId }).where(eq(minesSessions.id, id));
  }

  async ensureActive(session: MinesSession): Promise<MinesSession> {
    if (session.status !== "active") {
      throw new MinesSessionError("This mines game is no longer active.");
    }
    if (isExpired(session.expiresAt)) {
      await this.expireSession(session);
      throw new MinesSessionError("This mines game expired. Your wager was refunded.");
    }
    return session;
  }

  async revealTile(session: MinesSession, tileIndex: number): Promise<MinesSession> {
    const active = await this.ensureActive(session);

    if (active.revealed.includes(tileIndex)) {
      throw new MinesSessionError("That tile is already revealed.");
    }

    const isMine = active.minePositions.includes(tileIndex);

    if (isMine) {
      await this.db
        .update(minesSessions)
        .set({ status: "busted", revealed: [...active.revealed, tileIndex] })
        .where(eq(minesSessions.id, active.id));

      const [updated] = await this.db
        .select()
        .from(minesSessions)
        .where(eq(minesSessions.id, active.id))
        .limit(1);
      return updated!;
    }

    const revealed = [...active.revealed, tileIndex];
    const gemsFound = active.gemsFound + 1;

    const [updated] = await this.db
      .update(minesSessions)
      .set({
        revealed,
        gemsFound,
        expiresAt: addMinutes(this.config.BLACKJACK_SESSION_TIMEOUT_MINUTES),
      })
      .where(eq(minesSessions.id, active.id))
      .returning();

    return updated!;
  }

  async cashOut(session: MinesSession): Promise<{ session: MinesSession; payout: number }> {
    const active = await this.ensureActive(session);

    if (active.gemsFound === 0) {
      throw new MinesSessionError("Reveal at least one gem before cashing out.");
    }

    const payout = calculateMinesPayout(active.wager, active.gemsFound);
    await this.wallet.credit(active.guildId, active.userId, payout, "mines_win", active.id);

    const [updated] = await this.db
      .update(minesSessions)
      .set({ status: "cashed_out" })
      .where(eq(minesSessions.id, active.id))
      .returning();

    return { session: updated!, payout };
  }

  async expireSession(session: MinesSession): Promise<void> {
    await this.wallet.credit(
      session.guildId,
      session.userId,
      session.wager,
      "mines_refund",
      session.id,
    );

    await this.db
      .update(minesSessions)
      .set({ status: "expired" })
      .where(eq(minesSessions.id, session.id));
  }
}

export function createMinesSessionService(
  db: Database,
  wallet: WalletService,
  config: Config,
): MinesSessionService {
  return new MinesSessionService(db, wallet, config);
}
