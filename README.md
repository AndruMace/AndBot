# AndBot

Discord economy bot with virtual currency, house gambling (coinflip, blackjack), PvP wagering (rock-paper-scissors, dice duels), and admin tools.

Built with **Bun**, **discord.js**, **Drizzle ORM**, and **PostgreSQL**.

## Features

### Economy
- `/balance [user]` — Check wallet balance
- `/daily` — Claim daily free currency (24h cooldown)
- `/weekly` — Claim weekly free currency (7d cooldown)
- `/pay user amount` — Send currency to another user

### House Games (PvE)
- `/coinflip amount side:heads|tails` — 50/50 coinflip against the house
- `/blackjack amount` — Interactive blackjack with Hit / Stand / Double buttons

### PvP Games
- `/rps challenge user amount` — Rock Paper Scissors wager
- `/dice challenge user amount` — Dice duel (roll d6, higher wins)

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

# Start the bot
bun run dev
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token |
| `CLIENT_ID` | Yes | — | Application ID |
| `DATABASE_URL` | Yes | — | Postgres connection string |
| `GUILD_ID` | No | — | Register commands to one guild (faster dev) |
| `CURRENCY_NAME` | No | `coins` | Display name for currency |
| `STARTING_BALANCE` | No | `0` | Balance for new wallets |
| `DAILY_AMOUNT` | No | `500` | Daily claim amount |
| `WEEKLY_AMOUNT` | No | `2500` | Weekly claim amount |
| `MIN_BET` | No | `1` | Minimum wager/transfer |
| `MAX_BET` | No | `100000` | Maximum wager/transfer |
| `CHALLENGE_EXPIRY_MINUTES` | No | `5` | PvP challenge timeout |
| `BLACKJACK_SESSION_TIMEOUT_MINUTES` | No | `10` | Idle blackjack timeout |

Local Postgres (via Docker Compose) runs on port **5434**:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/andbot
```

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
3. Clone the repo and create `.env` with production values
4. Build and start:

```bash
docker compose up -d --build
```

5. Register commands (once, or after command changes):

```bash
docker compose run --rm bot bun run register-commands
```

The bot container runs migrations automatically on startup via `start:prod`.

### Backups (recommended)

Add a nightly cron on the droplet:

```bash
docker compose exec postgres pg_dump -U postgres andbot > /backups/andbot-$(date +%F).sql
```

### Updates

```bash
git pull
docker compose up -d --build
```

## Project Structure

```
src/
├── commands/       # Slash command handlers
├── services/       # Wallet, games, claims logic
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
