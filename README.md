# Spirit Spin

Anime spinning-top battles, built phone-first for the browser. Swipe to launch, drag to steer (tilt if you want it), and tap to summon the spirit beast living in your top.

Play it at [spiritspin.sankalptripathi.tech](https://spiritspin.sankalptripathi.tech).

## What's inside

- `packages/core`: deterministic 60 Hz battle sim, match rules, progression
- `apps/client`: React + Three.js PWA
- `apps/server`: Fastify API, live battle rooms, Postgres or PGlite
- `edge`: Go realtime server (WebTransport with a WebSocket fallback, gRPC to the API)

Online battles use rollback netcode. Each phone runs the same simulation, the server only confirms inputs, and phones rewind and replay when they guessed wrong.

## Run it

```bash
npm ci
npm run dev -w apps/server
npm run dev -w apps/client
```

Art and audio aren't part of this repo.

## Test

```bash
npm run check
npm run edge:test
```
