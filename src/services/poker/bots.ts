import { getLegalActions } from "./betting";
import type { PokerAction, TableSnapshot } from "./types";

const BOT_PREFIX = "bot:";

const BOT_DISPLAY_NAMES = [
  "Chip",
  "River",
  "Bluff",
  "Ace",
  "Kitty",
  "Hazel",
  "Raiser",
  "Slick",
  "Tank",
  "Nova",
];

export function isBotUserId(userId: string | null | undefined): boolean {
  return !!userId && userId.startsWith(BOT_PREFIX);
}

export function makeBotUserId(tableId: string, seatIndex: number): string {
  return `${BOT_PREFIX}${tableId}:${seatIndex}`;
}

export function botDisplayName(userId: string): string {
  if (!isBotUserId(userId)) return userId;
  const parts = userId.split(":");
  const seatIndex = Number.parseInt(parts[parts.length - 1] ?? "0", 10);
  return BOT_DISPLAY_NAMES[seatIndex % BOT_DISPLAY_NAMES.length] ?? "Bot";
}

export function formatPokerActor(userId: string): string {
  if (isBotUserId(userId)) return `🤖 **${botDisplayName(userId)}**`;
  return `<@${userId}>`;
}

export type BotDecision = {
  action: PokerAction;
  raiseTo?: number;
};

/** Simple bot: mostly check/call small bets, fold to pressure, occasional min-raise. */
export function chooseBotAction(snapshot: TableSnapshot, seatIndex: number): BotDecision {
  const legal = getLegalActions(snapshot, seatIndex);
  if (!legal) return { action: "fold" };

  const facing = legal.callAmount;
  const pressure = facing > snapshot.bigBlind * 4;

  if (legal.canCheck) {
    if (legal.canRaise && Math.random() < 0.08) {
      return { action: "raise", raiseTo: legal.minRaiseTo };
    }
    return { action: "check" };
  }

  if (legal.canCall && !pressure) {
    return { action: "call" };
  }

  if (legal.canCall && Math.random() < 0.35) {
    return { action: "call" };
  }

  if (legal.canAllIn && Math.random() < 0.04) {
    const stack = snapshot.seats[seatIndex]?.stack ?? 0;
    if (facing >= stack * 0.5) return { action: "all_in" };
  }

  return { action: "fold" };
}
