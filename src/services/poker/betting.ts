import type { Card } from "../blackjack/engine";
import { burnCard, createDeck, dealCards, shuffleDeck } from "./engine";
import { compareHands, evaluateBestHand } from "./handRank";
import { calculatePots, splitPot, aggregateWinnersBySeat } from "./pots";
import type {
  HandState,
  LegalActions,
  PlayerBetState,
  PokerAction,
  PokerStreet,
  SeatSnapshot,
  TableSnapshot,
} from "./types";

export function seatedPlayers(seats: SeatSnapshot[]): SeatSnapshot[] {
  return seats.filter((s) => s.userId && s.status !== "empty" && s.status !== "sitting_out");
}

export function activeInHand(seats: SeatSnapshot[]): SeatSnapshot[] {
  return seats.filter((s) => s.userId && (s.status === "seated" || s.status === "all_in"));
}

export function playersStillBetting(seats: SeatSnapshot[]): SeatSnapshot[] {
  return seats.filter((s) => s.userId && s.status === "seated");
}

export function nextSeatIndex(current: number, seatCount: number): number {
  return (current + 1) % seatCount;
}

export function findNextOccupiedSeat(
  seats: SeatSnapshot[],
  fromSeat: number,
  predicate: (s: SeatSnapshot) => boolean,
): number | null {
  const count = seats.length;
  for (let i = 1; i <= count; i++) {
    const idx = nextSeatIndex(fromSeat + i - 1, count);
    const seat = seats[idx];
    if (seat && predicate(seat)) return idx;
  }
  return null;
}

function getPlayerBet(hand: HandState, seatIndex: number): PlayerBetState {
  const existing = hand.playerBets.find((p) => p.seatIndex === seatIndex);
  if (existing) return existing;
  const created = { seatIndex, betThisStreet: 0, totalCommitted: 0, hasActedThisStreet: false };
  hand.playerBets.push(created);
  return created;
}

export function getLegalActions(
  table: TableSnapshot,
  seatIndex: number,
): LegalActions | null {
  const hand = table.handState;
  if (!hand || hand.street === "showdown" || hand.street === "complete") return null;
  if (hand.actionSeat !== seatIndex) return null;

  const seat = table.seats[seatIndex];
  if (!seat || seat.status !== "seated") return null;

  const bet = getPlayerBet(hand, seatIndex);
  const toCall = hand.currentBet - bet.betThisStreet;
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && seat.stack > 0;
  const callAmount = Math.min(toCall, seat.stack);
  const minRaiseTo = hand.currentBet + hand.lastRaiseSize;
  const maxRaiseTo = bet.betThisStreet + seat.stack;
  const canRaise = maxRaiseTo >= minRaiseTo && seat.stack > toCall;
  const canAllIn = seat.stack > 0;

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount,
    canRaise,
    minRaiseTo: canRaise ? minRaiseTo : maxRaiseTo + 1,
    maxRaiseTo,
    canAllIn,
    allInAmount: seat.stack,
  };
}

function refreshPots(table: TableSnapshot, hand: HandState): void {
  hand.pots = calculatePots(
    table.seats.map((s) => ({
      seatIndex: s.seatIndex,
      totalCommitted: getPlayerBet(hand, s.seatIndex).totalCommitted,
      folded: s.status === "folded",
    })),
  );
}

function countActivePlayers(seats: SeatSnapshot[]): number {
  return seats.filter((s) => s.userId && (s.status === "seated" || s.status === "all_in")).length;
}

function findNextActionSeat(table: TableSnapshot, hand: HandState, fromSeat: number): number | null {
  const seatCount = table.seats.length;
  for (let i = 1; i <= seatCount; i++) {
    const idx = nextSeatIndex(fromSeat + i - 1, seatCount);
    const seat = table.seats[idx];
    if (!seat || seat.status !== "seated") continue;
    const bet = getPlayerBet(hand, idx);
    const toCall = hand.currentBet - bet.betThisStreet;
    if (toCall > 0 || !bet.hasActedThisStreet) return idx;
  }
  return null;
}

