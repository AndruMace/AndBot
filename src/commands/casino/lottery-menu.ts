import type { Config } from "../../config";
import { formatCurrency } from "../../utils/bets";

export const LOTTERY_MENU = {
  id: "lottery" as const,
  label: "Lottery",
  emoji: "🎟️",
  description: "Buy tickets for a chance to win the guild pot.",
};

export function lotteryTicketDescription(config: Config, balance: number): string {
  const price = config.LOTTERY_TICKET_PRICE;
  const maxByBalance = Math.floor(balance / price);
  const maxTickets = Math.min(maxByBalance, config.LOTTERY_MAX_TICKETS_PER_PURCHASE);

  return (
    `Tickets cost **${formatCurrency(price, config)}** each.\n` +
    `You can buy up to **${maxTickets}** ticket${maxTickets === 1 ? "" : "s"} right now.\n` +
    `Use a preset below or **Custom Amount** to choose how many to buy.`
  );
}

export function parseLotteryTicketCount(
  raw: string,
  config: Config,
  balance: number,
): number {
  const count = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(count) || count < 1) {
    throw new Error("Enter a whole number of tickets (at least 1).");
  }

  const maxTickets = Math.min(
    Math.floor(balance / config.LOTTERY_TICKET_PRICE),
    config.LOTTERY_MAX_TICKETS_PER_PURCHASE,
  );

  if (maxTickets < 1) {
    throw new Error("You cannot afford any tickets right now.");
  }

  if (count > maxTickets) {
    throw new Error(
      `You can buy at most **${maxTickets}** ticket${maxTickets === 1 ? "" : "s"} right now.`,
    );
  }

  return count;
}

export function getLotteryTicketPresets(config: Config, balance: number): number[] {
  const price = config.LOTTERY_TICKET_PRICE;
  const maxTickets = Math.min(
    Math.floor(balance / price),
    config.LOTTERY_MAX_TICKETS_PER_PURCHASE,
  );
  if (maxTickets < 1) return [];

  const candidates = [1, 2, 5, 10, 25, 50];
  const valid = candidates.filter((count) => count <= maxTickets);
  if (valid.length === 0) return [1].filter(() => maxTickets >= 1);

  if (valid.length <= 4) return valid;

  const picks: number[] = [];
  for (let i = 0; i < 4; i++) {
    const index = Math.floor((i * (valid.length - 1)) / 3);
    picks.push(valid[index]!);
  }
  return [...new Set(picks)];
}
