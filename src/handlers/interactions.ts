import type { Client, Interaction } from "discord.js";
import type { Database } from "../db/client";
import type { Config } from "../config";
import type { WalletService } from "../services/wallet";
import { createClaimsService } from "../services/claims";
import type { BlackjackSessionService } from "../services/blackjack/session";
import { createMinesSessionService } from "../services/casino/mines/session";
import type { HiloSessionService } from "../services/casino/hilo/session";
import type { LotteryService } from "../services/lottery/rounds";
import type { PokerTableService } from "../services/poker/table";
import { createSlotsJackpotService } from "../services/casino/slotsJackpot";
import { createTicketService } from "../services/tickets/tickets";
import { handleBalance, handleDaily, handleWeekly, handlePay } from "../commands/economy";
import { handleCoinflip, handleBlackjack, handleBlackjackButton } from "../commands/house";
import {
  handleRpsChallenge,
  handleDiceChallenge,
  handleRouletteChallenge,
  handleCoinflipDuelChallenge,
  handlePvpAcceptDecline,
  handleRpsChoice,
  handleDiceRoll,
  handleRoulettePull,
} from "../commands/pvp";
import { handleGive, handleTake } from "../commands/admin";
import { handleAndbotTicketSubmit, handleAndbotTicketReview } from "../commands/ticket";
import { handleLotteryBuy, handleLotteryStatus, handleLotteryDraw } from "../commands/lottery";
import { handleHelp } from "../commands/help";
import { handleLeaderboard } from "../commands/leaderboard";
import {
  handleCasino,
  handleCasinoMenuButton,
  handleCasinoPick,
  handleCasinoPlayAgain,
  handleCasinoChangeSetup,
  handleCasinoCustomWager,
  handleCasinoWagerBet,
  handleCasinoCustomAmountModal,
  handleCasinoLuckyPick,
  handleCasinoLuckyCustomModal,
  handleCasinoLuckyCustomPrompt,
  handleCasinoKenoQuickPick,
  handleCasinoKenoCustomModal,
  handleCasinoKenoCustomPrompt,
  handleCasinoCoinflipSide,
  handleCasinoRouletteBet,
  handleCasinoHiLoGuess,
  handleCasinoHiLoCashout,
  handleCasinoMinesConfig,
  handleCasinoMinesReveal,
  handleCasinoMinesCashout,
  handleCasinoForfeitActive,
  handleCasinoLotteryPick,
  handleCasinoLotteryBuy,
  handleCasinoLotteryStatus,
  handleCasinoLotteryCustomPrompt,
  handleCasinoLotteryCustomModal,
  isCasinoGame,
} from "../commands/casino";
import {
  handlePokerLobby,
  handlePokerBrowse,
  handlePokerCreatePrompt,
  handlePokerBuyInModal,
  handlePokerJoin,
  handlePokerLeave,
  handlePokerStart,
  handlePokerAction,
  handlePokerRaisePrompt,
  handlePokerRaiseModal,
} from "../commands/poker";
import { parseCasinoAgainButtonId } from "../commands/casino/replay";
import { parseRouletteBet } from "../services/casino/roulette";
import {
  handleChallenge,
  handleChallengePick,
  handleChallengeUserSelect,
  handleChallengeMatchSelect,
  handleChallengeSideSelect,
  handleChallengeWager,
  handleChallengeCustomWager,
  handleChallengeCustomAmountModal,
  handleChallengeUsernamePrompt,
  handleChallengeUsernameModal,
  handleChallengeRecentOpponent,
  isChallengeGame,
} from "../commands/challenge";
import type { PvpMatchFormat } from "../db/schema";
import type { CoinSide } from "../services/pvp/challenges";
import { parseButtonId } from "../utils/buttons";
import { replyInteractionError, isInteractionAlreadyAcknowledged } from "../utils/interactionError";
import { PublicGameMessageError } from "../commands/casino/publicMessage";
import { ActiveCasinoSessionError } from "../services/casino/activeSession";
import type { RpsChoice } from "../services/pvp/challenges";

export type InteractionHandlerServices = {
  wallet: WalletService;
  blackjack: BlackjackSessionService;
  hilo: HiloSessionService;
  lottery: LotteryService;
  poker: PokerTableService;
};

