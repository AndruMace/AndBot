import type { CasinoGame } from "../../commands/casino/types";
import { getCasinoGameLabel } from "../../commands/casino/types";
import type { CasinoReplayOptions } from "../../commands/casino/replay";
import { parseCasinoAgainButtonId } from "../../commands/casino/replay";
import { isCasinoGame } from "../../commands/casino/types";
import type { MinesCount } from "./mines/engine";
import type { BlackjackSessionService } from "../blackjack/session";
import type { HiloSessionService } from "./hilo/session";
import type { MinesSessionService } from "./mines/session";
import type { PokerTableService } from "../poker/table";

export type ActiveCasinoSessionKind = "blackjack" | "hilo" | "mines" | "poker";

export type ActiveCasinoSessionInfo = {
  kind: ActiveCasinoSessionKind;
  sessionId: string;
  label: string;
  wager: number;
};

export type PendingCasinoStart =
  | { kind: "wager"; game: CasinoGame; amount: number }
  | { kind: "mines"; amount: number; minesCount: MinesCount }
  | { kind: "lucky"; amount: number; pick: number }
  | { kind: "keno"; amount: number; picks: number[] }
  | { kind: "blackjack"; amount: number; publishMode: "channel" | "interaction" }
  | { kind: "replay"; replay: CasinoReplayOptions };

export class ActiveCasinoSessionError extends Error {
  readonly name = "ActiveCasinoSessionError";

  constructor(
    public readonly active: ActiveCasinoSessionInfo,
    public readonly pending?: PendingCasinoStart,
  ) {
    const pendingLabel =
      pending && "game" in pending
        ? getCasinoGameLabel(pending.game)
        : pending?.kind === "blackjack"
          ? "Blackjack"
          : pending?.kind === "replay"
            ? getCasinoGameLabel(pending.replay.game)
            : pending?.kind === "mines"
              ? "Mines"
              : pending?.kind === "lucky"
                ? "Lucky #"
                : pending?.kind === "keno"
                  ? "Keno"
                  : undefined;

    super(
      pendingLabel
        ? `You already have an active ${active.label} game.`
        : `You already have an active ${active.label} game.`,
    );
  }
}

const KIND_CODE: Record<ActiveCasinoSessionKind, string> = {
  blackjack: "bj",
  hilo: "hi",
  mines: "mn",
  poker: "pk",
};

const CODE_KIND: Record<string, ActiveCasinoSessionKind> = {
  bj: "blackjack",
  hi: "hilo",
  mn: "mines",
  pk: "poker",
};

export function activeSessionKindCode(kind: ActiveCasinoSessionKind): string {
  return KIND_CODE[kind];
}

export function parseActiveSessionKindCode(code: string): ActiveCasinoSessionKind | null {
  return CODE_KIND[code] ?? null;
}

export function encodePendingStart(pending: PendingCasinoStart): string {
  switch (pending.kind) {
    case "wager":
      return `w.${pending.game}.${pending.amount}`;
    case "mines":
      return `m.${pending.amount}.${pending.minesCount}`;
    case "lucky":
      return `l.${pending.amount}.${pending.pick}`;
    case "keno":
      return `k.${pending.amount}.${pending.picks.join("-")}`;
    case "blackjack":
      return pending.publishMode === "channel" ? `bc.${pending.amount}` : `b.${pending.amount}`;
    case "replay": {
      const r = pending.replay;
      const parts = [r.game, String(r.amount)];
      if (r.coinflipSide) parts.push(r.coinflipSide);
      else if (r.luckyPick != null) parts.push(String(r.luckyPick));
      else if (r.kenoPicks?.length) parts.push(r.kenoPicks.join("-"));
      else if (r.minesCount != null) parts.push(String(r.minesCount));
      else if (r.rouletteBet) parts.push(r.rouletteBet);
      return `r.${parts.join(".")}`;
    }
  }
}

