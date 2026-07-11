import type { Card } from "../blackjack/engine";

export type PokerStreet = "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";

export type PokerSeatStatus = "empty" | "seated" | "folded" | "all_in" | "sitting_out";

export type PokerTableStatus = "waiting" | "playing" | "closed";

export type PokerTableVisibility = "public" | "private";

export type PokerAction = "fold" | "check" | "call" | "raise" | "all_in";

export type PlayerBetState = {
  seatIndex: number;
  betThisStreet: number;
  totalCommitted: number;
  hasActedThisStreet: boolean;
};

export type PotInfo = {
  amount: number;
  eligibleSeatIndices: number[];
};

export type HandState = {
  street: PokerStreet;
  board: Card[];
  deck: Card[];
  dealerSeat: number;
  actionSeat: number | null;
  currentBet: number;
  lastRaiseSize: number;
  pots: PotInfo[];
  playerBets: PlayerBetState[];
  actionDeadlineAt: string | null;
  winners?: { seatIndex: number; amount: number; handLabel?: string }[];
};

export type SeatSnapshot = {
  seatIndex: number;
  userId: string | null;
  stack: number;
  status: PokerSeatStatus;
  holeCards: Card[];
};

export type TableSnapshot = {
  id: string;
  guildId: string;
  channelId: string;
  hostUserId: string;
  visibility: PokerTableVisibility;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  status: PokerTableStatus;
  handNumber: number;
  handState: HandState | null;
  seats: SeatSnapshot[];
};

export type LegalActions = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  allInAmount: number;
};
