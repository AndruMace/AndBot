import { EmbedBuilder, type Client } from "discord.js";
import type { Config } from "../../config";
import type { LotteryService } from "./rounds";
import { formatCurrency } from "../../utils/bets";

function drawAnnouncementEmbed(
  result: Awaited<ReturnType<LotteryService["drawRoundById"]>>,
  config: Config,
): EmbedBuilder {
  const { round, nextRound, winningTicket, payout, rake, noTickets } = result;

  if (noTickets) {
    return new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`Lottery Round #${round.roundNumber} — No Entries`)
      .setDescription(
        `No tickets were sold this round.\n` +
          `Round **#${nextRound.roundNumber}** is now open. ` +
          `Tickets cost **${formatCurrency(config.LOTTERY_TICKET_PRICE, config)}** each.`,
      );
  }

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`Lottery Round #${round.roundNumber} — Winner!`)
    .setDescription(
      `<@${winningTicket!.userId}> won **${formatCurrency(payout, config)}** ` +
        `(ticket **#${winningTicket!.ticketNumber}** of ${round.ticketCount}).\n` +
        `Pot: **${formatCurrency(round.potAmount, config)}** · ` +
        `House fee (${config.LOTTERY_RAKE_PERCENT}%): **${formatCurrency(rake, config)}**\n\n` +
        `Round **#${nextRound.roundNumber}** is now open.`,
    );
}

export function startLotteryScheduler(client: Client, lottery: LotteryService, config: Config) {
  const tick = async () => {
    try {
      const overdue = await lottery.findOverdueOpenRounds();
      for (const round of overdue) {
        const result = await lottery.drawRoundById(round.id);
        const channelId = round.announceChannelId;
        if (!channelId) continue;

        try {
          const channel = await client.channels.fetch(channelId);
          if (channel?.isTextBased()) {
            await channel.send({ embeds: [drawAnnouncementEmbed(result, config)] });
          }
        } catch (err) {
          console.error(`Lottery announcement failed for guild ${round.guildId}:`, err);
        }
      }
    } catch (err) {
      console.error("Lottery scheduler error:", err);
    }
  };

  void tick();
  return setInterval(tick, 60_000);
}
