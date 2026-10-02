# Library decisions (research 2026-10-03)

| Area | Use | Avoid |
|---|---|---|
| Post FX | none on low/mid (additive sprite glow); `postprocessing ~6.39` high tier only (pins three <0.187) | EffectComposer+UnrealBloom |
| Particles | custom InstancedMesh pools | three-nebula (churn); three.quarks only if editor needed |
| GPU textures | KTX2 (ETC1S color / UASTC UI) via KTX2Loader; `ktx2-encoder` or gltf-transform+toktx | WebP for GPU textures (no VRAM saving) |
| Audio | raw Web Audio, resume on tap + visibilitychange, handle iOS "interrupted" | Howler (stale), Tone.js (huge) |
| UI animation | CSS/WAAPI transform+opacity; optional `motion ^13.5` for exit anims | react-spring |
| HUD state | zustand + transient subscribe + direct DOM writes | signals-react |
| Realtime | `colyseus ^0.18.9` server + `@colyseus/sdk ^0.18.4`; WebSocket default, WebTransport opt-in (Safari 26.4+ baseline) | colyseus.js (stops at 0.16), geckos.io |
| Server | fastify 5, `@fastify/rate-limit`, `jose` (shared REST + room auth), zod 4 + fastify-type-provider-zod 7, pino (built in) | extra loggers |
| DB | drizzle-orm 0.45 + drizzle-kit (first-party PGlite driver), pg in prod | — |
| Tests | vitest (+ browser-playwright), @playwright/test with Pixel 7 / iPhone 15 profiles | — |
| PWA | vite-plugin-pwa 1.3, precache shell + first arena only | precaching everything |
| Gestures | native Pointer Events + DeviceMotion | @use-gesture (stale) |
| Perf | stats-gl (dev), web-vitals, rollup-plugin-visualizer, sendBeacon frame samples | r3f-perf |
