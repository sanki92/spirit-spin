# Realtime stack: deployment

How live battles run in production: the Node API (rooms, rips, results) plus the Go edge (input sequencing over QUIC datagrams). No Docker.

## Topology

One region is one VM:

| Process | Listens on | Public? | Role |
|---|---|---|---|
| Caddy | TCP 80/443 | yes | TLS, the PWA, `/v1`, `/rt` WebSocket, `/edge/*` → edge WebSocket fallback |
| API (`apps/server`) | 127.0.0.1:8787 | no | accounts, rooms, rips, verification, results, `/__dev/net` dashboard |
| Edge (`edge/cmd/edge`) | UDP 4433 | yes | WebTransport datagrams (the fast path) |
| Edge WebSocket fallback | 127.0.0.1:4434 | via Caddy `/edge/ws` | same binary protocol over TCP when UDP is blocked |
| Edge gRPC | 127.0.0.1:4435 | no | Node drives matches and receives confirmed frames |
| Edge metrics | 127.0.0.1:4436 | no | Prometheus `/metrics`, `/healthz` |

Players are matched within the region they connect to. Start with one VM in Mumbai (`ap-south-1` or the equivalent at your provider): most players are in India. To add a region, deploy the same VM behind its own hostname. Each region is self-contained.

## Firewall

Open TCP 80, TCP 443 and UDP 4433. Everything else stays on loopback.

## Certificates

- Caddy obtains and renews its own certificate for `play.example.com`.
- WebTransport needs a publicly trusted certificate on the edge. The `serverCertificateHashes` path is for development only, with a self-signed cert valid for at most 14 days. Use certbot on the same hostname:

  ```bash
  certbot certonly --webroot -w /var/lib/caddy -d play.example.com --deploy-hook "systemctl restart spirit-edge"
  chgrp -R spirit /etc/letsencrypt/live /etc/letsencrypt/archive
  chmod -R g+rX /etc/letsencrypt/live /etc/letsencrypt/archive
  ```

- The restart is safe. On SIGTERM the edge drains: it refuses new matches, so Node runs those rounds in-process, then waits until live matches end (`-drain 10m`), then exits. `TimeoutStopSec=660` gives it that time.

## Environment

Generate secrets with `openssl rand -base64 32`. Never commit them.

`/etc/spirit/edge.env`:

```
RT_EDGE_SECRET=<shared secret, 16+ chars>
```

`/etc/spirit/api.env`, in addition to the existing API variables (`NODE_ENV=production`, `JWT_SECRET`, `RECOVERY_PEPPER`, `CORS_ORIGINS`, `TRUST_PROXY=loopback`, `STATIC_DIR=apps/client/dist`, `DATABASE_URL`, ...):

```
RT_EDGE_GRPC=127.0.0.1:4435
RT_EDGE_SECRET=<same shared secret>
RT_EDGE_WT=https://play.example.com:4433/wt
RT_EDGE_WS=/edge/ws
RT_EDGE_METRICS=http://127.0.0.1:4436/metrics
NET_DASH_KEY=<random, to open the dashboard remotely>
```

If `RT_EDGE_GRPC` is unset, the API runs every round in-process over the `/rt` WebSocket. That is the same netcode with TCP instead of UDP.

## Build and install

```bash
GOOS=linux GOARCH=amd64 npm run edge:build
scp dist/edge vm:/opt/spirit/edge

ssh vm
cd /opt/spirit/app && git pull && npm ci
npm run build -w @spirit/client
sudo cp deploy/spirit-edge.service deploy/spirit-api.service /etc/systemd/system/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now spirit-edge spirit-api
sudo systemctl reload caddy
```

Stop the API with `systemctl stop spirit-api` (SIGTERM). It closes PGlite cleanly. Never `kill -9` it.

## Health and dashboards

- `curl 127.0.0.1:4436/healthz` should print `ok`.
- `curl -s 127.0.0.1:4436/metrics | grep ^edge_` shows matches, sessions, packets, late inputs, missing inputs and rounds.
- `https://play.example.com/__dev/net?key=$NET_DASH_KEY` shows rounds, desyncs, edge fallbacks, stream drops and edge losses, plus p50/p95 of late inputs, missing inputs and margins.
- Raise an alert when any of these happens:
  - `desyncs > 0` (should never happen; every case is logged at error level as `net.desync`)
  - `edge lost > 0`
  - `edge fallbacks` keeps rising (the edge is down or refusing)
  - `edge_late_inputs_total` grows faster than about 1% of `edge_packets_in_total` (players' clocks or networks are struggling)

## Failure behaviour

| Event | What players see |
|---|---|
| Edge down at round start | The round runs in-process on the API: same game over TCP. `edge.fallback` is logged. |
| Edge crash mid-round (stream lost for ~5 s) | That match ends with "Connection lost. The match ended without a result." `edge.lost` is logged. |
| Planned edge restart | It drains, so no round is cut. |
| UDP blocked on a player's network | Their phone falls back to the edge WebSocket within 1.5 s. |
| Phone loses the edge briefly | It reconnects with backoff. The edge resends from the phone's last ack, up to 150 frames per packet. |
| Phone backgrounded | The edge keeps confirming. On return the phone jumps to the confirmed state, and its opponent saw "reconnecting" after 2 s. |
| Phone silent for longer than the seat hold | Forfeit, as before. |
| API restart mid-match | Rooms are in memory, so live matches end. The edge reaps orphaned matches after 2 min. |

## Local development

```bash
npm run edge -- -hosts localhost,127.0.0.1,<LAN IP>
RT_EDGE_GRPC=127.0.0.1:4435 DEV_TOOLS=1 npm start -w apps/server
npm run dev -w @spirit/client
```

- Vite proxies `/rt` to the API and `/edge` to the edge WebSocket.
- `RT_TARGET=ws://localhost:8788` routes `/rt` through `tools/netproxy.mjs` to add latency, jitter, loss and spikes.
- Stop the dev API with `curl -X POST localhost:8787/__dev/shutdown`.
- Useful checks:
  - `npm run check`
  - `npm run edge:test`
  - `npm run soak -w @spirit/core`
  - `node tools/duo.mjs`
  - `MATCHES=20 npx tsx tools/soak-stack.ts`
