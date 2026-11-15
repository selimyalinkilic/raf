# Raf hub (shared Telegram bot)

A tiny Cloudflare Worker so Raf users can connect Telegram with one tap instead of creating their own bot.
The bot token lives only here (a Worker secret). Each browser gets a random secret; the hub stores only its SHA-256.
Messages the user sends to the bot wait in D1 until their browser fetches them, then they're deleted
(anything older than 14 days is purged daily). The extension still supports "use my own bot" for people who prefer that.

Free-plan budget: the extension polls once a minute while Chrome is open (~1,440 requests/day per user),
so the Workers free plan (100k requests/day) covers roughly 60 always-on users. Beyond that: Workers Paid.

## Deploy

```sh
cd worker
npm i -D wrangler@4
export CLOUDFLARE_API_TOKEN=…   # token with "Workers Scripts: Edit" + "D1: Edit"
export CLOUDFLARE_ACCOUNT_ID=…
npx wrangler d1 create raf-hub              # put the printed database_id into wrangler.toml
npx wrangler d1 execute raf-hub --remote --file schema.sql
# set BOT_USERNAME in wrangler.toml (the bot from @BotFather, without @)
npx wrangler secret put BOT_TOKEN           # from @BotFather
npx wrangler secret put WEBHOOK_SECRET      # any long random string (letters, digits, _ and -)
npx wrangler deploy
curl "https://<your-worker-url>/setup?key=<WEBHOOK_SECRET>"   # points the bot's webhook at the worker
```

Then set `RAF_HUB` in `extension/tg.js` to the worker URL.

Bot profile photo (`docs/store/telegram-bot-photo.png`, 640×640, logo centred for the circle crop):
`curl -F 'photo={"type":"static","photo":"attach://p"}' -F p=@docs/store/telegram-bot-photo.png https://api.telegram.org/bot<TOKEN>/setMyProfilePhoto`

## Local test

`npx wrangler dev --var TG_API:http://127.0.0.1:8195 --var BOT_TOKEN:… --var WEBHOOK_SECRET:… --var BOT_USERNAME:…`
with a fake Bot API on :8195 — never test against the real Telegram.
