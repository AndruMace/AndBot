import type { PokerSeat, PokerTable } from "../../db/schema";
import type { HandState, SeatSnapshot, TableSnapshot } from "./types";

export function toTableSnapshot(table: PokerTable, seats: PokerSeat[]): TableSnapshot {
  const ordered = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  return {
    id: table.id,
    guildId: table.guildId,
    channelId: table.channelId,
    hostUserId: table.hostUserId,
    visibility: table.visibility,
    maxSeats: table.maxSeats,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    minBuyIn: table.minBuyIn,
    maxBuyIn: table.maxBuyIn,
    status: table.status,
    handNumber: table.handNumber,
    handState: (table.handState as HandState | null) ?? null,
    seats: ordered.map(toSeatSnapshot),
  };
}

export function toSeatSnapshot(seat: PokerSeat): SeatSnapshot {
  return {
    seatIndex: seat.seatIndex,
    userId: seat.userId,
    stack: seat.stack,
    status: seat.status,
    holeCards: seat.holeCards ?? [],
  };
}