export function decodePendingStart(encoded: string): PendingCasinoStart | null {
  const dot = encoded.indexOf(".");
  if (dot < 0) return null;
  const kind = encoded.slice(0, dot);
  const rest = encoded.slice(dot + 1);

  if (kind === "w") {
    const secondDot = rest.indexOf(".");
    if (secondDot < 0) return null;
    const game = rest.slice(0, secondDot);
    const amountStr = rest.slice(secondDot + 1);
    if (!isCasinoGame(game)) return null;
    const amount = Number.parseInt(amountStr, 10);
    if (Number.isNaN(amount)) return null;
    return { kind: "wager", game, amount };
  }

  if (kind === "m") {
    const secondDot = rest.indexOf(".");
    if (secondDot < 0) return null;
    const amount = Number.parseInt(rest.slice(0, secondDot), 10);
    const minesCount = Number.parseInt(rest.slice(secondDot + 1), 10) as MinesCount;
    if (Number.isNaN(amount) || ![3, 5, 8].includes(minesCount)) return null;
    return { kind: "mines", amount, minesCount };
  }

  if (kind === "l") {
    const secondDot = rest.indexOf(".");
    if (secondDot < 0) return null;
    const amount = Number.parseInt(rest.slice(0, secondDot), 10);
    const pick = Number.parseInt(rest.slice(secondDot + 1), 10);
    if (Number.isNaN(amount) || Number.isNaN(pick)) return null;
    return { kind: "lucky", amount, pick };
  }

  if (kind === "k") {
    const secondDot = rest.indexOf(".");
    if (secondDot < 0) return null;
    const amount = Number.parseInt(rest.slice(0, secondDot), 10);
    const picksStr = rest.slice(secondDot + 1);
    if (Number.isNaN(amount) || !picksStr) return null;
    const picks = picksStr.split("-").map((n) => Number.parseInt(n, 10));
    if (picks.some(Number.isNaN)) return null;
    return { kind: "keno", amount, picks };
  }

  if (kind === "b" || kind === "bc") {
    const amount = Number.parseInt(rest, 10);
    if (Number.isNaN(amount)) return null;
    return {
      kind: "blackjack",
      amount,
      publishMode: kind === "bc" ? "channel" : "interaction",
    };
  }

  if (kind === "r") {
    const replay = parseCasinoAgainButtonId(rest.split("."));
    if (!replay) return null;
    return { kind: "replay", replay };
  }

  return null;
}

export async function findActiveCasinoSession(
  guildId: string,
  userId: string,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
  poker?: PokerTableService,
): Promise<ActiveCasinoSessionInfo | null> {
  const [bj, hi, mn, pk] = await Promise.all([
    blackjack.getActiveSession(guildId, userId),
    hilo.getActiveSession(guildId, userId),
    mines.getActiveSession(guildId, userId),
    poker?.getActiveSeatForUser(guildId, userId) ?? Promise.resolve(null),
  ]);

  if (bj) {
    return {
      kind: "blackjack",
      sessionId: bj.id,
      label: "Blackjack",
      wager: bj.doubled ? bj.wager * 2 : bj.wager,
    };
  }
  if (hi) {
    return {
      kind: "hilo",
      sessionId: hi.id,
      label: "Hi-Lo",
      wager: hi.wager,
    };
  }
  if (mn) {
    return {
      kind: "mines",
      sessionId: mn.id,
      label: "Mines",
      wager: mn.wager,
    };
  }
  if (pk) {
    return {
      kind: "poker",
      sessionId: pk.tableId,
      label: "Poker",
      wager: pk.stack,
    };
  }
  return null;
}

export async function assertNoActiveCasinoSession(
  guildId: string,
  userId: string,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
  pending?: PendingCasinoStart,
  poker?: PokerTableService,
): Promise<void> {
  const active = await findActiveCasinoSession(guildId, userId, blackjack, hilo, mines, poker);
  if (active) {
    throw new ActiveCasinoSessionError(active, pending);
  }
}

export async function forfeitCasinoSession(
  kind: ActiveCasinoSessionKind,
  sessionId: string,
  blackjack: BlackjackSessionService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
): Promise<boolean> {
  switch (kind) {
    case "poker":
      return false;
    case "blackjack": {
      const session = await blackjack.getSession(sessionId);
      if (!session) return false;
      return blackjack.forfeitSession(session);
    }
    case "hilo": {
      const session = await hilo.getSession(sessionId);
      if (!session) return false;
      return hilo.forfeitSession(session);
    }
    case "mines": {
      const session = await mines.getSession(sessionId);
      if (!session) return false;
      return mines.forfeitSession(session);
    }
  }
}
