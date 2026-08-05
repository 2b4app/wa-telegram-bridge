# AGENTS.md

WhatsApp → Telegram one-way message bridge. Single file: `src/index.ts` (the whole app). No tests, no linter, no build step — TypeScript is executed directly via `tsx`.

## Commands
- Run: `npm start` (or `node --import=tsx src/index.ts`). No build/test/lint commands exist.
- Standalone (not Docker): env vars are read strictly via `required()`, and WhatsApp auth is hard-bound to `/data/auth`, so set `AUTH_DIR`-equivalent path or run via Docker.
- Production: `docker compose up` — expects a `.env` file matching the vars in `docker-compose.yaml`.

## Environment (all required, app exits if missing)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `WHATSAPP_GROUP_JID` — full JID like `120363012345678901@g.us`
- `WHATSAPP_PHONE_NUMBER` — international, digits only
- Optional: `LOG_LEVEL` (pino); default `info`.

## Gotchas
- `@whiskeysockets/baileys` is pinned to an exact version (no `^`) and has no committed lockfile, so Docker resolves fresh on build. WhatsApp periodically deprecates the hardcoded client version baileys advertises, which manifests as an infinite reconnect loop with `"statusCode":405` ("client too old") during new-device pairing — NOT an IP/network block. Fix: bump the baileys pin in `package.json` and rebuild (there is no `npm run update`).
- WhatsApp session lives in `multi_file_auth_state` at `/data/auth`. `docker-compose.yaml` mounts a named volume `whatsapp-auth` there. Deleting auth logs the bridge out; re-pairing via log-printed pairing code from `requestPairingCode`.
- Only handles: plain text, image, and captions on image/video/document messages. Other message types print "Unsupported WhatsApp message type" and are skipped. `forwardMessage` in `src/index.ts` is the single place to add new media handling.
- Auto-reconnects on `connection.update` close unless `DisconnectReason.loggedOut`.
- Runs TypeScript with `tsx`; the Dockerfile copies only `package.json` + `src/` (no typecheck before `CMD`).