import { EmbedBuilder, type ChatInputCommandInteraction, type TextChannel } from "discord.js";
import type { Config } from "../config";
import type { TicketService } from "../services/tickets/tickets";
import { formatTicketId, TicketError } from "../services/tickets/tickets";
import type { AndbotTicket, TicketStatus, TicketType } from "../db/schema";
import { assertGuild, hasManageGuild } from "../utils/permissions";
import { ephemeralOptions } from "../utils/discord";

const TYPE_LABELS: Record<TicketType, string> = {
  issue: "Issue",
  suggestion: "Suggestion",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

function ticketEmbed(ticket: AndbotTicket, config: Config): EmbedBuilder {
  const shortId = formatTicketId(ticket.id);
  const lines = [
    `**ID:** \`${shortId}\``,
    `**Type:** ${TYPE_LABELS[ticket.type]}`,
    `**Status:** ${STATUS_LABELS[ticket.status]}`,
    `**From:** <@${ticket.submitterId}>`,
    `**Title:** ${ticket.title}`,
    "",
    ticket.body,
  ];

  if (ticket.reviewerId) {
    lines.push("", `**Reviewed by:** <@${ticket.reviewerId}>`);
  }
  if (ticket.reviewNote) {
    lines.push(`**Mod note:** ${ticket.reviewNote}`);
  }

  const color =
    ticket.status === "open" ? 0x3498db : ticket.status === "resolved" ? 0x57f287 : 0x95a5a6;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`Ticket ${shortId}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Submitted` })
    .setTimestamp(ticket.createdAt);
}

async function notifyModChannel(
  interaction: ChatInputCommandInteraction,
  ticket: AndbotTicket,
  config: Config,
) {
  if (!config.TICKET_MOD_CHANNEL_ID || !interaction.guild) return;

  const channel = await interaction.guild.channels
    .fetch(config.TICKET_MOD_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  await (channel as TextChannel).send({
    content: `New **${TYPE_LABELS[ticket.type].toLowerCase()}** from <@${ticket.submitterId}>`,
    embeds: [ticketEmbed(ticket, config)],
  });
}

export async function handleAndbotTicketSubmit(
  interaction: ChatInputCommandInteraction,
  tickets: TicketService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply(ephemeralOptions({ content: "Use this in a server channel." }));
    return;
  }

  const type = interaction.options.getString("type", true) as TicketType;
  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);

  try {
    const ticket = await tickets.submit(
      guildId,
      channelId,
      interaction.user.id,
      type,
      title,
      message,
    );
    const shortId = formatTicketId(ticket.id);

    await notifyModChannel(interaction, ticket, config);

    await interaction.reply(
      ephemeralOptions({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("Ticket Submitted")
            .setDescription(
              `Your **${TYPE_LABELS[type].toLowerCase()}** was recorded as ticket **\`${shortId}\`**.\n\nMods will review it with \`/andbot-ticket-review\`.`,
            ),
        ],
      }),
    );
  } catch (err) {
    if (err instanceof TicketError) {
      await interaction.reply(ephemeralOptions({ content: err.message }));
      return;
    }
    throw err;
  }
}

export async function handleAndbotTicketReview(
  interaction: ChatInputCommandInteraction,
  tickets: TicketService,
  config: Config,
) {
  if (!hasManageGuild(interaction)) {
    await interaction.reply(
      ephemeralOptions({ content: "You need the **Manage Server** permission to review tickets." }),
    );
    return;
  }

  const guildId = assertGuild(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const status = (interaction.options.getString("status") ?? "open") as TicketStatus | "all";
    const rows = await tickets.listTickets(guildId, status, 10);

    if (rows.length === 0) {
      await interaction.reply(
        ephemeralOptions({ content: `No **${status}** tickets found.` }),
      );
      return;
    }

    const lines = rows.map((ticket) => {
      const shortId = formatTicketId(ticket.id);
      return `**\`${shortId}\`** · ${TYPE_LABELS[ticket.type]} · ${STATUS_LABELS[ticket.status]} · <@${ticket.submitterId}> — ${ticket.title}`;
    });

    await interaction.reply(
      ephemeralOptions({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Tickets (${status})`)
            .setDescription(lines.join("\n"))
            .setFooter({ text: "Use /andbot-ticket-review view id:<ID> for details" }),
        ],
      }),
    );
    return;
  }

  if (sub === "view") {
    const shortId = interaction.options.getString("id", true);
    const ticket = await tickets.findByShortId(guildId, shortId);

    if (!ticket) {
      await interaction.reply(ephemeralOptions({ content: "Ticket not found. Check the ID and try again." }));
      return;
    }

    await interaction.reply(ephemeralOptions({ embeds: [ticketEmbed(ticket, config)] }));
    return;
  }

  if (sub === "resolve" || sub === "close") {
    const shortId = interaction.options.getString("id", true);
    const note = interaction.options.getString("note") ?? undefined;
    const ticket = await tickets.findByShortId(guildId, shortId);

    if (!ticket) {
      await interaction.reply(ephemeralOptions({ content: "Ticket not found. Check the ID and try again." }));
      return;
    }

    try {
      const status = sub === "resolve" ? "resolved" : "closed";
      const updated = await tickets.review(ticket, interaction.user.id, status, note);

      await interaction.reply(
        ephemeralOptions({
          embeds: [
            ticketEmbed(updated, config).setTitle(
              `Ticket ${formatTicketId(updated.id)} — ${STATUS_LABELS[updated.status]}`,
            ),
          ],
        }),
      );

      try {
        await interaction.user.send({
          content: `Your AndBot ticket **\`${formatTicketId(updated.id)}\`** was marked **${STATUS_LABELS[updated.status].toLowerCase()}**.`,
          embeds: [ticketEmbed(updated, config)],
        });
      } catch {
        // Submitter may have DMs disabled
      }
    } catch (err) {
      if (err instanceof TicketError) {
        await interaction.reply(ephemeralOptions({ content: err.message }));
        return;
      }
      throw err;
    }
  }
}
