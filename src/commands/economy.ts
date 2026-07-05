import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import type { ClaimsService } from "../services/claims";
import { ClaimCooldownError, formatDailyClaimDescription } from "../services/claims";
import { InsufficientFundsError } from "../services/wallet";
import { assertGuild } from "../utils/permissions";
import { BetValidationError, formatCurrency, validateBetAmount } from "../utils/bets";
import { formatDuration } from "../utils/time";

function economyEmbed(title: string, description: string, config: Config): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Currency: ${config.CURRENCY_NAME}` });
}

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const target = interaction.options.getUser("user") ?? interaction.user;
  const balance = await wallet.getBalance(guildId, target.id);

  await interaction.reply({
    embeds: [
      economyEmbed(
        "Balance",
        `${target.id === interaction.user.id ? "You have" : `${target.username} has`} **${formatCurrency(balance, config)}**.`,
        config,
      ),
    ],
  });
}

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  claims: ClaimsService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const result = await claims.claimDaily(guildId, interaction.user.id);
    await interaction.reply({
      embeds: [
        economyEmbed(
          "Daily Reward",
          formatDailyClaimDescription(result, config, formatCurrency),
          config,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof ClaimCooldownError) {
      const w = await wallet.getOrCreateWallet(guildId, interaction.user.id);
      const streakLine =
        err.streak > 0
          ? `\nCurrent streak: **${err.streak} day${err.streak === 1 ? "" : "s"}** — don't miss tomorrow or it resets.`
          : "";
      await interaction.reply({
        embeds: [
          economyEmbed(
            "Daily Reward",
            `Daily reward is on cooldown. Try again in **${formatDuration(err.remainingMs)}**.${streakLine}\nCurrent balance: **${formatCurrency(w.balance, config)}**.`,
            config,
          ),
        ],
        ephemeral: true,
      });
      return;
    }
    throw err;
  }
}

export async function handleWeekly(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  claims: ClaimsService,
  config: Config,
) {
  const guildId = assertGuild(interaction);

  try {
    const { amount, balance } = await claims.claimWeekly(guildId, interaction.user.id);
    await interaction.reply({
      embeds: [
        economyEmbed(
          "Weekly Reward",
          `You claimed **${formatCurrency(amount, config)}**!\nNew balance: **${formatCurrency(balance, config)}**.`,
          config,
        ),
      ],
    });
  } catch (err) {
    if (err instanceof ClaimCooldownError) {
      const w = await wallet.getOrCreateWallet(guildId, interaction.user.id);
      await interaction.reply({
        embeds: [
          economyEmbed(
            "Weekly Reward",
            `Weekly reward is on cooldown. Try again in **${formatDuration(err.remainingMs)}**.\nCurrent balance: **${formatCurrency(w.balance, config)}**.`,
            config,
          ),
        ],
        ephemeral: true,
      });
      return;
    }
    throw err;
  }
}

export async function handlePay(
  interaction: ChatInputCommandInteraction,
  wallet: WalletService,
  config: Config,
) {
  const guildId = assertGuild(interaction);
  const recipient = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (recipient.bot) {
    await interaction.reply({ content: "You cannot pay bots.", ephemeral: true });
    return;
  }
  if (recipient.id === interaction.user.id) {
    await interaction.reply({ content: "You cannot pay yourself.", ephemeral: true });
    return;
  }

  try {
    validateBetAmount(amount, config);
    await wallet.transfer(guildId, interaction.user.id, recipient.id, amount);
    const balance = await wallet.getBalance(guildId, interaction.user.id);

    await interaction.reply({
      embeds: [
        economyEmbed(
          "Payment Sent",
          `You sent **${formatCurrency(amount, config)}** to **${recipient.username}**.\nYour new balance: **${formatCurrency(balance, config)}**.`,
          config,
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
