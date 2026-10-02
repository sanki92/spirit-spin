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
docker run -d --name spirit --env-file .env -p 8787:8787 spirit-spin
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
| `JWT_SECRET` | yes | 32+ random characters. Rotating it signs everyone out (players restore with their recovery code). |
| `DATABASE_URL` | yes | `postgres://…`. Migrations run on boot. Without it the server uses an embedded PGlite file, fine for a single small box. |
| `CORS_ORIGINS` | yes | Comma-separated origins allowed to call the API, e.g. `https://play.example.com`. |
| `STATIC_DIR` | yes in Docker | Set by the image to the built client. |
| `OPENAI_API_KEY` | no | Enables the Spirit Director (beast lines). Without it, beasts use the written line bank. Spend is capped at $3/day globally and 30 calls/day per player. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | no | Enables purchases. Without them the store shows "Purchases open soon". |
| `RAZORPAY_WEBHOOK_SECRET` | with Razorpay | Configure a webhook to `https://<host>/v1/store/webhook` for `payment.captured` and `order.paid`. |
| `DEV_TOOLS` | never in production | `1` turns on the dev payment provider, the loopback shutdown endpoint and the dev database self-heal. |

## 4. Reverse proxy and TLS

Serve over HTTPS (motion sensors and the microphone need a secure context). Forward WebSockets for `/rt`:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_read_timeout 75s;
}
```

The server trusts `X-Forwarded-For` for rate limiting, so keep it behind your proxy only.

## 5. Scaling notes

- Realtime rooms and the tournament lock live in one process. Run a single API instance; scaling out needs sticky routing by room code and a database lock on tournament rows.
- Static files under `/assets/*-<hash>.js|css` are cached for a year; everything else revalidates.
- The service worker precaches the app shell only; art loads on demand and is cached by the browser.

## 6. Health and logs

- `GET /healthz` returns `{ ok, time, rooms }`.
- Logs are JSON (pino) on stdout. Every Spirit Director call is recorded in the `ai_calls` table with tokens and cost.
