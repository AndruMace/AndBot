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
          "**Slots** — Match symbols for up to 20x",
          "**Hi-Lo** — Guess if the next card is higher or lower (2x)",
          "**Lucky Number** — Pick 1–100; exact match 25x, close guesses 2–5x",
          "**Mines** — Reveal gems, avoid mines, cash out anytime",
          "**Plinko** — Drop the chip; land in buckets up to 5x",
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
        ].join("\n"),
      },
    )
    .setFooter({ text: `Currency: ${config.CURRENCY_NAME} · Use /help anytime` });

  await interaction.reply({ embeds: [embed] });
}
