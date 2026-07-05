import type { Client, Interaction } from "discord.js";
import type { Database } from "../db/client";
import type { Config } from "../config";
import { createWalletService } from "../services/wallet";
import { createClaimsService } from "../services/claims";
import { createBlackjackSessionService } from "../services/blackjack/session";
import { createMinesSessionService } from "../services/casino/mines/session";
import { createLotteryService } from "../services/lottery/rounds";
import { handleBalance, handleDaily, handleWeekly, handlePay } from "../commands/economy";
import { handleCoinflip, handleBlackjack, handleBlackjackButton } from "../commands/house";
import {
  handleRpsChallenge,
  handleDiceChallenge,
  handlePvpAcceptDecline,
  handleRpsChoice,
  handleDiceRoll,
} from "../commands/pvp";
import { handleGive, handleTake } from "../commands/admin";
import { handleLotteryBuy, handleLotteryStatus, handleLotteryDraw } from "../commands/lottery";
import { handleHelp } from "../commands/help";
import { handleLeaderboard } from "../commands/leaderboard";
import {
  handleCasino,
  handleCasinoPick,
  handleCasinoCustomWager,
  handleCasinoWagerBet,
  handleCasinoCustomAmountModal,
  handleCasinoLuckyPick,
  handleCasinoLuckyCustomModal,
  handleCasinoLuckyCustomPrompt,
  handleCasinoCoinflipSide,
  handleCasinoHiLo,
  handleCasinoMinesConfig,
  handleCasinoMinesReveal,
  handleCasinoMinesCashout,
  isCasinoGame,
} from "../commands/casino";
import type { CoinSide } from "../services/coinflip";
import type { HiLoChoice } from "../services/casino/hilo";
import { parseButtonId } from "../utils/buttons";
import { replyInteractionError } from "../utils/interactionError";
import type { RpsChoice } from "../services/pvp/challenges";