function isBettingRoundComplete(table: TableSnapshot, hand: HandState): boolean {
  const betting = playersStillBetting(table.seats);
  if (betting.length === 0) return true;
  return betting.every((s) => {
    const bet = getPlayerBet(hand, s.seatIndex);
    return bet.betThisStreet === hand.currentBet && bet.hasActedThisStreet;
  });
}

function resetStreetBets(hand: HandState): void {
  hand.currentBet = 0;
  for (const bet of hand.playerBets) {
    bet.betThisStreet = 0;
    bet.hasActedThisStreet = false;
  }
}

function postBlind(
  table: TableSnapshot,
  hand: HandState,
  seatIndex: number,
  amount: number,
): void {
  const seat = table.seats[seatIndex]!;
  const bet = getPlayerBet(hand, seatIndex);
  const posted = Math.min(amount, seat.stack);
  seat.stack -= posted;
  bet.betThisStreet += posted;
  bet.totalCommitted += posted;
  if (seat.stack === 0) seat.status = "all_in";
  hand.currentBet = Math.max(hand.currentBet, bet.betThisStreet);
}

function advanceStreet(table: TableSnapshot, hand: HandState): void {
  refreshPots(table, hand);
  resetStreetBets(hand);
  hand.lastRaiseSize = table.bigBlind;

  const order: PokerStreet[] = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = order.indexOf(hand.street);
  const nextStreet = order[idx + 1];
  if (!nextStreet) {
    hand.street = "showdown";
    return;
  }

  hand.street = nextStreet;

  if (nextStreet === "flop") {
    const burn = burnCard(hand.deck);
    hand.deck = burn.remaining;
    const deal = dealCards(hand.deck, 3);
    hand.deck = deal.remaining;
    hand.board.push(...deal.dealt);
  } else if (nextStreet === "turn" || nextStreet === "river") {
    const burn = burnCard(hand.deck);
    hand.deck = burn.remaining;
    const deal = dealCards(hand.deck, 1);
    hand.deck = deal.remaining;
    hand.board.push(...deal.dealt);
  }

  if (nextStreet === "showdown") {
    hand.actionSeat = null;
    return;
  }

  const first = findNextOccupiedSeat(
    table.seats,
    hand.dealerSeat,
    (s) => s.status === "seated" || s.status === "all_in",
  );
  hand.actionSeat = first !== null ? findNextActionSeat(table, hand, first - 1) : null;
}

function runOutBoard(table: TableSnapshot, hand: HandState): void {
  while (hand.board.length < 5 && hand.deck.length > 0) {
    const burn = burnCard(hand.deck);
    hand.deck = burn.remaining;
    const deal = dealCards(hand.deck, 1);
    hand.deck = deal.remaining;
    hand.board.push(...deal.dealt);
  }
  hand.street = "showdown";
  hand.actionSeat = null;
}

export function startHand(table: TableSnapshot, dealerSeat: number): TableSnapshot {
  const players = seatedPlayers(table.seats).filter((s) => s.stack > 0);
  if (players.length < 2) throw new Error("Need at least 2 players with chips to start.");

  const seats = table.seats.map((s) => ({
    ...s,
    status: s.userId && s.stack > 0 ? ("seated" as const) : s.status,
    holeCards: [] as Card[],
  }));

  const seatCount = seats.length;
  const sbSeat =
    findNextOccupiedSeat(seats, dealerSeat, (s) => s.stack > 0 && !!s.userId) ?? dealerSeat;
  const bbSeat =
    findNextOccupiedSeat(seats, sbSeat, (s) => s.stack > 0 && !!s.userId) ?? sbSeat;

  let deck = shuffleDeck(createDeck());
  const holeCards: Card[][] = seats.map(() => []);
  for (let round = 0; round < 2; round++) {
    for (let i = 1; i <= seatCount; i++) {
      const idx = nextSeatIndex(dealerSeat + i - 1, seatCount);
      const seat = seats[idx];
      if (!seat?.userId || seat.stack <= 0) continue;
      const deal = dealCards(deck, 1);
      deck = deal.remaining;
      holeCards[idx]!.push(deal.dealt[0]!);
    }
  }

  for (let i = 0; i < seats.length; i++) {
    seats[i]!.holeCards = holeCards[i] ?? [];
  }

  const hand: HandState = {
    street: "preflop",
    board: [],
    deck,
    dealerSeat,
    actionSeat: null,
    currentBet: 0,
    lastRaiseSize: table.bigBlind,
    pots: [],
    playerBets: seats
      .filter((s) => s.userId && s.stack >= 0)
      .map((s) => ({
        seatIndex: s.seatIndex,
        betThisStreet: 0,
        totalCommitted: 0,
        hasActedThisStreet: false,
      })),
    actionDeadlineAt: null,
  };

  const snapshot: TableSnapshot = {
    ...table,
    status: "playing",
    handNumber: table.handNumber + 1,
    seats,
    handState: hand,
  };

  postBlind(snapshot, hand, sbSeat, table.smallBlind);
  postBlind(snapshot, hand, bbSeat, table.bigBlind);
  hand.lastRaiseSize = table.bigBlind;

  const firstToAct = findNextOccupiedSeat(seats, bbSeat, (s) => s.status === "seated");
  hand.actionSeat = firstToAct !== null ? findNextActionSeat(snapshot, hand, firstToAct - 1) : null;

  refreshPots(snapshot, hand);
  return snapshot;
}

