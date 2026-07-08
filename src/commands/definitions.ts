import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type SlashCommandSubcommandBuilder,
} from "discord.js";

function addPvpChallengeOptions(
  sub: SlashCommandSubcommandBuilder,
  opts?: { includeSide?: boolean },
) {
  sub
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Opponent").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Wager amount").setRequired(true).setMinValue(1),
    );

  if (opts?.includeSide) {
    sub.addStringOption((opt) =>
      opt
        .setName("side")
        .setDescription("Heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" },
        ),
    );
  }

  sub.addStringOption((opt) =>
    opt
      .setName("match")
      .setDescription("Single game or best 2 of 3")
      .addChoices(
        { name: "Single game", value: "single" },
        { name: "Best 2 of 3", value: "best_of_3" },
      ),
  );

  return sub;
}

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how to use AndBot commands"),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your wallet balance")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to check (defaults to you)"),
    ),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily free currency"),
  new SlashCommandBuilder()
    .setName("weekly")
    .setDescription("Claim your weekly free currency"),
  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send currency to another user")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Recipient").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See who has the most currency")
    .addIntegerOption((opt) =>
      opt
        .setName("limit")
        .setDescription("Number of players to show (default 10)")
        .setMinValue(1)
        .setMaxValue(25),
    ),
  new SlashCommandBuilder()
    .setName("lottery")
    .setDescription("Guild lottery - buy tickets and win the pot")
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Buy lottery tickets for the current round")
        .addIntegerOption((opt) =>
          opt
            .setName("count")
            .setDescription("Number of tickets (default 1)")
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("View the current lottery round"))
    .addSubcommand((sub) =>
      sub.setName("draw").setDescription("Force an early draw (admin, Manage Server)"),
    ),
  new SlashCommandBuilder()
    .setName("casino")
    .setDescription("Browse casino games and play from a menu"),
  new SlashCommandBuilder()
    .setName("challenge")
    .setDescription("Browse PvP games and send a challenge from a menu")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Opponent to challenge (recommended — use @mention search)"),
    ),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin against the house")
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Wager amount").setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName("side")
        .setDescription("Heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play blackjack against the house")
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Wager amount").setRequired(true).setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Challenge another player to Rock Paper Scissors")
    .addSubcommand((sub) =>
      addPvpChallengeOptions(
        sub.setName("challenge").setDescription("Challenge a player"),
      ),
    ),
  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Challenge another player to a 2-dice duel")
    .addSubcommand((sub) =>
      addPvpChallengeOptions(
        sub.setName("challenge").setDescription("Challenge a player"),
      ),
    ),
  new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Challenge another player to Russian Roulette")
    .addSubcommand((sub) =>
      addPvpChallengeOptions(
        sub.setName("challenge").setDescription("Challenge a player"),
      ),
    ),
  new SlashCommandBuilder()
    .setName("coinflipduel")
    .setDescription("Challenge another player to a coinflip duel")
    .addSubcommand((sub) =>
      addPvpChallengeOptions(
        sub.setName("challenge").setDescription("Challenge a player"),
        { includeSide: true },
      ),
    ),
  new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give currency to a user (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Recipient").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for audit log").setMaxLength(200),
    ),
  new SlashCommandBuilder()
    .setName("take")
    .setDescription("Take currency from a user (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Target user").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Amount to take").setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for audit log").setMaxLength(200),
    ),
  new SlashCommandBuilder()
    .setName("andbot-ticket")
    .setDescription("Submit an issue or suggestion for AndBot")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Issue or suggestion")
        .setRequired(true)
        .addChoices(
          { name: "Issue", value: "issue" },
          { name: "Suggestion", value: "suggestion" },
        ),
    )
    .addStringOption((opt) =>
      opt.setName("title").setDescription("Short summary").setRequired(true).setMaxLength(100),
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Details")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  new SlashCommandBuilder()
    .setName("andbot-ticket-review")
    .setDescription("Review submitted AndBot tickets (mods)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List tickets")
        .addStringOption((opt) =>
          opt
            .setName("status")
            .setDescription("Filter by status (default: open)")
            .addChoices(
              { name: "Open", value: "open" },
              { name: "Resolved", value: "resolved" },
              { name: "Closed", value: "closed" },
              { name: "All", value: "all" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View a ticket by ID")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Ticket ID (8 characters)").setRequired(true).setMinLength(8).setMaxLength(8),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("resolve")
        .setDescription("Mark a ticket as resolved")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Ticket ID (8 characters)").setRequired(true).setMinLength(8).setMaxLength(8),
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("Optional note for the submitter").setMaxLength(500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Close a ticket without resolving")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Ticket ID (8 characters)").setRequired(true).setMinLength(8).setMaxLength(8),
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("Optional note for the submitter").setMaxLength(500),
        ),
    ),
].map((cmd) => cmd.toJSON());
