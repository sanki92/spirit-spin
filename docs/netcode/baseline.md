# Netcode baseline (2026-10-04)

Measured with `tools/netreport.mjs` on real device logs (`.local/device-logs/2026-10-04.jsonl`), commit f27075b, snapshot/reconcile model (server-authoritative, JSON snaps every 3 ticks over WebSocket).

## Current model, iPhone on a phone hotspot (`IP=172.20.10`, 89 samples of 5 s)

| metric | p50 | p95 | max |
|---|---|---|---|
| maxCorr (arena units, own+opponent snap) | 0.053 | 0.693 | 0.98 |
| avgCorr | 0.0085 | 0.055 | 0.072 |
| doubled ticks / 5 s | 2 | 133 | 214 |
| skipped ticks / 5 s | 0 | 142 | 244 |
| lag (input lead, ticks) | 2.4 | 5.2 | 372 |

## Current model, localhost bot (`IP=::1`, 247 samples)

| metric | p50 | p95 | max |
|---|---|---|---|
| maxCorr | 0.014 | 0.157 | 0.951 |
| doubled / 5 s | 0 | 12 | 92 |
| skipped / 5 s | 0 | 2 | 18 |

Reading: on the phone the p95 correction is 0.69 arena units (a third of the arena radius) and the client doubles or skips 130+ ticks per 5 s: the visible lag and "top moves on its own".

## Rollback over WebSocket, 150 ms / 30 ms (tools/netproxy.mjs, two Chromium phones, duo 1,10,11,14,23 all pass)

| metric | p50 | p95 | max |
|---|---|---|---|
| own inputs replaced | 0 | 0 | 0 |
| stalls | 0 | 0 | 0 |
| packet gaps | 0 | 0 | 0 |
| prediction depth at round end (frames) | 8 | 8 | 8 |
| max prediction depth (frames) | 19 | 29 | 29 |
| margin (ms, target 64-70) | 83 | 98 | 98 |
| measured RTT / jitter (ms) | 186 / 5 | 188 / 8 | |

Compared with the old model on the iPhone (p95 correction 0.69 arena units, 130+ doubled or skipped ticks per 5 s): the player's own top is never corrected and time never jumps.

## Phase-1 gate (commit 7415ee5)

- `npm run check`: typecheck + 254 workspace tests pass.
- Core soak `npm run soak`: 1,000+ simulated matches across lan, criteria (150 ms RTT, 30 ms jitter, 5% loss), 300 ms spikes, phone hotspot 30 vs 60 fps, uneven 85/320 ms one-way, ordered TCP: zero desyncs; zero own-input corrections and zero stalls on criteria.
- duo through the 150/30 proxy: 18 scenarios incl. 40-43 pass.
- duo on a plain connection: 23/23 pass, including the WebKit iPhone visual proof (#30).

## Soak (Phase 3, 2026-10-04)

| run | result |
|---|---|
| core `npm run soak` (1,000+ virtual matches, 6 profiles incl. criteria and uneven 85/320 ms) | 6/6 pass, 0 desyncs, 0 own-input corrections on criteria |
| edge load test, 500 concurrent matches, redundant feeders | 88,505 frames, 0 missing inputs, tick pass < 1 ms |
| full stack via Go edge, 40 bot matches | 40/40 finished, 87 rounds, 0 desyncs, 0 fallbacks, 0 lost, 0 stream drops |
| full stack via Go edge with faults (5% drop, +60 ms, ±30 ms jitter on edge→phone) | 20/20 finished, 58 rounds, 0 desyncs, 0 late inputs |
| full stack in-process (no edge), 20 bot matches | 20/20 finished, 45 rounds, 0 desyncs |