function applyBet(
  table: TableSnapshot,
  hand: HandState,
  seatIndex: number,
  amount: number,
  isRaise: boolean,
): void {
  const seat = table.seats[seatIndex]!;
  const bet = getPlayerBet(hand, seatIndex);
  const actual = Math.min(amount, seat.stack);
  seat.stack -= actual;
  bet.betThisStreet += actual;
  bet.totalCommitted += actual;
  bet.hasActedThisStreet = true;

  if (bet.betThisStreet > hand.currentBet) {
    if (isRaise) {
      hand.lastRaiseSize = bet.betThisStreet - hand.currentBet;
    }
    hand.currentBet = bet.betThisStreet;
  }

  if (seat.stack === 0) seat.status = "all_in";
}

export function applyAction(
  table: TableSnapshot,
  seatIndex: number,
  action: PokerAction,
  raiseTo?: number,
): TableSnapshot {
  const hand = table.handState;
  if (!hand) throw new Error("No hand in progress.");
  if (hand.actionSeat !== seatIndex) throw new Error("Not your turn.");
  if (hand.street === "showdown" || hand.street === "complete") {
    throw new Error("Hand is already over.");
  }

  const seat = table.seats[seatIndex];
  if (!seat || seat.status !== "seated") throw new Error("You cannot act.");

  const legal = getLegalActions(table, seatIndex);
  if (!legal) throw new Error("No legal actions available.");

  const seats = table.seats.map((s) => ({ ...s }));
  const newHand: HandState = {
    ...hand,
    playerBets: hand.playerBets.map((b) => ({ ...b })),
    board: [...hand.board],
    deck: [...hand.deck],
    pots: [...hand.pots],
  };
  const snapshot: TableSnapshot = { ...table, seats, handState: newHand };

  switch (action) {
    case "fold":
      if (!legal.canFold) throw new Error("Cannot fold.");
      seats[seatIndex]!.status = "folded";
      getPlayerBet(newHand, seatIndex).hasActedThisStreet = true;
      break;
    case "check":
      if (!legal.canCheck) throw new Error("Cannot check.");
      getPlayerBet(newHand, seatIndex).hasActedThisStreet = true;
      break;
    case "call":
      if (!legal.canCall) throw new Error("Cannot call.");
      applyBet(snapshot, newHand, seatIndex, legal.callAmount, false);
      break;
    case "raise": {
      if (!legal.canRaise) throw new Error("Cannot raise.");
      const target = raiseTo ?? legal.minRaiseTo;
      if (target < legal.minRaiseTo || target > legal.maxRaiseTo) {
        throw new Error(`Raise must be between ${legal.minRaiseTo} and ${legal.maxRaiseTo}.`);
      }
      const bet = getPlayerBet(newHand, seatIndex);
      const needed = target - bet.betThisStreet;
      applyBet(snapshot, newHand, seatIndex, needed, true);
      break;
    }
    case "all_in": {
      if (!legal.canAllIn) throw new Error("Cannot go all-in.");
      const bet = getPlayerBet(newHand, seatIndex);
      const isRaise = bet.betThisStreet + seat.stack > hand.currentBet;
      applyBet(snapshot, newHand, seatIndex, seat.stack, isRaise);
      break;
    }
  }

  snapshot.seats = seats;

  if (countActivePlayers(snapshot.seats) <= 1) {
    return resolveHand(snapshot);
  }

  refreshPots(snapshot, newHand);

  if (playersStillBetting(snapshot.seats).length === 0) {
    runOutBoard(snapshot, newHand);
    return resolveHand(snapshot);
  }

  if (isBettingRoundComplete(snapshot, newHand)) {
    if (newHand.street === "river") {
      newHand.street = "showdown";
      newHand.actionSeat = null;
      return resolveHand(snapshot);
    }
    advanceStreet(snapshot, newHand);
    if (playersStillBetting(snapshot.seats).length === 0) {
      runOutBoard(snapshot, newHand);
      return resolveHand(snapshot);
    }
    return snapshot;
  }

  const next = findNextActionSeat(snapshot, newHand, seatIndex);
  newHand.actionSeat = next;
  return snapshot;
}

