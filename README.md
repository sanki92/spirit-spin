# Spirit Spin

An original anime spinning-top battle game for the mobile web. Your phone is the launcher: rip it to launch, tilt to steer, shout to summon the spirit beast living in your top. Beasts remember your battles and grow into awakened forms shaped by how you play.

## What's in the box

| Area | Where | Highlights |
|---|---|---|
| Deterministic core | `packages/core` | 60 Hz battle sim (no trig, seeded RNG), rip scoring, match rules, beast growth, Tower, quests, ghosts, replay verification, league pairings, store catalog |
| Client (PWA) | `apps/client` | React UI + imperative Three.js, motion/swipe rip, tilt, shout, commentator, live/ranked/tournament/stadium modes, Spirit Pass, share cards |
| Server | `apps/server` | Fastify REST + WebSocket rooms, PGlite/Postgres, guest auth + recovery codes, Spirit Director (OpenAI, capped), ranked Elo, tournaments, Razorpay entitlements |
| Art & audio | `assets/`, `tools/` | Generated art (OpenAI image models), Kenney CC0 sounds, voiced commentator lines |
| Specs & plans | `docs/` | Product design, phase plans with rulings, research, deploy guide |

## Run it locally

```bash
npm ci
python tools/build_assets.py && python tools/build_audio.py
# API (dev tools on: dev payments, clean restart endpoint)
DEV_TOOLS=1 npm run dev -w apps/server
# client over HTTPS for phones on the same Wi-Fi (sensors need a secure context)
cd apps/client && npx vite --host
```

Open `https://<your-lan-ip-with-dashes>.sslip.io:5173` on the phone. `?sim` adds a motion simulator on desktop. `?stadium` turns a laptop or TV into the stadium screen.

Restart the dev API with `curl -X POST localhost:8787/__dev/shutdown` (never hard-kill it on Windows; the embedded database dislikes it).

## Test

```bash
npx vitest run --root packages/core    # sim, rules, ghosts, league
npx vitest run --root apps/server      # API, realtime, ranked, tournaments, store
npx vitest run --root apps/client
npx playwright test                    # two-phone live match, ranked, tournament, stadium, pass, awakening, a11y, screen captures
```

The Playwright suite needs the API on `:8787` and the client on `:5174` (`HTTP_ONLY=1 npx vite --port 5174`).

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md).