export function registerInteractionHandler(client: Client, db: Database, config: Config) {
  const wallet = createWalletService(db, config);
  const claims = createClaimsService(wallet, config);
  const blackjack = createBlackjackSessionService(db, wallet, config);
  const mines = createMinesSessionService(db, wallet, config);
  const lottery = createLotteryService(db, wallet, config);

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case "help":
            await handleHelp(interaction, config);
            break;
          case "balance":
            await handleBalance(interaction, wallet, config);
            break;
          case "daily":
            await handleDaily(interaction, wallet, claims, config);
            break;
          case "weekly":
            await handleWeekly(interaction, wallet, claims, config);
            break;
          case "pay":
            await handlePay(interaction, wallet, config);
            break;
          case "leaderboard":
            await handleLeaderboard(interaction, db, config);
            break;
          case "lottery": {
            const sub = interaction.options.getSubcommand();
            if (sub === "buy") {
              await handleLotteryBuy(interaction, lottery, config);
            } else if (sub === "status") {
              await handleLotteryStatus(interaction, lottery, config);
            } else if (sub === "draw") {
              await handleLotteryDraw(interaction, lottery, config);
            }
            break;
          }
          case "casino":
            await handleCasino(interaction, config);
            break;
          case "coinflip":
            await handleCoinflip(interaction, wallet, config);
            break;
          case "blackjack":
            await handleBlackjack(interaction, wallet, blackjack, config);
            break;
          case "rps":
            if (interaction.options.getSubcommand() === "challenge") {
              await handleRpsChallenge(interaction, db, wallet, config);
            }
            break;
          case "dice":
            if (interaction.options.getSubcommand() === "challenge") {
              await handleDiceChallenge(interaction, db, wallet, config);
            }
            break;
          case "give":
            await handleGive(interaction, wallet, config);
            break;
          case "take":
            await handleTake(interaction, wallet, config);
            break;
        }
        return;
      }

      if (interaction.isButton()) {
        const casinoParts = parseButtonId(interaction.customId, "casino");
        if (casinoParts) {
          const [action, sub, ...rest] = casinoParts;

          if (action === "pick" && isCasinoGame(sub!)) {
            await handleCasinoPick(interaction, sub!, wallet, config);
            return;
          }

          if (action === "custom" && isCasinoGame(sub!)) {
            await handleCasinoCustomWager(interaction, sub!);
            return;
          }

          if (action === "bet" && isCasinoGame(sub!) && rest[0]) {
            await handleCasinoWagerBet(interaction, sub!, rest[0], wallet, blackjack, config);
            return;
          }

          if (action === "ln" && rest[0]) {
            if (sub === "custom") {
              await handleCasinoLuckyCustomPrompt(interaction, rest[0]);
            } else {
              await handleCasinoLuckyPick(
                interaction,
                rest[0],
                sub!,
                wallet,
                blackjack,
                config,
              );
            }
            return;
          }

          if (action === "cf" && rest.length >= 2) {
            const side = sub as CoinSide;
            if (side === "heads" || side === "tails") {
              await handleCasinoCoinflipSide(
                interaction,
                rest[0]!,
                rest[1]!,
                side,
                wallet,
                config,
              );
            }
            return;
          }

          if (action === "hl" && rest.length >= 3) {
            const choice = sub as HiLoChoice;
            if (choice === "higher" || choice === "lower") {
              await handleCasinoHiLo(
                interaction,
                choice,
                rest[0]!,
                rest[1]!,
                rest[2]!,
                wallet,
                config,
              );
            }
            return;
          }

          if (action === "mn") {
            if (sub === "cfg" && rest.length >= 2) {
              await handleCasinoMinesConfig(
                interaction,
                rest[0]!,
                rest[1]!,
                rest[2]!,
                mines,
                config,
              );
              return;
            }
            if (sub === "rev" && rest.length >= 1) {
              await handleCasinoMinesReveal(
                interaction,
                rest[0]!,
                rest[1]!,
                mines,
                wallet,
                config,
              );
              return;
            }
            if (sub === "out" && rest[0]) {
              await handleCasinoMinesCashout(interaction, rest[0], mines, wallet, config);
              return;
            }
          }
        }

        const bjParts = parseButtonId(interaction.customId, "bj");
        if (bjParts && bjParts.length === 2) {
          const [action, sessionId] = bjParts;
          if (action === "hit" || action === "stand" || action === "double") {
            await handleBlackjackButton(
              interaction,
              wallet,
              blackjack,
              config,
              action,
              sessionId!,
            );
          }
          return;
        }

        const pvpParts = parseButtonId(interaction.customId, "pvp");
        if (pvpParts) {
          const [action, challengeId, extra] = pvpParts;

          if (action === "accept" || action === "decline") {
            await handlePvpAcceptDecline(
              interaction,
              db,
              wallet,
              config,
              action,
              challengeId!,
            );
            return;
          }

          if (action === "rps" && extra) {
            await handleRpsChoice(
              interaction,
              db,
              wallet,
              config,
              challengeId!,
              extra as RpsChoice,
            );
            return;
          }

          if (action === "dice" && extra === "roll") {
            await handleDiceRoll(interaction, db, wallet, config, challengeId!);
            return;
          }
        }
      }

      if (interaction.isModalSubmit()) {
        const casinoParts = parseButtonId(interaction.customId, "casino");
        if (casinoParts && casinoParts[0] === "modal") {
          if (casinoParts[1] === "custom" && isCasinoGame(casinoParts[2]!)) {
            await handleCasinoCustomAmountModal(
              interaction,
              casinoParts[2]!,
              wallet,
              blackjack,
              config,
            );
            return;
          }
          if (casinoParts[1] === "ln" && casinoParts[2]) {
            await handleCasinoLuckyCustomModal(
              interaction,
              casinoParts[2],
              wallet,
              blackjack,
              config,
            );
          }
        }
      }
    } catch (err) {
      console.error("Interaction error:", err);
      await replyInteractionError(interaction);
    }
  });
}
