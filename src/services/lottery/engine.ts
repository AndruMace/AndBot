export function calculateLotteryPayout(
  potAmount: number,
  rakePercent: number,
): { payout: number; rake: number } {
  const rake = Math.floor((potAmount * rakePercent) / 100);
  return { payout: potAmount - rake, rake };
}

export function pickWinningTicketNumber(ticketCount: number): number {
  if (ticketCount <= 0) throw new Error("Cannot draw with no tickets.");
  const index = crypto.getRandomValues(new Uint32Array(1))[0]! % ticketCount;
  return index + 1;
}
