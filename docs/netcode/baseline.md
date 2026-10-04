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
