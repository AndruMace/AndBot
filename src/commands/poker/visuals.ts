export const CARD_BACK = "🂠";

export const SPINNER_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"] as const;

export function formatStreetLabel(street: string): string {
  switch (street) {
    case "preflop":
      return "🎴 Preflop";
    case "flop":
      return "🃏 Flop";
    case "turn":
      return "🃏 Turn";
    case "river":
      return "🃏 River";
    case "showdown":
      return "🎭 Showdown";
    case "complete":
      return "✅ Complete";
    default:
      return street;
  }
}