export function registerInteractionHandler(
  client: Client,
  db: Database,
  config: Config,
  services: InteractionHandlerServices,
) {
  const { wallet, blackjack, hilo, lottery, poker } = services;
  const claims = createClaimsService(wallet, config);
  const mines = createMinesSessionService(db, wallet, config);
  const slotsJackpot = createSlotsJackpotService(db);
  const tickets = createTicketService(db, config);

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
          case "challenge":
            await handleChallenge(interaction, config);
            break;
          case "coinflip":
            await handleCoinflip(interaction, wallet, config);
            break;
          case "blackjack":
            await handleBlackjack(interaction, wallet, blackjack, hilo, mines, config);
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
          case "roulette":
            if (interaction.options.getSubcommand() === "challenge") {
              await handleRouletteChallenge(interaction, db, wallet, config);
            }
            break;
          case "coinflipduel":
            if (interaction.options.getSubcommand() === "challenge") {
              await handleCoinflipDuelChallenge(interaction, db, wallet, config);
            }
            break;
          case "give":
            await handleGive(interaction, wallet, config);
            break;
          case "take":
            await handleTake(interaction, wallet, config);
            break;
          case "andbot-ticket":
            await handleAndbotTicketSubmit(interaction, tickets, config);
            break;
          case "andbot-ticket-review":
            await handleAndbotTicketReview(interaction, tickets, config);
            break;
        }
        return;
      }

      if (interaction.isUserSelectMenu()) {
        const challengeParts = parseButtonId(interaction.customId, "challenge");
        if (challengeParts?.[0] === "user" && isChallengeGame(challengeParts[1]!)) {
          await handleChallengeUserSelect(
            interaction,
            challengeParts[1]!,
            wallet,
            config,
          );
          return;
        }
      }

      if (interaction.isButton()) {
        const challengeParts = parseButtonId(interaction.customId, "challenge");
        if (challengeParts) {
          const [action, sub, ...rest] = challengeParts;

          if (action === "pick" && sub === "poker") {
            await handlePokerCreatePrompt(interaction, "private", config);
            return;
          }

          if (action === "pick" && isChallengeGame(sub!)) {
            await handleChallengePick(interaction, sub!, db, wallet, config);
            return;
          }

          if (action === "recent" && isChallengeGame(sub!) && rest[0]) {
            await handleChallengeRecentOpponent(
              interaction,
              sub!,
              rest[0],
              wallet,
              config,
            );
            return;
          }

          if (action === "name" && isChallengeGame(sub!)) {
            await handleChallengeUsernamePrompt(interaction, sub!);
            return;
          }

          if (action === "match" && isChallengeGame(sub!) && rest[0] && rest[1]) {
            await handleChallengeMatchSelect(
              interaction,
              sub!,
              rest[0],
              rest[1] as PvpMatchFormat,
              wallet,
              config,
            );
            return;
          }

          if (
            action === "side" &&
            isChallengeGame(sub!) &&
            rest[0] &&
            (rest[1] === "heads" || rest[1] === "tails")
          ) {
            await handleChallengeSideSelect(
              interaction,
              sub!,
              rest[0],
              rest[1] as CoinSide,
              wallet,
              config,
            );
            return;
          }

          if (
            action === "bet" &&
            isChallengeGame(sub!) &&
            rest[0] &&
            rest[1] &&
            rest[2]
          ) {
            await handleChallengeWager(
              interaction,
              sub!,
              rest[0],
              rest[1],
              rest[2] as PvpMatchFormat,
              rest[3] ?? "-",
              db,
              wallet,
              config,
            );
            return;
          }

          if (
            action === "custom" &&
            isChallengeGame(sub!) &&
            rest[0] &&
            rest[1]
          ) {
            await handleChallengeCustomWager(
              interaction,
              sub!,
              rest[0],
              rest[1] as PvpMatchFormat,
              rest[2] ?? "-",
              wallet,
              config,
            );
            return;
          }
        }

        const casinoParts = parseButtonId(interaction.customId, "casino");
        if (casinoParts) {
          const [action, sub, ...rest] = casinoParts;

          if (action === "pick" && sub === "lottery") {
            await handleCasinoLotteryPick(interaction, wallet, config);
            return;
          }

          if (action === "again") {
            const replay = parseCasinoAgainButtonId([sub!, ...rest]);
            if (replay) {
              await handleCasinoPlayAgain(
                interaction,
                replay,
                wallet,
                blackjack,
                slotsJackpot,
                mines,
                hilo,
                config,
              );
              return;
            }
            if (isCasinoGame(sub!)) {
              await handleCasinoPick(interaction, sub!, wallet, config, {
                poker,
                blackjack,
                hilo,
                mines,
              });
              return;
            }
          }

          if (action === "setup" && rest[0] && isCasinoGame(rest[0])) {
            await handleCasinoChangeSetup(interaction, sub!, rest[0], wallet, config);
            return;
          }

          if (action === "menu") {
            await handleCasinoMenuButton(interaction, config);
            return;
          }

          if (action === "pick" && isCasinoGame(sub!)) {
            await handleCasinoPick(interaction, sub!, wallet, config, {
              poker,
              blackjack,
              hilo,
              mines,
            });
            return;
          }

          if (action === "lot" && sub === "custom") {
            await handleCasinoLotteryCustomPrompt(interaction, config);
            return;
          }

          if (action === "lot" && sub === "buy" && rest[0]) {
            await handleCasinoLotteryBuy(
              interaction,
              Number.parseInt(rest[0], 10),
              lottery,
              config,
            );
            return;
          }

          if (action === "lot" && sub === "status") {
            await handleCasinoLotteryStatus(interaction, lottery, config);
            return;
          }

          if (action === "custom" && isCasinoGame(sub!)) {
            await handleCasinoCustomWager(interaction, sub!, wallet, config);
            return;
          }

          if (action === "ff" && rest.length >= 2) {
            await handleCasinoForfeitActive(
              interaction,
              sub!,
              rest[0]!,
              rest[1]!,
              rest[2],
              wallet,
              blackjack,
              slotsJackpot,
              hilo,
              mines,
              config,
            );
            return;
          }

          if (action === "bet" && isCasinoGame(sub!) && rest[0]) {
            await handleCasinoWagerBet(
              interaction,
              sub!,
              rest[0],
              wallet,
              blackjack,
              slotsJackpot,
              hilo,
              mines,
              config,
              poker,
            );
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
                slotsJackpot,
                hilo,
                mines,
                config,
              );
            }
            return;
          }

          if (action === "kn") {
            if (sub === "custom" && rest[0]) {
              await handleCasinoKenoCustomPrompt(interaction, rest[0]);
              return;
            }
            if (sub === "qp" && rest[0] && rest[1]) {
              await handleCasinoKenoQuickPick(
                interaction,
                rest[0],
                rest[1],
                wallet,
                blackjack,
                hilo,
                mines,
                config,
              );
              return;
            }
          }

          if (action === "ro" && rest.length >= 2) {
            try {
              const bet = parseRouletteBet(sub!);
              await handleCasinoRouletteBet(
                interaction,
                bet,
                rest[0]!,
                rest[1]!,
                wallet,
                config,
              );
            } catch {
              await interaction.reply({ content: "Invalid roulette bet.", ephemeral: true });
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

          if (action === "hl") {
            if ((sub === "higher" || sub === "lower") && rest[0]) {
              await handleCasinoHiLoGuess(interaction, sub, rest[0], hilo, wallet, config);
              return;
            }
            if (sub === "out" && rest[0]) {
              await handleCasinoHiLoCashout(interaction, rest[0], hilo, wallet, config);
              return;
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
                blackjack,
                hilo,
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

        const pokerParts = parseButtonId(interaction.customId, "poker");
        if (pokerParts) {
          const [action, sub, ...rest] = pokerParts;

          if (action === "browse" && sub === interaction.user.id) {
            await handlePokerBrowse(interaction, poker, config);
            return;
          }

          if (action === "create" && (sub === "public" || sub === "private")) {
            await handlePokerCreatePrompt(interaction, sub, config);
            return;
          }

          if (action === "join" && rest[0]) {
            await handlePokerJoin(
              interaction,
              rest[0],
              poker,
              config,
              blackjack,
              hilo,
              mines,
            );
            return;
          }

          if (action === "leave" && sub) {
            await handlePokerLeave(interaction, sub, poker, config);
            return;
          }

          if (action === "start" && sub) {
            await handlePokerStart(interaction, sub, poker, config);
            return;
          }

          if (action === "act" && sub && rest[0]) {
            await handlePokerAction(interaction, sub, rest[0], poker, config);
            return;
          }

          if (action === "raise" && sub) {
            await handlePokerRaisePrompt(interaction, sub, poker);
            return;
          }
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

          if (action === "roulette" && extra === "pull") {
            await handleRoulettePull(interaction, db, wallet, config, challengeId!);
            return;
          }
        }
      }

      if (interaction.isModalSubmit()) {
        const challengeModalParts = parseButtonId(interaction.customId, "challenge");
        if (
          challengeModalParts?.[0] === "modal" &&
          challengeModalParts[1] === "user" &&
          isChallengeGame(challengeModalParts[2]!)
        ) {
          await handleChallengeUsernameModal(
            interaction,
            challengeModalParts[2]!,
            wallet,
            config,
          );
          return;
        }

        if (
          challengeModalParts?.[0] === "modal" &&
          challengeModalParts[1] === "bet" &&
          isChallengeGame(challengeModalParts[2]!) &&
          challengeModalParts[3] &&
          challengeModalParts[4]
        ) {
          await handleChallengeCustomAmountModal(
            interaction,
            challengeModalParts[2]!,
            challengeModalParts[3],
            challengeModalParts[4] as PvpMatchFormat,
            challengeModalParts[5] ?? "-",
            db,
            wallet,
            config,
          );
          return;
        }

        const casinoParts = parseButtonId(interaction.customId, "casino");
        if (casinoParts && casinoParts[0] === "modal") {
          if (casinoParts[1] === "custom" && isCasinoGame(casinoParts[2]!)) {
            await handleCasinoCustomAmountModal(
              interaction,
              casinoParts[2]!,
              wallet,
              blackjack,
              slotsJackpot,
              hilo,
              mines,
              config,
              poker,
            );
            return;
          }
          if (casinoParts[1] === "ln" && casinoParts[2]) {
            await handleCasinoLuckyCustomModal(
              interaction,
              casinoParts[2],
              wallet,
              blackjack,
              slotsJackpot,
              hilo,
              mines,
              config,
            );
            return;
          }
          if (casinoParts[1] === "kn" && casinoParts[2]) {
            await handleCasinoKenoCustomModal(
              interaction,
              casinoParts[2],
              wallet,
              blackjack,
              hilo,
              mines,
              config,
            );
            return;
          }
          if (casinoParts[1] === "lot") {
            await handleCasinoLotteryCustomModal(
              interaction,
              wallet,
              lottery,
              config,
            );
            return;
          }
        }

        const pokerModalParts = parseButtonId(interaction.customId, "poker");
        if (pokerModalParts) {
          const [action, sub, ...rest] = pokerModalParts;
          if (action === "buyinModal" && sub && rest[0]) {
            await handlePokerBuyInModal(
              interaction,
              sub,
              rest[0],
              poker,
              config,
              blackjack,
              hilo,
              mines,
            );
            return;
          }
          if (action === "raiseModal" && sub) {
            await handlePokerRaiseModal(interaction, sub, poker, config);
            return;
          }
        }
      }
    } catch (err) {
      if (isInteractionAlreadyAcknowledged(err)) {
        return;
      }
      if (err instanceof ActiveCasinoSessionError) {
        await replyInteractionError(
          interaction,
          err.pending
            ? `You have an active ${err.active.label} game. Use the forfeit button to continue.`
            : `You have an active ${err.active.label} game. Forfeit your wager to continue.`,
        );
        return;
      }
      if (err instanceof PublicGameMessageError) {
        await replyInteractionError(interaction, err.message);
        return;
      }
      console.error("Interaction error:", err);
      await replyInteractionError(interaction);
    }
  });
}
