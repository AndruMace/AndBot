export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function msUntilUtcMidnight(from = new Date()): number {
  const midnight = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1),
  );
  return Math.max(0, midnight.getTime() - from.getTime());
}

export type DailyStreakState =
  | { ready: true; streak: number }
  | { ready: false; remainingMs: number; streak: number };

export function resolveDailyStreak(
  lastDailyAt: Date | null,
  currentStreak: number,
  now = new Date(),
): DailyStreakState {
  if (!lastDailyAt) {
    return { ready: true, streak: 1 };
  }

  const today = utcDayKey(now);
  const last = utcDayKey(lastDailyAt);

  if (last === today) {
    return { ready: false, remainingMs: msUntilUtcMidnight(now), streak: currentStreak };
  }

  const yesterday = utcDayKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
  );

  if (last === yesterday && currentStreak > 0) {
    return { ready: true, streak: currentStreak + 1 };
  }

  return { ready: true, streak: 1 };
}

export function calculateDailyPayout(
  base: number,
  streak: number,
  bonusPerDay: number,
  maxPayout: number,
): { total: number; base: number; streakBonus: number; capped: boolean } {
  const rawBonus = bonusPerDay * streak;
  const rawTotal = base + rawBonus;
  const total = Math.min(maxPayout, rawTotal);
  const streakBonus = total - base;
  return { total, base, streakBonus, capped: rawTotal >= maxPayout };
}
