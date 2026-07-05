export type CoinSide = "heads" | "tails";
export type RoundWinner = "challenger" | "opponent" | "tie";

export type RouletteState = {
  chambers: boolean[];
  pullIndex: number;
  turnUserId: string;
};

export type PvpMetadata = {
  challengerDice?: [number, number];
  opponentDice?: [number, number];
  roulette?: RouletteState;
  lastFlip?: CoinSide;
};

export function rollDice(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0]! % 6) + 1;
}

export function rollTwoDice(): [number, number] {
  return [rollDice(), rollDice()];
}

export function sumDice(dice: [number, number]): number {
  return dice[0] + dice[1];
}

export function formatDiceRoll(dice: [number, number]): string {
  return `${dice[0]} + ${dice[1]} = **${sumDice(dice)}**`;
}

export function determineDiceWinner(
  challengerTotal: number,
  opponentTotal: number,
): RoundWinner {
  if (challengerTotal === opponentTotal) return "tie";
  return challengerTotal > opponentTotal ? "challenger" : "opponent";
}

export function flipCoin(): CoinSide {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 2 === 0 ? "heads" : "tails";
}

export function determineCoinflipWinner(
  challengerSide: CoinSide,
  flipResult: CoinSide,
): RoundWinner {
  if (challengerSide === flipResult) return "challenger";
  return "opponent";
}

export function oppositeSide(side: CoinSide): CoinSide {
  return side === "heads" ? "tails" : "heads";
}

function shuffleChambers(chambers: boolean[]): boolean[] {
  const copy = [...chambers];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function createRouletteChambers(): boolean[] {
  const chambers = Array<boolean>(6).fill(false);
  chambers[crypto.getRandomValues(new Uint32Array(1))[0]! % 6] = true;
  return shuffleChambers(chambers);
}

export function initRoulette(challengerId: string): RouletteState {
  return {
    chambers: createRouletteChambers(),
    pullIndex: 0,
    turnUserId: challengerId,
  };
}

export function pullRouletteTrigger(
  state: RouletteState,
  challengerId: string,
  opponentId: string,
): { bang: boolean; nextState: RouletteState } {
  const bang = state.chambers[state.pullIndex]!;
  const turnUserId = bang
    ? state.turnUserId
    : state.turnUserId === challengerId
      ? opponentId
      : challengerId;

  return {
    bang,
    nextState: {
      ...state,
      pullIndex: state.pullIndex + 1,
      turnUserId,
    },
  };
}

export type RpsChoice = "rock" | "paper" | "scissors";

const RPS_BEATS: Record<RpsChoice, RpsChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

export function determineRpsWinner(
  challengerChoice: RpsChoice,
  opponentChoice: RpsChoice,
): RoundWinner {
  if (challengerChoice === opponentChoice) return "tie";
  if (RPS_BEATS[challengerChoice] === opponentChoice) return "challenger";
  return "opponent";
}

export function parseMetadata(raw: unknown): PvpMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as PvpMetadata;
}