export function resolveHand(table: TableSnapshot): TableSnapshot {
  const hand = table.handState;
  if (!hand) return table;

  refreshPots(table, hand);

  const seats = table.seats.map((s) => ({ ...s, holeCards: [...s.holeCards] }));
  const active = seats.filter(
    (s) => s.userId && (s.status === "seated" || s.status === "all_in"),
  );

  const payouts = new Map<number, number>();

  if (active.length === 1) {
    const winner = active[0]!;
    const total = hand.pots.reduce((sum, p) => sum + p.amount, 0);
    payouts.set(winner.seatIndex, total);
    hand.winners = [{ seatIndex: winner.seatIndex, amount: total, handLabel: "Last player standing" }];
  } else {
    runOutBoard({ ...table, seats }, hand);
    const winnerRecords: { seatIndex: number; amount: number; handLabel?: string }[] = [];

    for (const pot of hand.pots) {
      const contenders = pot.eligibleSeatIndices
        .map((idx) => seats[idx])
        .filter((s): s is SeatSnapshot => !!s && (s.status === "seated" || s.status === "all_in"));

      if (contenders.length === 0) continue;

      let best: ReturnType<typeof evaluateBestHand> | null = null;
      const bestSeats: number[] = [];

      for (const contender of contenders) {
        const evaluated = evaluateBestHand([...contender.holeCards, ...hand.board]);
        if (!best || compareHands(evaluated, best) > 0) {
          best = evaluated;
          bestSeats.length = 0;
          bestSeats.push(contender.seatIndex);
        } else if (best && compareHands(evaluated, best) === 0) {
          bestSeats.push(contender.seatIndex);
        }
      }

      const potPayouts = splitPot(pot.amount, bestSeats);
      for (const [seatIdx, amount] of potPayouts) {
        payouts.set(seatIdx, (payouts.get(seatIdx) ?? 0) + amount);
        if (best) {
          winnerRecords.push({
            seatIndex: seatIdx,
            amount,
            handLabel: best.label,
          });
        }
      }
    }

    hand.winners = aggregateWinnersBySeat(winnerRecords);
  }

  for (const [seatIdx, amount] of payouts) {
    seats[seatIdx]!.stack += amount;
  }

  for (const seat of seats) {
    if (seat.userId && seat.stack === 0) {
      seat.status = "empty";
      seat.userId = null;
      seat.holeCards = [];
    } else if (seat.status === "folded" || seat.status === "all_in") {
      seat.status = "seated";
      seat.holeCards = [];
    }
  }

  hand.street = "complete";
  hand.actionSeat = null;

  const remaining = seats.filter((s) => s.userId && s.stack > 0);
  return {
    ...table,
    seats,
    handState: hand,
    status: remaining.length >= 2 ? "playing" : "waiting",
  };
}

export function nextDealerSeat(table: TableSnapshot): number {
  const occupied = table.seats.filter((s) => s.userId && s.stack > 0);
  if (occupied.length === 0) return table.handState?.dealerSeat ?? 0;
  const current = table.handState?.dealerSeat ?? 0;
  const next = findNextOccupiedSeat(table.seats, current, (s) => !!s.userId && s.stack > 0);
  return next ?? occupied[0]!.seatIndex;
}
