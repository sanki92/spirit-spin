# Deploying Spirit Spin

One container serves everything: the PWA (static files), the REST API (`/v1`), the realtime socket (`/rt`) and the health check (`/healthz`). Postgres holds players, saves, ghosts, tournaments and entitlements.

## 1. Build the assets (once per art change)

The generated art and audio live in `assets/` and are compiled into `apps/client/public/assets` (git-ignored):

```bash
python tools/build_assets.py
python tools/build_audio.py
```

## 2. Build and run

```bash
docker build -t spirit-spin .
docker run -d --name spirit --env-file .env -p 127.0.0.1:8787:8787 spirit-spin
```

Without Docker:

```bash
npm ci
cd apps/client && npx vite build && cd ../..
STATIC_DIR=apps/client/dist NODE_ENV=production npm start -w apps/server
```

## 3. Environment

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | yes | 32+ random characters. Rotating it signs everyone out; their apps sign back in automatically with the stored recovery code. |
| `RECOVERY_PEPPER` | yes | 32+ random characters used to hash recovery codes. Never rotate it: every recovery code depends on it. |
| `DATABASE_URL` | yes | `postgres://…`. Migrations run on boot. Without it the server uses an embedded PGlite file, fine for a single small box. |
| `CORS_ORIGINS` | yes | Comma-separated origins allowed to call the API, e.g. `https://play.example.com`. The server refuses to start in production without it. |
| `TRUST_PROXY` | no | Which hop may set `X-Forwarded-For`. Default `loopback` (a proxy on the same host). Use `false` if nothing sits in front. |
| `STATIC_DIR` | yes in Docker | Set by the image to the built client. |
| `OPENAI_API_KEY` | no | Enables the Spirit Director (beast lines). Without it, beasts use the written line bank. Spend is capped at $3/day globally and 30 calls/day per player. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | no | Enables purchases. Without them the store shows "Purchases open soon". |
| `RAZORPAY_WEBHOOK_SECRET` | with Razorpay | Configure a webhook to `https://<host>/v1/store/webhook` for `payment.captured` and `order.paid`. |
| `DEV_TOOLS` | never in production | `1` turns on the dev payment provider, the loopback shutdown endpoint and the dev database self-heal. The server refuses to start with it in production. |

## 4. Reverse proxy and TLS

Serve over HTTPS (motion sensors and the microphone need a secure context). Forward WebSockets for `/rt`:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_read_timeout 75s;
}
```

Rate limits key on the client address from `X-Forwarded-For`, trusted only from your proxy. Publish the container port on `127.0.0.1` so nothing reaches it except the proxy. Inside Docker the host proxy arrives from the bridge gateway, not loopback: set `TRUST_PROXY=172.17.0.1` (your bridge gateway) or run the container with `--network host` and keep `loopback`.

## 5. Scaling notes

- Realtime rooms and the tournament lock live in one process. Run a single API instance; scaling out needs sticky routing by room code and a database lock on tournament rows.
- Static files under `/assets/*-<hash>.js|css` are cached for a year; everything else revalidates.
- The service worker precaches the app shell only; art loads on demand and is cached by the browser.

## 6. Health and logs

- `GET /healthz` returns `{ ok, time, rooms }`.
- Logs are JSON (pino) on stdout. Every Spirit Director call is recorded in the `ai_calls` table with tokens and cost.
