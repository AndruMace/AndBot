export class CasinoBusyError extends Error {
  constructor(message = "You already have a game in progress. Wait for it to finish.") {
    super(message);
    this.name = "CasinoBusyError";
  }
}

/** One in-flight casino action per user per guild (reject overlaps, do not queue). */
export class CasinoLockService {
  private held = new Set<string>();

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  isHeld(guildId: string, userId: string): boolean {
    return this.held.has(this.key(guildId, userId));
  }

  async run<T>(guildId: string, userId: string, fn: () => Promise<T>): Promise<T> {
    const key = this.key(guildId, userId);
    if (this.held.has(key)) {
      throw new CasinoBusyError();
    }
    this.held.add(key);
    try {
      return await fn();
    } finally {
      this.held.delete(key);
    }
  }
}

export const casinoLock = new CasinoLockService();

export async function disableButtonComponents(
  interaction: { isButton(): boolean; deferred: boolean; replied: boolean; update: (opts: { components: [] }) => Promise<unknown> },
): Promise<void> {
  if (!interaction.isButton() || interaction.deferred || interaction.replied) return;
  await interaction.update({ components: [] });
}
