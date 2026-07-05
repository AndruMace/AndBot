import type { RoundWinner } from "./engine";
import type { PvpChallenge, PvpMatchFormat } from "../../db/schema";
import { initRoulette } from "./engine";

export type RoundOutcomePlan =
  | { kind: "match_complete"; winnerId: string | null; updates: Partial<PvpChallenge> }
  | { kind: "next_round"; updates: Partial<PvpChallenge> }
  | { kind: "tie_replay"; updates: Partial<PvpChallenge> };

export function winsNeeded(format: PvpMatchFormat): number {
  return format === "best_of_3" ? 2 : 1;
}

export function formatMatchLabel(format: PvpMatchFormat): string {
  return format === "best_of_3" ? "Best 2 of 3" : "Single game";
}

export function scoreLine(challenge: PvpChallenge): string {
  return `Score: <@${challenge.challengerId}> **${challenge.challengerScore}** — **${challenge.opponentScore}** <@${challenge.opponentId}>`;
}

function roundResetData(
  challenge: PvpChallenge,
  overrides: Partial<PvpChallenge> = {},
): Partial<PvpChallenge> {
  const metadata =
    challenge.gameType === "russian_roulette"
      ? { roulette: initRoulette(challenge.challengerId) }
      : null;

  return {
    challengerChoice:
      challenge.gameType === "coinflip_duel" ? challenge.challengerChoice : null,
    opponentChoice: null,
    challengerRoll: null,
    opponentRoll: null,
    metadata,
    ...overrides,
  };
}

export function buildRoundOutcome(
  challenge: PvpChallenge,
  roundResult: RoundWinner,
): RoundOutcomePlan {
  if (roundResult === "tie") {
    if (challenge.matchFormat === "single") {
      return {
        kind: "match_complete",
        winnerId: null,
        updates: {},
      };
    }

    return {
      kind: "tie_replay",
      updates: roundResetData(challenge),
    };
  }

  const challengerWon = roundResult === "challenger";
  const challengerScore = challenge.challengerScore + (challengerWon ? 1 : 0);
  const opponentScore = challenge.opponentScore + (challengerWon ? 0 : 1);
  const needed = winsNeeded(challenge.matchFormat);

  if (challenge.matchFormat === "single") {
    return {
      kind: "match_complete",
      winnerId: challengerWon ? challenge.challengerId : challenge.opponentId,
      updates: {},
    };
  }

  if (challengerScore >= needed || opponentScore >= needed) {
    return {
      kind: "match_complete",
      winnerId: challengerWon ? challenge.challengerId : challenge.opponentId,
      updates: { challengerScore, opponentScore },
    };
  }

  return {
    kind: "next_round",
    updates: roundResetData(challenge, {
      challengerScore,
      opponentScore,
      roundNumber: challenge.roundNumber + 1,
    }),
  };
}
