# AndBot

Discord economy bot with virtual currency, house casino games, guild lottery, PvP wagers, message activity rewards, and admin tools.

Built with **Bun**, **discord.js**, **Drizzle ORM**, and **PostgreSQL**.

## Features

### Economy
- `/balance [user]` — Check wallet balance
- `/daily` — Claim daily currency with streak bonuses (UTC calendar days)
- `/weekly` — Claim weekly currency (7-day cooldown)
- `/pay user amount` — Send currency to another user
- `/leaderboard [limit]` — Top balances in the server
- **Message activity** — Earn coins for chatting (30s cooldown per user; requires bot **View Channel** in that channel)

### Casino (house games)
- `/casino` — Menu for all house games, including **lottery ticket purchases**
- **Coinflip** — 50/50 against the house
- **Blackjack** — Interactive blackjack
- **Slots** — Match symbols for up to 20x
- **Hi-Lo** — Guess higher or lower
- **Lucky Number** — Pick 1–100; exact match pays 25x
- **Mines** — Reveal gems, avoid mines, cash out anytime
- **Plinko** — Drop the chip for up to 5x
- **Lottery** — Buy tickets from the casino menu or via `/lottery`

Direct commands: `/coinflip`, `/blackjack`

### Lottery
- `/lottery buy [count]` — Buy tickets for the current guild round
- `/lottery status` — Pot size, your tickets, odds, time until draw
- `/lottery draw` — Admin: force an early draw (Manage Server)
- Auto-draw on a schedule; one random ticket wins the pot (5% house fee by default)

### PvP games
- `/challenge [user]` — Menu to pick a game, opponent, wager, and match format (use `user:@name` for reliable opponent lookup)
- `/rps challenge user amount [match]` — Rock Paper Scissors
- `/dice challenge user amount [match]` — 2-dice duel (higher total wins)
- `/roulette challenge user amount [match]` — Russian Roulette; take turns pulling the trigger
- `/coinflipduel challenge user amount side [match]` — Coinflip duel; challenger picks a side

**Match formats:** `Single game` (default) or `Best 2 of 3`  
Ties refund both players in a single game; ties replay the round in best-of-3.

### Admin (Manage Server permission required)
- `/give user amount [reason]` — Give currency
- `/take user amount [reason]` — Take currency

## Prerequisites

- [Bun](https://bun.sh) 1.x
- [Docker](https://www.docker.com/) (for Postgres)
- A [Discord application](https://discord.com/developers/applications) with a bot token

## Discord Setup

1. Create an application at https://discord.com/developers/applications
2. Go to **Bot** → create a bot and copy the token
3. Copy the **Application ID** (Client ID)
4. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands` scopes
5. Invite the bot to your server

### Bot installation (required for message rewards)

In the Developer Portal → **Installation**:

- Under **Guild Install**, enable the **`bot`** scope (not just `applications.commands`)
- Re-invite the bot if it was added with slash commands only

The bot needs **Guild Messages** (configured in code). Message Content intent is **not** required for coin rewards.

Ensure the bot role has **View Channel** and **Read Message History** in channels where users chat — without **View Channel**, Discord will not send message events to the bot (slash commands can still work).

**Server Members Intent** must be enabled in the Developer Portal (and is requested in code) for `/challenge` **Type username** lookup.

## Local Development

```bash
# Clone and install
cd AndBot
bun install

# Copy env and fill in Discord credentials
cp .env.example .env

# Start Postgres
docker compose up postgres -d

# Run migrations
bun run db:migrate

# Register slash commands (set GUILD_ID in .env for instant guild-scoped commands)
bun run register-commands

# Start the bot (stop the droplet bot first if using the same token)
bun run dev
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token |
| `CLIENT_ID` | Yes | — | Application ID |
| `POSTGRES_PASSWORD` | No | `postgres` | Postgres password (Docker Compose; keep in `.env` only) |
| `DATABASE_URL` | Yes | — | Postgres connection string (local CLI; password must match `POSTGRES_PASSWORD`) |
| `GUILD_ID` | No | — | Dev guild for instant command registration |
| `GUILD_COMMANDS_ONLY` | No | `false` | Register commands to `GUILD_ID` only (local dev) |
| `CURRENCY_NAME` | No | `coins` | Display name for currency |
| `STARTING_BALANCE` | No | `0` | Balance for new wallets |
| `DAILY_AMOUNT` | No | `500` | Daily claim base amount |
| `DAILY_STREAK_BONUS_PER_DAY` | No | `10` | Extra coins per streak day |
| `DAILY_MAX_PAYOUT` | No | `10000` | Daily claim cap |
| `WEEKLY_AMOUNT` | No | `2500` | Weekly claim amount |
| `MESSAGE_REWARD_AMOUNT` | No | `1` | Coins per rewarded message |
| `MESSAGE_REWARD_COOLDOWN_MS` | No | `30000` | Message reward cooldown |
| `MIN_BET` | No | `1` | Minimum wager/transfer |
| `MAX_BET` | No | `100000` | Maximum wager/transfer |
| `CHALLENGE_EXPIRY_MINUTES` | No | `5` | PvP challenge timeout |
| `LOTTERY_TICKET_PRICE` | No | `100` | Price per lottery ticket |
| `LOTTERY_DRAW_INTERVAL_DAYS` | No | `7` | Days between auto-draws |
| `LOTTERY_RAKE_PERCENT` | No | `5` | House fee on lottery pot |
| `BLACKJACK_SESSION_TIMEOUT_MINUTES` | No | `10` | Idle blackjack timeout |

Local Postgres (via Docker Compose) runs on port **5434**. Set the password once in `.env` — never edit `docker-compose.yml`:

```
POSTGRES_PASSWORD=your_local_password
DATABASE_URL=postgresql://postgres:your_local_password@localhost:5434/andbot
```

Changing `POSTGRES_PASSWORD` only affects a **new** database volume. To apply a new password to an existing local DB, run `docker compose down -v` first (destroys local data).

## Database

```bash
# Generate migration after schema changes
bun run db:generate

# Apply migrations
bun run db:migrate
```

## Production (DigitalOcean Droplet)

1. Provision an Ubuntu droplet (2 GB RAM recommended)
2. Install Docker and Docker Compose
3. Clone the repo and create `.env` with production values (including `POSTGRES_PASSWORD` — do not edit `docker-compose.yml` on the server)
4. Build and start:

```bash
docker compose up -d --build
```

5. Register commands (once, or after command changes):

```bash
docker compose run --rm bot bun run register-commands
```

The bot container runs migrations automatically on startup via `start:prod`.

### Routine updates

```bash
cd ~/AndBot
git pull origin main
docker compose up -d --build
docker compose run --rm bot bun run register-commands   # if commands changed
docker compose logs bot --tail 20
```

### Backups (recommended)

Add a nightly cron on the droplet:

```bash
docker compose exec postgres pg_dump -U postgres andbot > /backups/andbot-$(date +%F).sql
```

## Project Structure

```
src/
├── commands/       # Slash command handlers (casino, challenge, pvp, lottery, …)
├── services/       # Wallet, games, claims, lottery logic
├── handlers/       # Interaction router
├── db/             # Schema, migrations, client
├── bot/            # Discord client
└── utils/          # Shared helpers
```

## Testing

```bash
bun test
```

## License

Private — all rights reserved.
