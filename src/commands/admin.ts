import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import { InsufficientFundsError } from "../services/wallet";
import { assertGuild, hasManageGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";

function adminEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setTitle(title).setDescription(description);
}

export async function handleGive(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  config: Config,
) {
  if (!hasManageGuild(interaction)) {
    await interaction.reply({
      content: "You need the Manage Server permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const guildId = assertGuild(interaction);
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = interaction.options.getString("reason") ?? undefined;

  if (target.bot) {
    await interaction.reply({ content: "You cannot give currency to bots.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    const before = await wallet.getBalance(guildId, target.id);
    const after = await wallet.credit(guildId, target.id, amount, "admin_give", interaction.user.id, {
      reason,
      adminId: interaction.user.id,
    });

    await interaction.reply({
      embeds: [
        adminEmbed(
          "Currency Given",
          `Gave **${formatCurrency(amount, config)}** to **${target.username}**.\nBefore: **${formatCurrency(before, config)}**\nAfter: **${formatCurrency(after, config)}**${
            reason ? `\nReason: ${reason}` : ""
          }`,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof BetValidationError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}

export async function handleTake(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  config: Config,
) {
  if (!hasManageGuild(interaction)) {
    await interaction.reply({
      content: "You need the Manage Server permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const guildId = assertGuild(interaction);
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const reason = interaction.options.getString("reason") ?? undefined;

  if (target.bot) {
    await interaction.reply({ content: "You cannot take currency from bots.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    const before = await wallet.getBalance(guildId, target.id);
    const after = await wallet.debit(guildId, target.id, amount, "admin_take", interaction.user.id, {
      reason,
      adminId: interaction.user.id,
    });

    await interaction.reply({
      embeds: [
        adminEmbed(
          "Currency Taken",
          `Took **${formatCurrency(amount, config)}** from **${target.username}**.\nBefore: **${formatCurrency(before, config)}**\nAfter: **${formatCurrency(after, config)}**${
            reason ? `\nReason: ${reason}` : ""
          }`,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof BetValidationError || err instanceof InsufficientFundsError) {
      await interaction.reply({ content: err.message, ephemeral: true });
      return;
    }
    throw err;
  }
}
