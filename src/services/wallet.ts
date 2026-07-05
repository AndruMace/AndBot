import { eq, and } from "drizzle-orm";
import type { Database } from "../db/client";
import { wallets, transactions, type TransactionType } from "../db/schema";
import type { Config } from "../config";

export class InsufficientFundsError extends Error {
  constructor(message = "Insufficient funds.") {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

export class WalletService {
  constructor(
    private db: Database,
    private config: Config,
  ) {}

  async getOrCreateWallet(guildId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
        .for("update");

      if (existing[0]) return existing[0];

      const [created] = await tx
        .insert(wallets)
        .values({
          guildId,
          userId,
          balance: this.config.STARTING_BALANCE,
        })
        .returning();

      if (this.config.STARTING_BALANCE > 0) {
        await tx.insert(transactions).values({
          guildId,
          userId,
          amount: this.config.STARTING_BALANCE,
          type: "admin_give",
          metadata: { reason: "starting_balance" },
        });
      }

      return created;
    });
  }

  async getBalance(guildId: string, userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(guildId, userId);
    return wallet.balance;
  }

  async credit(
    guildId: string,
    userId: string,
    amount: number,
    type: TransactionType,
    referenceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<number> {
    if (amount <= 0) throw new Error("Credit amount must be positive.");

    return this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      const newBalance = wallet.balance + amount;

      await tx
        .update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        guildId,
        userId,
        amount,
        type,
        referenceId,
        metadata,
      });

      return newBalance;
    });
  }

  async debit(
    guildId: string,
    userId: string,
    amount: number,
    type: TransactionType,
    referenceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<number> {
    if (amount <= 0) throw new Error("Debit amount must be positive.");

    return this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      if (wallet.balance < amount) {
        throw new InsufficientFundsError();
      }

      const newBalance = wallet.balance - amount;

      await tx
        .update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        guildId,
        userId,
        amount: -amount,
        type,
        referenceId,
        metadata,
      });

      return newBalance;
    });
  }

  async transfer(guildId: string, fromId: string, toId: string, amount: number): Promise<void> {
    if (fromId === toId) throw new Error("Cannot transfer to yourself.");
    if (amount <= 0) throw new Error("Transfer amount must be positive.");

    await this.db.transaction(async (tx) => {
      const fromWallet = await this.lockWallet(tx, guildId, fromId);
      await this.lockWallet(tx, guildId, toId);

      if (fromWallet.balance < amount) {
        throw new InsufficientFundsError();
      }

      const fromBalance = fromWallet.balance - amount;
      const toWallet = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, toId)))
        .for("update");
      const toBalance = (toWallet[0]?.balance ?? 0) + amount;

      await tx
        .update(wallets)
        .set({ balance: fromBalance, updatedAt: new Date() })
        .where(eq(wallets.id, fromWallet.id));

      await tx
        .update(wallets)
        .set({ balance: toBalance, updatedAt: new Date() })
        .where(
          and(eq(wallets.guildId, guildId), eq(wallets.userId, toId)),
        );

      await tx.insert(transactions).values([
        {
          guildId,
          userId: fromId,
          amount: -amount,
          type: "pay_sent",
          referenceId: toId,
        },
        {
          guildId,
          userId: toId,
          amount,
          type: "pay_received",
          referenceId: fromId,
        },
      ]);
    });
  }

  async escrow(guildId: string, userId: string, amount: number, referenceId: string): Promise<void> {
    await this.debit(guildId, userId, amount, "pvp_escrow", referenceId);
  }

  async refundEscrow(guildId: string, userId: string, amount: number, referenceId: string): Promise<void> {
    await this.credit(guildId, userId, amount, "pvp_refund", referenceId);
  }

  async payoutWinner(
    guildId: string,
    winnerId: string,
    amount: number,
    referenceId: string,
  ): Promise<number> {
    return this.credit(guildId, winnerId, amount, "pvp_payout", referenceId);
  }

  async updateDailyClaim(guildId: string, userId: string, streak: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      await tx
        .update(wallets)
        .set({
          lastDailyAt: new Date(),
          dailyStreak: streak,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id));
    });
  }

  async tryMessageReward(
    guildId: string,
    userId: string,
    amount: number,
    cooldownMs: number,
    messageId: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      const now = Date.now();

      if (
        wallet.lastMessageRewardAt &&
        now - wallet.lastMessageRewardAt.getTime() < cooldownMs
      ) {
        return false;
      }

      const newBalance = wallet.balance + amount;

      await tx
        .update(wallets)
        .set({
          balance: newBalance,
          lastMessageRewardAt: new Date(now),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        guildId,
        userId,
        amount,
        type: "activity_message",
        referenceId: messageId,
      });

      return true;
    });
  }

  async updateClaimTimestamp(
    guildId: string,
    userId: string,
    field: "lastDailyAt" | "lastWeeklyAt",
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      await tx
        .update(wallets)
        .set({ [field]: new Date(), updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));
    });
  }

  async setLastWager(guildId: string, userId: string, amount: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const wallet = await this.lockWallet(tx, guildId, userId);
      await tx
        .update(wallets)
        .set({ lastWager: amount, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));
    });
  }

  private async lockWallet(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    guildId: string,
    userId: string,
  ) {
    let [wallet] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .for("update");

    if (!wallet) {
      [wallet] = await tx
        .insert(wallets)
        .values({
          guildId,
          userId,
          balance: this.config.STARTING_BALANCE,
        })
        .returning();

      if (this.config.STARTING_BALANCE > 0) {
        await tx.insert(transactions).values({
          guildId,
          userId,
          amount: this.config.STARTING_BALANCE,
          type: "admin_give",
          metadata: { reason: "starting_balance" },
        });
      }
    }

    return wallet;
  }
}

export function createWalletService(db: Database, config: Config): WalletService {
  return new WalletService(db, config);
}
