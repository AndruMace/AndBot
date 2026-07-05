import { describe, expect, test } from "bun:test";
import {
  determineCoinflipWinner,
  determineDiceWinner,
  determineRpsWinner,
  sumDice,
} from "./engine";
import { buildRoundOutcome } from "./match";
import type { PvpChallenge } from "../../db/schema";

function baseChallenge(overrides: Partial<PvpChallenge> = {}): PvpChallenge {
  return {
    id: "c1",
    guildId: "g1",
    channelId: "ch1",
    messageId: null,
    challengerId: "u1",
    opponentId: "u2",
    gameType: "dice",
    matchFormat: "single",
    wager: 100,
    status: "active",
    roundNumber: 1,
    challengerScore: 0,
    opponentScore: 0,
    challengerChoice: null,
    opponentChoice: null,
    challengerRoll: null,
    opponentRoll: null,
    metadata: null,
    winnerId: null,
    expiresAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("pvp engine", () => {
  test("determineDiceWinner compares totals", () => {
    expect(determineDiceWinner(9, 7)).toBe("challenger");
    expect(determineDiceWinner(4, 8)).toBe("opponent");
    expect(determineDiceWinner(7, 7)).toBe("tie");
  });

  test("sumDice adds both dice", () => {
    expect(sumDice([3, 4])).toBe(7);
  });

  test("determineCoinflipWinner resolves side match", () => {
    expect(determineCoinflipWinner("heads", "heads")).toBe("challenger");
    expect(determineCoinflipWinner("heads", "tails")).toBe("opponent");
  });

  test("determineRpsWinner resolves classic rules", () => {
    expect(determineRpsWinner("rock", "scissors")).toBe("challenger");
    expect(determineRpsWinner("rock", "paper")).toBe("opponent");
    expect(determineRpsWinner("rock", "rock")).toBe("tie");
  });
});

describe("pvp match format", () => {
  test("single game tie refunds", () => {
    const plan = buildRoundOutcome(baseChallenge(), "tie");
    expect(plan.kind).toBe("match_complete");
    if (plan.kind === "match_complete") {
      expect(plan.winnerId).toBeNull();
    }
  });

  test("single game win pays out winner", () => {
    const plan = buildRoundOutcome(baseChallenge(), "challenger");
    expect(plan.kind).toBe("match_complete");
    if (plan.kind === "match_complete") {
      expect(plan.winnerId).toBe("u1");
    }
  });

  test("best of 3 continues after first win", () => {
    const plan = buildRoundOutcome(
      baseChallenge({ matchFormat: "best_of_3" }),
      "challenger",
    );
    expect(plan.kind).toBe("next_round");
    if (plan.kind === "next_round") {
      expect(plan.updates.challengerScore).toBe(1);
      expect(plan.updates.opponentScore).toBe(0);
      expect(plan.updates.roundNumber).toBe(2);
    }
  });

  test("best of 3 tie replays round", () => {
    const plan = buildRoundOutcome(
      baseChallenge({ matchFormat: "best_of_3" }),
      "tie",
    );
    expect(plan.kind).toBe("tie_replay");
  });

  test("best of 3 ends at two wins", () => {
    const plan = buildRoundOutcome(
      baseChallenge({
        matchFormat: "best_of_3",
        challengerScore: 1,
        roundNumber: 2,
      }),
      "challenger",
    );
    expect(plan.kind).toBe("match_complete");
    if (plan.kind === "match_complete") {
      expect(plan.winnerId).toBe("u1");
      expect(plan.updates.challengerScore).toBe(2);
    }
  });
});
