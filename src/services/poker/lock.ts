/** One in-flight mutation per poker table. */
export class PokerLockService {
  private held = new Set<string>();

  async run<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
    if (this.held.has(tableId)) {
      throw new Error("Table is busy. Try again in a moment.");
    }
    this.held.add(tableId);
    try {
      return await fn();
    } finally {
      this.held.delete(tableId);
    }
  }
}

export const pokerLock = new PokerLockService();
