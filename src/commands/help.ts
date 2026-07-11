import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Config } from "../config";
import { formatCurrency } from "../utils/bets";

export async function handleHelp(
  interaction: ChatInputCommandInteraction,
  config: Config,
) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("AndBot Help")
    .setDescription(
      `Earn **${config.CURRENCY_NAME}**, play house games, and wager against other players. Wagers must be between **${formatCurrency(config.MIN_BET, config)}** and **${formatCurrency(config.MAX_BET, config)}**.`,
    )
    .addFields(
      {
        name: "Economy",
        value: [
          "`/balance [user]` — Check your balance or someone else's",
          `\`/daily\` — Claim **${formatCurrency(config.DAILY_AMOUNT, config)}** base + **${formatCurrency(config.DAILY_STREAK_BONUS_PER_DAY, config)}** per streak day (max **${formatCurrency(config.DAILY_MAX_PAYOUT, config)}**/day)`,
          `\`/weekly\` — Claim **${formatCurrency(config.WEEKLY_AMOUNT, config)}** (once every 7 days)`,
          `Chat in the server to earn **${formatCurrency(config.MESSAGE_REWARD_AMOUNT, config)}** per message (${config.MESSAGE_REWARD_COOLDOWN_MS / 1000}s cooldown)`,
          "`/pay user amount` — Send currency to another player",
          "`/leaderboard [limit]` — See who has the most currency",
        ].join("\n"),
      },
      {
        name: "Casino (House Games)",
        value: [
          "`/casino` — Open the casino menu; pick a game, then tap a wager preset",
          "**Coinflip** — 50/50; double your wager",
          "**Blackjack** — Beat the dealer; natural 21 pays 3:2",
          "**Slots** — 5 reels, 7 symbols; match 3–4 for pays (~100% RTP). Five of a kind wins the progressive jackpot (90% of net slot losses since the last hit)",
          "**Hi-Lo** — Build a streak on a single deck (+0.5× per correct guess). Cash out anytime, bust on a wrong guess, or clear the deck for a hidden bonus.",
          "**Lucky Number** — Pick 1–100; exact match 25x, close guesses 2–5x",
          "**Mines** — Reveal gems, avoid mines, cash out anytime",
          "**Plinko** — Drop the chip; land in buckets up to 5x",
          "**Keno** — Pick 1–10 numbers; 20 drawn from 80; up to 10,000x",
          "**Roulette** — Red, Black, Odd, Even, or 0 (~97% RTP)",
          "**Poker** — No-Limit Texas Hold'em tables (2–6 players); browse or create from the casino menu",
          "**Lottery** — Buy tickets from the casino menu",
          "`/coinflip` and `/blackjack` also work as direct commands",
        ].join("\n"),
      },
      {
        name: "Lottery",
        value: [
          `\`/lottery buy [count]\` — Buy tickets at **${formatCurrency(config.LOTTERY_TICKET_PRICE, config)}** each`,
          "`/lottery status` — Pot size, your tickets, odds, and time until draw",
          `\`/lottery draw\` — Admin: force an early draw (Manage Server)`,
          `  • One random ticket wins the pot (more tickets = better odds)`,
          `  • ${config.LOTTERY_RAKE_PERCENT}% house fee · auto-draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
        ].join("\n"),
      },
      {
        name: "PvP Games",
        value: [
          "`/challenge [user]` — PvP menu: recent opponents, type username, or member list",
          "`/rps challenge user amount [match]` — Rock Paper Scissors",
          "`/dice challenge user amount [match]` — Roll 2 dice; higher total wins",
          "`/roulette challenge user amount [match]` — Russian Roulette; take turns pulling the trigger",
          "`/coinflipduel challenge user amount side [match]` — Coinflip duel; challenger picks a side",
          "`/challenge` → **Poker** — Create a private NLHE table (2–6 players)",
          "  • `match`: Single game (default) or Best 2 of 3",
          "  • Opponent accepts or declines via buttons",
          "  • Ties in a single game refund both players; ties in best-of-3 replay the round",
          `  • Challenges expire after ${config.CHALLENGE_EXPIRY_MINUTES} minutes if not accepted`,
        ].join("\n"),
      },
      {
        name: "Admin (Manage Server)",
        value: [
          "`/give user amount [reason]` — Give currency to a player",
          "`/take user amount [reason]` — Remove currency from a player",
          "`/andbot-ticket-review list [status]` — List submitted tickets",
          "`/andbot-ticket-review view id:<ID>` — View a ticket",
          "`/andbot-ticket-review resolve id:<ID> [note]` — Mark resolved",
          "`/andbot-ticket-review close id:<ID> [note]` — Close without resolving",
        ].join("\n"),
      },
      {
        name: "Feedback",
        value: [
          "`/andbot-ticket type title message` — Submit an issue or suggestion",
          "  • You'll get a ticket ID; mods review with `/andbot-ticket-review`",
        ].join("\n"),
      },
    )
    .setFooter({ text: `Currency: ${config.CURRENCY_NAME} · Use /help anytime` });

  await interaction.reply({ embeds: [embed] });
}
