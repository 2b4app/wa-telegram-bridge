# wa-telegram-bridge

One-way message bridge from a WhatsApp group to a Telegram chat. When a member
posts a text or media message in the configured WhatsApp group, the bridge
forwards it to a Telegram chat as `<name>`.

## How it works

- Listens to a WhatsApp group via [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web protocol).
- Sends messages to a Telegram chat via [grammY](https://grammy.dev/).
- Runs as a single TypeScript file (`src/index.ts`) executed directly with `tsx` — no build step.

## Requirements

- Node.js 22+ (or Docker).
- A phone number with WhatsApp (used to link the paired session).
- A Telegram bot token and the chat (or channel) to forward into.

## Configuration

All configuration is via environment variables. Create a `.env` file (see
`.env.sample`) with:

| Variable | Description |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | Destination chat / channel id, e.g. `-1001234567890`. |
| `WHATSAPP_GROUP_JID` | Full WhatsApp group JID, e.g. `120363012345678901@g.us`. |
| `WHATSAPP_PHONE_NUMBER` | The phone number to link as device, international digits only, e.g. `380501234567`. |
| `LOG_LEVEL` | Optional. pino log level, default `info`. |

Any missing required variable causes the app to exit.

### Getting the WhatsApp group JID

On startup, once connected, the bridge logs every group it participates in:

```
"msg":"Group","jid":"120363012345678901@g.us","name":"My Group","isConfigured":true
```

Find your group by name and copy its `jid` into `WHATSAPP_GROUP_JID`. The line
with `"isConfigured":true` marks the currently configured group.

## Setup

### 1. Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Add the bot to the destination chat/channel and note its id for `TELEGRAM_CHAT_ID`.
   - For a channel: `@getidsbot` or the bot's `getMe()` username on startup, plus chat id.

### 2. WhatsApp pairing

On first run the bridge prints a pairing code in the logs. On your phone:

**WhatsApp → Settings → Linked Devices → Link a device → Link with phone number**, then enter the code.

The linked session is stored in `/data/auth` and reused on restarts. Deleting
that directory logs the bridge out and requires re-pairing.

### 3. Run

Standalone:

```sh
npm start
```

The auth directory is hard-coded to `/data/auth`, so for local (non-Docker)
use you must run in an environment where `/data/auth` is writable (e.g.
`sudo` or via Docker).

Production (recommended):

```sh
cp .env.sample .env   # fill in values
docker compose up -d
```

`docker-compose.yaml` mounts a named volume `whatsapp-auth` at `/data/auth`, so
the session persists across container restarts.

## Supported message types

- Plain text
- Image (`imageMessage`), with caption
- Captions on video and document messages

Other message types are skipped and logged as `Unsupported WhatsApp message type`.

## Project layout

- `src/index.ts` — entire application. `forwardMessage` is where media handling lives.
- `Dockerfile`, `docker-compose.yaml` — container setup.
- No tests, linter, or build step in this repo.