import type { Config } from "../config";
import type { WalletService } from "./wallet";
import { calculateDailyPayout, resolveDailyStreak } from "../utils/streak";
import { WEEKLY_COOLDOWN_MS, msUntilNextClaim } from "../utils/time";

export class ClaimCooldownError extends Error {
  constructor(
    message: string,
    public remainingMs: number,
    public streak = 0,
  ) {
    super(message);
    this.name = "ClaimCooldownError";
  }
}

export type DailyClaimResult = {
  amount: number;
  balance: number;
  base: number;
  streakBonus: number;
  streak: number;
  capped: boolean;
  nextDayTotal: number;
};

export class ClaimsService {
  constructor(
    private wallet: WalletService,
    private config: Config,
  ) {}

  async claimDaily(guildId: string, userId: string): Promise<DailyClaimResult> {
    const wallet = await this.wallet.getOrCreateWallet(guildId, userId);
    const streakState = resolveDailyStreak(
      wallet.lastDailyAt,
      wallet.dailyStreak,
    );

    if (!streakState.ready) {
      throw new ClaimCooldownError(
        "Daily reward is on cooldown.",
        streakState.remainingMs,
        streakState.streak,
      );
    }

    const payout = calculateDailyPayout(
      this.config.DAILY_AMOUNT,
      streakState.streak,
      this.config.DAILY_STREAK_BONUS_PER_DAY,
      this.config.DAILY_MAX_PAYOUT,
    );

    const balance = await this.wallet.credit(guildId, userId, payout.total, "daily", undefined, {
      base: payout.base,
      streakBonus: payout.streakBonus,
      streak: streakState.streak,
      capped: payout.capped,
    });
    await this.wallet.updateDailyClaim(guildId, userId, streakState.streak);

    const nextDay = calculateDailyPayout(
      this.config.DAILY_AMOUNT,
      streakState.streak + 1,
      this.config.DAILY_STREAK_BONUS_PER_DAY,
      this.config.DAILY_MAX_PAYOUT,
    );

    return {
      amount: payout.total,
      balance,
      base: payout.base,
      streakBonus: payout.streakBonus,
      streak: streakState.streak,
      capped: payout.capped,
      nextDayTotal: nextDay.total,
    };
  }

  async claimWeekly(guildId: string, userId: string): Promise<{ amount: number; balance: number }> {
    const wallet = await this.wallet.getOrCreateWallet(guildId, userId);
    const remaining = msUntilNextClaim(wallet.lastWeeklyAt, WEEKLY_COOLDOWN_MS);

    if (remaining > 0) {
      throw new ClaimCooldownError("Weekly reward is on cooldown.", remaining);
    }

    const balance = await this.wallet.credit(
      guildId,
      userId,
      this.config.WEEKLY_AMOUNT,
      "weekly",
    );
    await this.wallet.updateClaimTimestamp(guildId, userId, "lastWeeklyAt");

    return { amount: this.config.WEEKLY_AMOUNT, balance };
  }

  getDailyRemaining(wallet: { lastDailyAt: Date | null; dailyStreak: number }): number {
    const state = resolveDailyStreak(wallet.lastDailyAt, wallet.dailyStreak);
    return state.ready ? 0 : state.remainingMs;
  }

  getWeeklyRemaining(wallet: { lastWeeklyAt: Date | null }): number {
    return msUntilNextClaim(wallet.lastWeeklyAt, WEEKLY_COOLDOWN_MS);
  }
}

export function formatDailyClaimDescription(
  result: DailyClaimResult,
  config: Config,
  formatCurrency: (amount: number, config: Config) => string,
): string {
  const lines = [
    `Base: **${formatCurrency(result.base, config)}**`,
    `Streak (${result.streak} day${result.streak === 1 ? "" : "s"}): **+${formatCurrency(result.streakBonus, config)}**${
      result.capped ? " *(max reached)*" : ""
    }`,
    `**Total: ${formatCurrency(result.amount, config)}**`,
    "",
    result.capped
      ? `You are at the daily cap of **${formatCurrency(config.DAILY_MAX_PAYOUT, config)}**. Keep your **${result.streak}-day** streak alive for the max payout each day.`
      : `Come back tomorrow for **${formatCurrency(result.nextDayTotal, config)}** if you keep your streak going.`,
    `New balance: **${formatCurrency(result.balance, config)}**.`,
  ];
  return lines.join("\n");
}

export function createClaimsService(wallet: WalletService, config: Config): ClaimsService {
  return new ClaimsService(wallet, config);
}
