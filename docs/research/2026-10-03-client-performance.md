# Client performance & latency rules (research 2026-10-03)

Budgets (mid Android / iPhone): 16.7 ms frame (sim ≤2, JS submit ≤4, GPU ≤10); draw calls ≤50 / ≤100; texture VRAM ≤64 / ≤128 MB; ≤10–15 shader programs; JS initial ≤250 KB gz; zero per-frame allocations; net up 30–60 Hz ≤32 B, down 30 Hz ≤200 B; Colyseus patchRate ≤33 ms.

1. `renderer.setAnimationLoop`, fixed-step accumulator capped ~4 steps, interpolate.
2. No per-frame allocation: scratch vectors, typed arrays, pooled particles/events/messages.
3. `await renderer.compileAsync(scene, camera)` + 2–3 warm-up frames behind loading; never change materials/defines mid-match.
4. `renderer.initTexture(tex)` for all textures before the match; ImageBitmapLoader decode.
5. Particles via few `InstancedMesh` (write `instanceMatrix`, set `count`); additive fade via instance color.
6. Dynamic resolution: DPR 0.6–1.5 by moving-average frame time with hysteresis (down 1 s, up 3 s).
7. No MSAA on low tier; no real-time shadows (blob decals); Lambert/Basic materials, 1–2 lights; NoToneMapping on low/mid.
8. WebGLRenderer in 2026 (WebGPURenderer slower CPU/first frame on r183).
9. Pointer Events + `touch-action:none`; handlers only write latest input; sample once per tick.
10. DeviceMotion ~60 Hz; one-pole filter tilt; rip via ring-buffer window.
11. iPhone rAF ≈ 60 Hz; never assume a rate.
12. HUD per-frame values bypass React (refs + textContent/transform, zustand transient subscribe).
13. HUD animation transform/opacity only; no backdrop-filter over canvas; limit layers.
14. Single-threaded sim (< 2 ms); avoid SharedArrayBuffer/COOP-COEP.
15. One AudioContext (interactive) resumed on tap; decode upfront; schedule ahead; resume on visibilitychange.
16. Mic only for shout window; iOS play-and-record attenuates playback.
17. Tier at boot (60 or locked 30); adapt: lower DPR → fewer particles → lock 30. Pause when hidden.
18. Network: compact binary inputs, redundant last 2–3 inputs per packet; WebSocket first, WebTransport upgrade (Colyseus 0.17); NTP-style clock sync; adaptive 1–3 tick input buffer.
19. KTX2 (ETC1S color / UASTC UI) for GPU textures; WebP only for DOM images.
20. SW precache shell + first-match assets only (≤5–8 MB); runtime-cache the rest.

Measure: in-game overlay (rAF p50/p95/p99, frames >20 ms, draw calls, programs, DPR), LoAF observer (Chromium), real-device soak 15 min, 240 fps video input-to-photon.
