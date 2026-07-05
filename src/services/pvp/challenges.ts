import { eq, and, or } from "drizzle-orm";
import type { Database } from "../../db/client";
import { pvpChallenges, type PvpChallenge } from "../../db/schema";
import type { Config } from "../../config";
import type { WalletService } from "../wallet";
import { addMinutes, isExpired } from "../../utils/time";

export class PvpChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PvpChallengeError";
  }
}

export class PvpChallengeService {
  constructor(
    private db: Database,
    private wallet: WalletService,
    private config: Config,
  ) {}

  async createChallenge(
    guildId: string,
    channelId: string,
    challengerId: string,
    opponentId: string,
    gameType: "rps" | "dice",
    wager: number,
  ): Promise<PvpChallenge> {
    if (challengerId === opponentId) {
      throw new PvpChallengeError("You cannot challenge yourself.");
    }

    const existing = await this.db
      .select()
      .from(pvpChallenges)
      .where(
        and(
          eq(pvpChallenges.guildId, guildId),
          eq(pvpChallenges.status, "pending"),
          or(
            and(
              eq(pvpChallenges.challengerId, challengerId),
              eq(pvpChallenges.opponentId, opponentId),
              eq(pvpChallenges.gameType, gameType),
            ),
            and(
              eq(pvpChallenges.challengerId, opponentId),
              eq(pvpChallenges.opponentId, challengerId),
              eq(pvpChallenges.gameType, gameType),
            ),
          ),
        ),
      )
      .limit(1);

    if (existing[0]) {
      throw new PvpChallengeError("A pending challenge already exists between these players.");
    }

    const balance = await this.wallet.getBalance(guildId, challengerId);
    if (balance < wager) {
      throw new PvpChallengeError("You don't have enough funds for this wager.");
    }

    const [challenge] = await this.db
      .insert(pvpChallenges)
      .values({
        guildId,
        channelId,
        challengerId,
        opponentId,
        gameType,
        wager,
        expiresAt: addMinutes(this.config.CHALLENGE_EXPIRY_MINUTES),
      })
      .returning();

    await this.wallet.escrow(guildId, challengerId, wager, challenge!.id);

    return challenge!;
  }

  async getChallenge(id: string): Promise<PvpChallenge | null> {
    const [challenge] = await this.db
      .select()
      .from(pvpChallenges)
      .where(eq(pvpChallenges.id, id))
      .limit(1);
    return challenge ?? null;
  }

  async setMessageId(id: string, messageId: string): Promise<void> {
    await this.db.update(pvpChallenges).set({ messageId }).where(eq(pvpChallenges.id, id));
  }

  async ensurePending(challenge: PvpChallenge): Promise<PvpChallenge> {
    if (challenge.status !== "pending") {
      throw new PvpChallengeError("This challenge is no longer pending.");
    }
    if (isExpired(challenge.expiresAt)) {
      await this.expireChallenge(challenge);
      throw new PvpChallengeError("This challenge has expired.");
    }
    return challenge;
  }

  async acceptChallenge(challenge: PvpChallenge, userId: string): Promise<PvpChallenge> {
    const pending = await this.ensurePending(challenge);

    if (userId !== pending.opponentId) {
      throw new PvpChallengeError("Only the challenged player can accept.");
    }

    const balance = await this.wallet.getBalance(pending.guildId, pending.opponentId);
    if (balance < pending.wager) {
      throw new PvpChallengeError("You don't have enough funds to accept this challenge.");
    }

    await this.wallet.escrow(pending.guildId, pending.opponentId, pending.wager, pending.id);

    const [updated] = await this.db
      .update(pvpChallenges)
      .set({ status: "active" })
      .where(eq(pvpChallenges.id, pending.id))
      .returning();

    return updated!;
  }

  async declineChallenge(challenge: PvpChallenge, userId: string): Promise<void> {
    const pending = await this.ensurePending(challenge);

    if (userId !== pending.opponentId) {
      throw new PvpChallengeError("Only the challenged player can decline.");
    }

    await this.wallet.refundEscrow(pending.guildId, pending.challengerId, pending.wager, pending.id);

    await this.db
      .update(pvpChallenges)
      .set({ status: "declined" })
      .where(eq(pvpChallenges.id, pending.id));
  }

  async expireChallenge(challenge: PvpChallenge): Promise<void> {
    if (challenge.status === "pending") {
      await this.wallet.refundEscrow(
        challenge.guildId,
        challenge.challengerId,
        challenge.wager,
        challenge.id,
      );
    }

    await this.db
      .update(pvpChallenges)
      .set({ status: "expired" })
      .where(eq(pvpChallenges.id, challenge.id));
  }

  async refundBoth(challenge: PvpChallenge): Promise<void> {
    await this.wallet.refundEscrow(
      challenge.guildId,
      challenge.challengerId,
      challenge.wager,
      challenge.id,
    );
    await this.wallet.refundEscrow(
      challenge.guildId,
      challenge.opponentId,
      challenge.wager,
      challenge.id,
    );
  }

  async completeChallenge(
    challenge: PvpChallenge,
    winnerId: string | null,
  ): Promise<PvpChallenge> {
    if (winnerId) {
      await this.wallet.payoutWinner(
        challenge.guildId,
        winnerId,
        challenge.wager * 2,
        challenge.id,
      );
    } else {
      await this.refundBoth(challenge);
    }

    const [updated] = await this.db
      .update(pvpChallenges)
      .set({ status: "completed", winnerId: winnerId ?? undefined })
      .where(eq(pvpChallenges.id, challenge.id))
      .returning();

    return updated!;
  }

  async updateChallenge(id: string, data: Partial<PvpChallenge>): Promise<PvpChallenge> {
    const [updated] = await this.db
      .update(pvpChallenges)
      .set(data)
      .where(eq(pvpChallenges.id, id))
      .returning();
    return updated!;
  }
}

export function createPvpChallengeService(
  db: Database,
  wallet: WalletService,
  config: Config,
): PvpChallengeService {
  return new PvpChallengeService(db, wallet, config);
}

export type RpsChoice = "rock" | "paper" | "scissors";

const RPS_BEATS: Record<RpsChoice, RpsChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

export function determineRpsWinner(
  challengerChoice: RpsChoice,
  opponentChoice: RpsChoice,
): "challenger" | "opponent" | "tie" {
  if (challengerChoice === opponentChoice) return "tie";
  if (RPS_BEATS[challengerChoice] === opponentChoice) return "challenger";
  return "opponent";
}

export function rollDice(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0]! % 6) + 1;
}

export function determineDiceWinner(
  challengerRoll: number,
  opponentRoll: number,
): "challenger" | "opponent" | "tie" {
  if (challengerRoll === opponentRoll) return "tie";
  return challengerRoll > opponentRoll ? "challenger" : "opponent";
}
