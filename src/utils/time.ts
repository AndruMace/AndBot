export function formatDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function msUntilNextClaim(lastClaimAt: Date | null, cooldownMs: number): number {
  if (!lastClaimAt) return 0;
  const elapsed = Date.now() - lastClaimAt.getTime();
  return Math.max(0, cooldownMs - elapsed);
}

export function isExpired(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime();
}

export function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
