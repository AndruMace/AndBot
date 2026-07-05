import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Config } from "../config";
import type { LotteryService } from "../services/lottery/rounds";
import { LotteryError, InsufficientFundsError } from "../services/lottery/rounds";
import { assertGuild, hasManageGuild } from "../utils/permissions";
import { formatCurrency } from "../utils/bets";
import { formatDuration } from "../utils/time";
import { ephemeralOptions } from "../utils/discord";

function lotteryEmbed(title: string, description: string, config: Config): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `${config.LOTTERY_RAKE_PERCENT}% house fee · Draw every ${config.LOTTERY_DRAW_INTERVAL_DAYS} days`,
    });
}

function msUntilDraw(scheduledDrawAt: Date): number {
  return Math.max(0, scheduledDrawAt.getTime() - Date.now());
}

export async function handleLotteryBuy(
  interaction: ChatInputCommandInteraction,
  lottery: LotteryService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const count = interaction.options.getInteger("count") ?? 1;

  try {
    const { round, tickets, balance } = await lottery.buyTickets(
      guildId,
      interaction.user.id,
      interaction.channelId,
      count,
    );

    const ticketNumbers = tickets.map((t) => t.ticketNumber).join(", ");
    const totalCost = count * config.LOTTERY_TICKET_PRICE;

    await interaction.reply({
      embeds: [
        lotteryEmbed(
          "Lottery Tickets Purchased",
          `You bought **${count}** ticket${count === 1 ? "" : "s"} for **${formatCurrency(totalCost, config)}**.\n` +
            `Ticket number${count === 1 ? "" : "s"}: **${ticketNumbers}**\n` +
            `Round **#${round.roundNumber}** · Pot: **${formatCurrency(round.potAmount, config)}** ` +
            `(${round.ticketCount} tickets)\n` +
            `Draw in **${formatDuration(msUntilDraw(round.scheduledDrawAt))}**\n` +
            `Balance: **${formatCurrency(balance, config)}**`,
          config,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    if (err instanceof LotteryError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

export async function handleLotteryStatus(
  interaction: ChatInputCommandInteraction,
  lottery: LotteryService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const status = await lottery.getStatus(guildId, interaction.user.id);
  const { round, userTicketCount, uniquePlayers, lastCompleted } = status;

  const odds =
    round.ticketCount > 0 && userTicketCount > 0
      ? `${((userTicketCount / round.ticketCount) * 100).toFixed(1)}%`
      : userTicketCount > 0
        ? "100%"
        : "—";

  let lastWinnerLine = "No previous draw yet.";
  if (lastCompleted?.winnerId) {
    lastWinnerLine =
      `Round **#${lastCompleted.roundNumber}**: <@${lastCompleted.winnerId}> won **${formatCurrency(lastCompleted.payoutAmount ?? 0, config)}**`;
  } else if (lastCompleted) {
    lastWinnerLine = `Round **#${lastCompleted.roundNumber}**: no tickets sold.`;
  }

  await interaction.reply({
    embeds: [
      lotteryEmbed(
        `Lottery Round #${round.roundNumber}`,
        `**Pot:** ${formatCurrency(round.potAmount, config)}\n` +
          `**Tickets sold:** ${round.ticketCount} (${uniquePlayers} player${uniquePlayers === 1 ? "" : "s"})\n` +
          `**Ticket price:** ${formatCurrency(config.LOTTERY_TICKET_PRICE, config)}\n` +
          `**Draw in:** ${formatDuration(msUntilDraw(round.scheduledDrawAt))}\n\n` +
          `**Your tickets:** ${userTicketCount}\n` +
          `**Your odds:** ${odds}\n\n` +
          `**Last draw:** ${lastWinnerLine}`,
        config,
      ),
    ],
  });
}

export async function handleLotteryDraw(
  interaction: ChatInputCommandInteraction,
  lottery: LotteryService,
  config: Config,
) {
  if (!hasManageGuild(interaction)) {
    await interaction.reply(
      ephemeralOptions({ content: "You need the Manage Server permission to draw the lottery." }),
    );
    return;
  }

  const guildId = assertGuild(interaction);

  try {
    const result = await lottery.drawRound(guildId);
    const { round, nextRound, winningTicket, payout, rake, noTickets } = result;

    if (noTickets) {
      await interaction.reply({
        embeds: [
          lotteryEmbed(
            `Round #${round.roundNumber} Drawn`,
            `No tickets were sold — nothing to award.\n` +
              `Round **#${nextRound.roundNumber}** is now open.`,
            config,
          ),
        ],
      });
      return;
    }

    await interaction.reply({
      embeds: [
        lotteryEmbed(
          `Round #${round.roundNumber} Drawn`,
          `<@${winningTicket!.userId}> wins **${formatCurrency(payout, config)}**!\n` +
            `Winning ticket: **#${winningTicket!.ticketNumber}** of ${round.ticketCount}\n` +
            `Pot: **${formatCurrency(round.potAmount, config)}** · ` +
            `House fee: **${formatCurrency(rake, config)}**\n\n` +
            `Round **#${nextRound.roundNumber}** is now open.`,
          config,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof LotteryError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}
