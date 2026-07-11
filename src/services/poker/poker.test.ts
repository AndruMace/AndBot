import { describe, expect, test } from "bun:test";
import { compareHands, evaluateBestHand } from "./handRank";
import { calculatePots, splitPot, aggregateWinnersBySeat } from "./pots";
import {
  applyAction,
  getLegalActions,
  nextDealerSeat,
  startHand,
} from "./betting";
import { isBotUserId } from "./bots";
import { parseTableBuyIn, pokerTableStakes, parseBotCount } from "./config";
import type { SeatSnapshot, TableSnapshot } from "./types";

function makeTable(seats: Partial<SeatSnapshot>[]): TableSnapshot {
  const fullSeats: SeatSnapshot[] = Array.from({ length: 6 }, (_, i) => ({
    seatIndex: i,
    userId: null,
    stack: 0,
    status: "empty",
    holeCards: [],
    ...seats[i],
  }));

  return {
    id: "test-table",
    guildId: "g1",
    channelId: "c1",
    hostUserId: "u1",
    visibility: "public",
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 200,
    maxBuyIn: 2000,
    status: "waiting",
    handNumber: 0,
    handState: null,
    seats: fullSeats,
  };
}

describe("handRank", () => {
  test("pair beats high card", () => {
    const pair = evaluateBestHand(["AH", "AD", "7C", "4S", "2H"]);
    const high = evaluateBestHand(["KH", "QD", "JC", "9S", "7H"]);
    expect(compareHands(pair, high)).toBeGreaterThan(0);
  });

  test("flush beats straight", () => {
    const flush = evaluateBestHand(["AH", "KH", "9H", "5H", "2H"]);
    const straight = evaluateBestHand(["6H", "5D", "4C", "3S", "2H"]);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  test("wheel straight is recognized", () => {
    const wheel = evaluateBestHand(["AH", "2D", "3C", "4S", "5H"]);
    expect(wheel.category).toBe("straight");
    expect(wheel.scores[1]).toBe(5);
  });

  test("evaluates best hand from seven cards", () => {
    const hand = evaluateBestHand(["AH", "KH", "QH", "JH", "10H", "2D", "3C"]);
    expect(hand.category).toBe("straight_flush");
  });

  test("split tie on same full house", () => {
    const a = evaluateBestHand(["AH", "AD", "AC", "KS", "KH"]);
    const b = evaluateBestHand(["AS", "AH", "AD", "KC", "KD"]);
    expect(compareHands(a, b)).toBe(0);
  });
});

describe("pots", () => {
  test("single main pot", () => {
    const pots = calculatePots([
      { seatIndex: 0, totalCommitted: 100, folded: false },
      { seatIndex: 1, totalCommitted: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 200, eligibleSeatIndices: [0, 1] }]);
  });

  test("side pot when one player is all-in for less", () => {
    const pots = calculatePots([
      { seatIndex: 0, totalCommitted: 50, folded: false },
      { seatIndex: 1, totalCommitted: 100, folded: false },
      { seatIndex: 2, totalCommitted: 100, folded: true },
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 150, eligibleSeatIndices: [0, 1] });
    expect(pots[1]).toEqual({ amount: 100, eligibleSeatIndices: [1] });
  });

  test("splitPot distributes remainder to low seat", () => {
    const payouts = splitPot(101, [2, 5]);
    expect(payouts.get(2)).toBe(51);
    expect(payouts.get(5)).toBe(50);
  });

  test("aggregateWinnersBySeat merges multiple pots for one player", () => {
    const merged = aggregateWinnersBySeat([
      { seatIndex: 0, amount: 40, handLabel: "Three of a Kind (2s)" },
      { seatIndex: 0, amount: 180, handLabel: "Three of a Kind (2s)" },
      { seatIndex: 2, amount: 50, handLabel: "Pair" },
    ]);
    expect(merged).toEqual([
      { seatIndex: 0, amount: 220, handLabel: "Three of a Kind (2s)" },
      { seatIndex: 2, amount: 50, handLabel: "Pair" },
    ]);
  });
});

describe("poker config", () => {
  const config = {
    MIN_BET: 1,
    MAX_BET: 100_000,
  } as import("../../config").Config;

  test("stakes scale from host buy-in", () => {
    const stakes = pokerTableStakes(1000, config);
    expect(stakes.minBuyIn).toBeLessThan(1000);
    expect(stakes.maxBuyIn).toBeGreaterThan(1000);
    expect(stakes.bigBlind).toBeGreaterThanOrEqual(stakes.smallBlind);
    expect(stakes.bigBlind).toBeLessThanOrEqual(100);
  });

  test("parseTableBuyIn accepts any amount in table range", () => {
    expect(parseTableBuyIn("850", 800, 1200, config)).toBe(850);
    expect(() => parseTableBuyIn("700", 800, 1200, config)).toThrow();
  });

  test("parseBotCount accepts 0 through table max", () => {
    expect(parseBotCount(undefined, 6)).toBe(0);
    expect(parseBotCount("0", 6)).toBe(0);
    expect(parseBotCount("3", 6)).toBe(3);
    expect(parseBotCount("5", 6)).toBe(5);
    expect(() => parseBotCount("6", 6)).toThrow();
    expect(() => parseBotCount("-1", 6)).toThrow();
  });
});

describe("poker bots", () => {
  test("bot user ids are detectable", () => {
    expect(isBotUserId("bot:abc:2")).toBe(true);
    expect(isBotUserId("123456")).toBe(false);
  });
});

describe("betting", () => {
  test("startHand posts blinds and deals hole cards", () => {
    const table = makeTable([
      { userId: "u1", stack: 1000, status: "seated" },
      { userId: "u2", stack: 1000, status: "seated" },
    ]);
    const started = startHand(table, 0);
    expect(started.status).toBe("playing");
    expect(started.handState?.street).toBe("preflop");
    expect(started.seats[0]!.holeCards).toHaveLength(2);
    expect(started.seats[1]!.holeCards).toHaveLength(2);
    const totalBlinds =
      (started.handState?.playerBets[0]?.totalCommitted ?? 0) +
      (started.handState?.playerBets[1]?.totalCommitted ?? 0);
    expect(totalBlinds).toBe(30);
  });

  test("fold ends hand and awards pot", () => {
    let table = makeTable([
      { userId: "u1", stack: 1000, status: "seated" },
      { userId: "u2", stack: 1000, status: "seated" },
    ]);
    table = startHand(table, 0);
    const actor = table.handState!.actionSeat!;
    table = applyAction(table, actor, "fold");
    expect(table.handState?.street).toBe("complete");
    const winner = table.seats.find((s) => s.stack > 1000);
    expect(winner).toBeDefined();
  });

  test("legal actions include call when facing a bet", () => {
    let table = makeTable([
      { userId: "u1", stack: 1000, status: "seated" },
      { userId: "u2", stack: 1000, status: "seated" },
    ]);
    table = startHand(table, 0);
    const actor = table.handState!.actionSeat!;
    const legal = getLegalActions(table, actor);
    expect(legal?.canCall).toBe(true);
    expect(legal?.callAmount).toBeGreaterThan(0);
  });

  test("rotates dealer seat", () => {
    const table = makeTable([
      { userId: "u1", stack: 1000, status: "seated" },
      { userId: "u2", stack: 1000, status: "seated" },
      { userId: "u3", stack: 1000, status: "seated" },
    ]);
    const withHand = { ...table, handState: { dealerSeat: 0 } as TableSnapshot["handState"] };
    expect(nextDealerSeat(withHand as TableSnapshot)).toBe(1);
  });
});
