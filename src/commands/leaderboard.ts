import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Config } from "../config";
import type { Database } from "../db/client";
import { getGuildLeaderboard, getUserRank } from "../services/leaderboard";
import { assertGuild } from "../utils/permissions";
import { formatCurrency } from "../utils/bets";

const MEDALS = ["🥇", "🥈", "🥉"];

export async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  db: Database,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const limit = interaction.options.getInteger("limit") ?? 10;

  const entries = await getGuildLeaderboard(db, guildId, limit);
  const userRank = await getUserRank(db, guildId, interaction.user.id);

  let description: string;

  if (entries.length === 0) {
    description = "No one has any currency yet. Claim `/daily` to get started!";
  } else {
    description = entries
      .map((entry) => {
        const prefix = MEDALS[entry.rank - 1] ?? `**#${entry.rank}**`;
        const highlight = entry.userId === interaction.user.id ? " ← you" : "";
        return `${prefix} <@${entry.userId}> — **${formatCurrency(entry.balance, config)}**${highlight}`;
      })
      .join("\n");
  }

  if (userRank && !entries.some((e) => e.userId === interaction.user.id)) {
    description += `\n\nYour rank: **#${userRank.rank}** — **${formatCurrency(userRank.balance, config)}**`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Richest Players")
    .setDescription(description)
    .setFooter({ text: `Top ${limit} · ${config.CURRENCY_NAME}` });

  await interaction.reply({ embeds: [embed] });
}
