import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import type { Config } from "../../config";
import type { WalletService } from "../../services/wallet";
import type { BlackjackSessionService } from "../../services/blackjack/session";
import type { HiloSessionService } from "../../services/casino/hilo/session";
import type { MinesSessionService } from "../../services/casino/mines/session";
import type { SlotsJackpotService } from "../../services/casino/slotsJackpot";
import {
  type PendingCasinoStart,
} from "../../services/casino/activeSession";
import { getCasinoGameLabel } from "./types";
import {
  executeCasinoGame,
  executeKenoWithPicks,
  executeLuckyWithPick,
  recordCasinoWager,
  runPlinkoAnimation,
  runRouletteAnimation,
  runSlotsAnimation,
} from "./gameRunner";
import { runCoinflipAnimation, runKenoAnimation, runLuckyAnimation } from "./presentations";
import { replayBlackjackOnMessage, runBlackjackWithWager } from "../house";
import { buildHiLoEmbed, hiloComponentsForSession } from "./hiloUi";
import { postPublicGameMessage, rollbackCreatedSession } from "./publicMessage";
import { buildMinesEmbed, buildMinesComponents } from "./minesUi";

type ResumeInteraction = ButtonInteraction | ModalSubmitInteraction;

export async function resumePendingCasinoStart(
  interaction: ResumeInteraction,
  pending: PendingCasinoStart,
  wallet: WalletService,
  blackjack: BlackjackSessionService,
  slotsJackpot: SlotsJackpotService,
  hilo: HiloSessionService,
  mines: MinesSessionService,
  config: Config,
): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  switch (pending.kind) {
    case "wager":
      await executeCasinoGame(
        interaction,
        pending.game,
        pending.amount,
        wallet,
        blackjack,
        slotsJackpot,
        hilo,
        mines,
        config,
      );
      return;
    case "lucky":
      await executeLuckyWithPick(
        interaction,
        pending.amount,
        pending.pick,
        wallet,
        blackjack,
        slotsJackpot,
        hilo,
        mines,
        config,
      );
      return;
    case "keno":
      await executeKenoWithPicks(
        interaction,
        pending.amount,
        pending.picks,
        wallet,
        blackjack,
        hilo,
        mines,
        config,
      );
      return;
    case "blackjack":
      await runBlackjackWithWager(interaction, wallet, blackjack, config, pending.amount, {
        publishMode: pending.publishMode === "channel" ? "channel" : undefined,
      });
      return;
    case "mines": {
      if (!channelId) throw new Error("Use this in a server channel.");
      let sessionId = "";
      try {
        await postPublicGameMessage(
          interaction,
          async () => {
            const session = await mines.startSession(
              guildId,
              userId,
              channelId,
              pending.amount,
              pending.minesCount,
            );
            sessionId = session.id;
            return {
              embeds: [
                buildMinesEmbed(
                  session,
                  config,
                  "Reveal tiles to find gems. Cash out before hitting a mine!",
                  userId,
                ),
              ],
              components: buildMinesComponents(session),
            };
          },
          async (message) => {
            await mines.setMessageId(sessionId, message.id);
          },
        );
      } catch (err) {
        await rollbackCreatedSession(
          err,
          sessionId,
          (id) => mines.getSession(id),
          (session) => mines.expireSession(session),
        );
        throw err;
      }
      return;
    }
    case "replay": {
      if (!interaction.isButton() || !channelId) {
        throw new Error("Use this in a server channel.");
      }
      const replay = pending.replay;
      const amount = replay.amount;
      await recordCasinoWager(wallet, guildId, userId, amount);
      const edit = (payload: Parameters<typeof interaction.message.edit>[0]) =>
        interaction.message.edit(payload);
      const ctx = {
        isPublic: true as const,
        userId: replay.userId,
        gameLabel: getCasinoGameLabel(replay.game),
        wager: amount,
        config,
      };

      switch (replay.game) {
        case "slots": {
          const startingJackpot = (await slotsJackpot.getJackpot(guildId)).accumulatedLosses;
          await runSlotsAnimation(
            edit,
            guildId,
            replay.userId,
            amount,
            wallet,
            slotsJackpot,
            config,
            startingJackpot,
          );
          return;
        }
        case "plinko":
          await runPlinkoAnimation(edit, guildId, replay.userId, amount, wallet, config);
          return;
        case "roulette":
          await runRouletteAnimation(
            edit,
            guildId,
            replay.userId,
            amount,
            replay.rouletteBet!,
            wallet,
            config,
          );
          return;
        case "coinflip":
          await runCoinflipAnimation(
            edit,
            wallet,
            guildId,
            replay.userId,
            amount,
            replay.coinflipSide!,
            config,
            ctx,
          );
          return;
        case "lucky":
          await runLuckyAnimation(
            edit,
            wallet,
            guildId,
            replay.userId,
            amount,
            replay.luckyPick!,
            config,
            ctx,
          );
          return;
        case "keno":
          await runKenoAnimation(
            edit,
            wallet,
            guildId,
            replay.userId,
            amount,
            replay.kenoPicks!,
            config,
            ctx,
          );
          return;
        case "hilo": {
          const session = await hilo.startSession(guildId, replay.userId, channelId, amount);
          await edit({
            embeds: [buildHiLoEmbed(session, config, undefined, replay.userId)],
            components: hiloComponentsForSession(session),
          });
          await hilo.setMessageId(session.id, interaction.message.id);
          return;
        }
        case "blackjack":
          await replayBlackjackOnMessage(interaction, amount, wallet, blackjack, config);
          return;
        case "mines": {
          const session = await mines.startSession(
            guildId,
            replay.userId,
            channelId,
            amount,
            replay.minesCount!,
          );
          await edit({
            embeds: [
              buildMinesEmbed(
                session,
                config,
                "Reveal tiles to find gems. Cash out before hitting a mine!",
                replay.userId,
              ),
            ],
            components: buildMinesComponents(session),
          });
          await mines.setMessageId(session.id, interaction.message.id);
          return;
        }
      }
    }
  }
}
