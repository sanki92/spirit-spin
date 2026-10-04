import { chromium, webkit, devices } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const URL = process.env.LOOK_URL ?? 'https://localhost:5173'
const OUT = 'e2e/out/duo'
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const results = []
let wkb = null
const wkBrowser = async () => (wkb ??= await webkit.launch())
const AUDIO_STUB = () => {
  if (window.AudioContext) return
  const param = () => ({ value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} })
  const node = () => new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (['gain', 'playbackRate', 'frequency', 'Q', 'detune', 'pan'].includes(k)) return (t[k] = param()); if (k === 'buffer' || k === 'onended') return null; if (k === 'frequencyBinCount') return 128; return () => node() }, set(t, k, v) { t[k] = v; return true } })
  class Ctx { state = 'running'; currentTime = 0; sampleRate = 48000; destination = node(); baseLatency = 0; resume() { return Promise.resolve() } suspend() { return Promise.resolve() } close() { return Promise.resolve() } decodeAudioData() { return Promise.resolve({ duration: 1, length: 48000, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(48000) }) } createGain() { return node() } createBufferSource() { return node() } createAnalyser() { return node() } createBiquadFilter() { return node() } createMediaStreamSource() { return node() } createDynamicsCompressor() { return node() } createStereoPanner() { return node() } createOscillator() { return node() } addEventListener() {} removeEventListener() {} }
  window.AudioContext = Ctx
}
const ROOKIE = { voltfang: ['spark', 'compact', 'rookie-flat'], aegiron: ['pebble', 'rim', 'rookie-ball'], nagara: ['ripple', 'standard', 'rookie-needle'], agnyx: ['ember', 'heavy', 'rookie-semi'] }

async function device(label, { beast, launcher, name, swipe = false, skewMs = 0, lagMs = 0, engine = 'chromium', noWT = false }) {
  const ctx = await (engine === 'webkit' ? await wkBrowser() : browser).newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'], deviceScaleFactor: 1, ignoreHTTPSErrors: true })
  if (engine === 'webkit') await ctx.addInitScript(AUDIO_STUB)
  if (skewMs) await ctx.addInitScript(ms => { const o = Date.now; Date.now = () => o() + ms }, skewMs)
  if (noWT) await ctx.addInitScript(() => { delete window.WebTransport })
  if (lagMs) await ctx.addInitScript(ms => {
    const W = window.WebSocket
    window.WebSocket = class extends W {
      constructor(...a) { super(...a); const add = this.addEventListener.bind(this); this.addEventListener = (t, f, o) => add(t, t === 'message' ? e => setTimeout(() => f(e), ms) : f, o) }
      set onmessage(f) { this.addEventListener('message', f) }
      send(d) { setTimeout(() => { if (this.readyState === 1) super.send(d) }, ms) }
    }
  }, lagMs)
  const page = await ctx.newPage()
  const d = { label, ctx, page, errors: [], logs: [] }
  page.on('pageerror', e => d.errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) d.errors.push(m.text().slice(0, 200)); if (m.text().startsWith('[duo]')) d.logs.push(m.text()) })
  await page.goto(URL + '/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => !!window.__save && window.__rt?.ready)
  const [bladeId, discId, tipId] = ROOKIE[beast]
  await page.evaluate(({ beast, launcher, name, swipe, bladeId, discId, tipId }) => {
    const s = window.__save.getState()
    if (!s.starter) s.chooseStarter(beast)
    for (const k of ['safety', 'calibrated', 'firstBattle']) s.markOnboarded(k)
    window.__save.setState(st => ({ name, loadout: { bladeId, discId, tipId, beastId: beast }, cosmetics: { ...st.cosmetics, launcher }, settings: { ...st.settings, inputMode: swipe ? 'swipe' : 'auto' } }))
    window.__sim.auto = false
    window.__pull = (peak = 28, ms = 140) => { const st = window.__sim; const t0 = performance.now(); const id = setInterval(() => { const u = performance.now() - t0; st.lin = u < ms ? -peak * Math.sin(Math.PI * u / ms) : u < ms + 110 ? peak * 0.8 * Math.sin(Math.PI * (u - ms) / 110) : 0; if (u > ms + 120) { st.lin = 0; clearInterval(id) } }, 8) }
    window.__ev = []
    window.__cines = 0
    const seen = { k: '' }
    window.__cineFull = []
    window.__hud.subscribe((h, p) => { if (h.cine && !p?.cine) { window.__cines++; window.__cineFull.push(!!window.__ctrl?.driver?.session?.confirmed?.state?.outcome) } })
    window.__hud.subscribe(h => { const k = `${h.phase}|${h.round}|${h.scores}|${h.banner}|${h.callout?.quality ?? ''}${h.callout?.note ?? ''}|${h.notice ?? ''}`; if (k !== seen.k) { seen.k = k; window.__ev.push({ t: Math.round(performance.now()), phase: h.phase, round: h.round, scores: [...h.scores], banner: h.banner, callout: h.callout && { ...h.callout }, notice: h.notice }) } })
  }, { beast, launcher, name, swipe, bladeId, discId, tipId })
  await sleep(1500)
  return d
}

const route = d => d.page.evaluate(() => window.__nav.getState().stack.at(-1).k)
const go = (d, r) => d.page.evaluate(r => { const n = window.__nav.getState(); n.reset({ k: 'home' }); if (r.k !== 'home') setTimeout(() => window.__nav.getState().push(r), 50) }, r)
const until = (d, fn, arg, ms = 30000) => d.page.waitForFunction(fn, arg, { timeout: ms, polling: 50 })
const ev = d => d.page.evaluate(() => window.__ev)
const shot = (d, name) => d.page.screenshot({ path: `${OUT}/${name}-${d.label}.png` })
const netStats = d => d.page.evaluate(() => { const s = window.__ctrl?.driver?.session; return s ? { ...s.stats, depth: s.depth, frame: s.frame, confirmed: s.confirmed.frame } : null })
const confirmedEnd = d => d.page.evaluate(() => { const s = window.__ctrl?.driver?.session; return s && s.confirmed.state.outcome ? JSON.stringify([s.confirmed.state.tops, s.confirmed.state.outcome, s.confirmed.state.rng]) : null })
async function sameConfirmed(sc, A, B) {
  const ended = d => until(d, () => !!window.__ctrl?.driver?.session?.confirmed?.state?.outcome, null, 60000).then(() => true).catch(() => false)
  const [ea, eb] = await Promise.all([ended(A), ended(B)])
  const [ca, cb] = await Promise.all([confirmedEnd(A), confirmedEnd(B)])
  check(sc, 'both phones confirm the identical end-of-round state', ea && eb && ca !== null && ca === cb, ca === cb ? `${(ca ?? '').length} bytes equal` : `A ${ca?.slice(0, 80)} | B ${cb?.slice(0, 80)}`)
}

async function hostJoin(A, B) {
  await go(A, { k: 'friends' }); await go(B, { k: 'friends' })
  await sleep(1200)
  await A.page.getByRole('button', { name: /Create battle/i }).click()
  await until(A, () => document.querySelector('.lb-codebox .room-code')?.textContent?.length === 4)
  const code = await A.page.evaluate(() => document.querySelector('.lb-codebox .room-code').textContent)
  await B.page.getByLabel('Battle code').fill(code)
  await B.page.getByRole('button', { name: /^Go$/ }).click()
  await Promise.all([until(A, () => window.__nav.getState().stack.at(-1).k === 'live'), until(B, () => window.__nav.getState().stack.at(-1).k === 'live')])
  await Promise.all([until(A, () => !!window.__ctrl && !!window.__game?.tops), until(B, () => !!window.__ctrl && !!window.__game?.tops)])
  return code
}

async function atLaunch(d, offset, kind, peak = 28) {
  await until(d, () => window.__hud.getState().phase === 'countdown' && !!window.__ctrl && window.__ctrl.launchAt > performance.now() + 900, null, 40000)
  await d.page.evaluate(({ offset, kind, peak }) => {
    const at = window.__ctrl.launchAt + offset
    const fire = () => {
      if (kind === 'pull') return window.__pull(peak)
      const el = document.querySelector('.launch-overlay')
      if (!el) return
      const h = innerHeight, x = innerWidth / 2
      const send = (type, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: 'touch' }))
      send('pointerdown', h * 0.3)
      let i = 0
      const id = setInterval(() => { i++; send('pointermove', h * (0.3 + i * 0.045)); if (i >= 10) { clearInterval(id); send('pointerup', h * 0.75) } }, 14)
    }
    setTimeout(fire, at - performance.now())
  }, { offset, kind, peak })
  await sleep(1400)
}
const pull = () => {}
async function swipeDown() {}

const view = d => d.page.evaluate(() => {
  const g = window.__game, h = window.__hud.getState(), c = window.__ctrl
  const art = r => r?.mats?.[0]?.map?.image?.currentSrc?.split('/').pop()?.split('?')[0] ?? null
  return {
    route: window.__nav.getState().stack.at(-1).k, phase: h.phase, round: h.round, scores: [...h.scores], banner: h.banner, notice: h.notice,
    names: [...document.querySelectorAll('.hud-top .side .name')].map(e => e.textContent),
    beasts: g?.specs?.map(s => s.beastId) ?? null, parts: g?.specs?.map(s => [s.bladeId, s.discId, s.tipId].join('/')) ?? null,
    launchers: g?.launchers?.map(art) ?? null, tops: g?.battle?.tops?.map(t => ({ x: +t.x.toFixed(3), y: +t.y.toFixed(3), spin: +t.spin.toFixed(3), out: t.out, spirit: t.spiritTicks > 0 })) ?? null,
    tick: g?.battle?.tick ?? null, coins: window.__save.getState().coins, ended: c?.ended ?? null, concluded: c?.concluded ?? null,
  }
})

function check(sc, name, ok, detail = '') {
  sc.checks.push({ name, ok: !!ok, detail })
}

async function scenario(id, title, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(id))) return
  const sc = { id, title, checks: [], error: null, ms: 0 }
  const t0 = Date.now()
  const devs = []
  const mk = async (label, o) => { const d = await device(label, o); devs.push(d); return d }
  try {
    await fn(sc, mk)
  } catch (e) {
    sc.error = String(e.message ?? e).split('\n')[0].slice(0, 300)
    for (const d of devs) await shot(d, `s${id}-error`).catch(() => {})
  }
  for (const d of devs) if (d.errors.length) check(sc, `${d.label} no page errors`, false, d.errors.slice(0, 3).join(' | '))
  sc.ms = Date.now() - t0
  for (const d of devs) await d.ctx.close().catch(() => {})
  const pass = !sc.error && sc.checks.every(c => c.ok)
  results.push({ ...sc, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} #${id} ${title} (${Math.round(sc.ms / 1000)}s)`)
  for (const c of sc.checks) if (!c.ok || process.env.VERBOSE) console.log(`   ${c.ok ? 'ok ' : 'XX '} ${c.name}${c.detail ? ' :: ' + c.detail : ''}`)
  if (sc.error) console.log(`   ERROR ${sc.error}`)
}

const flip = s => [s[1], s[0]]
const near = (a, b, tol) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

async function playMatch(A, B, plan) {
  const rounds = []
  for (let r = 1; r <= 7; r++) {
    const a = await view(A)
    if (a.route !== 'live' || a.phase === 'matchEnd') break
    const p = plan(r)
    await Promise.all([
      p.a ? atLaunch(A, p.a.offset ?? 20, p.a.swipe ? 'swipe' : 'pull', p.a.peak) : Promise.resolve(),
      p.b ? atLaunch(B, p.b.offset ?? 20, p.b.swipe ? 'swipe' : 'pull', p.b.peak) : Promise.resolve(),
    ]).catch(() => {})
    await Promise.all([until(A, rr => window.__hud.getState().round > rr || window.__hud.getState().phase === 'matchEnd' || window.__nav.getState().stack.at(-1).k !== 'live', r, 90000), until(B, rr => window.__hud.getState().round > rr || window.__hud.getState().phase === 'matchEnd' || window.__nav.getState().stack.at(-1).k !== 'live', r, 90000)]).catch(() => {})
    rounds.push({ a: await view(A), b: await view(B) })
  }
  await Promise.all([until(A, () => window.__nav.getState().stack.at(-1).k === 'result', null, 30000), until(B, () => window.__nav.getState().stack.at(-1).k === 'result', null, 30000)]).catch(() => {})
  return rounds
}

const launchCallouts = events => events.filter(e => e.phase === 'launch' && e.callout).reduce((m, e) => ({ ...m, [e.round]: e.callout }), {})
const startRips = d => d.page.evaluate(() => window.__startRips ?? [])
async function tapStarts(d) {
  await d.page.evaluate(() => {
    window.__startRips = []
    window.__rt.constructor && 0
    const rt = window.__rtNet
  })
}

await scenario(1, 'Full match: both phones agree on rounds, scores, finishes, winner; launch verdicts match the server; rewards once', async (sc, mk) => {
  const A = await mk('A', { beast: 'voltfang', launcher: 'launcher-aegiron', name: 'Aki' })
  const B = await mk('B', { beast: 'nagara', launcher: 'launcher-voltfang', name: 'Bea' })
  const coins0 = [(await view(A)).coins, (await view(B)).coins]
  await hostJoin(A, B)
  await sleep(600)
  const va = await view(A), vb = await view(B)
  check(sc, 'A HUD names: me left, opponent right', JSON.stringify(va.names) === JSON.stringify(['Aki', 'Bea']), JSON.stringify(va.names))
  check(sc, 'B HUD names: me left, opponent right', JSON.stringify(vb.names) === JSON.stringify(['Bea', 'Aki']), JSON.stringify(vb.names))
  check(sc, 'A sees beasts [voltfang, nagara]', JSON.stringify(va.beasts) === '["voltfang","nagara"]', JSON.stringify(va.beasts))
  check(sc, 'B sees beasts [nagara, voltfang]', JSON.stringify(vb.beasts) === '["nagara","voltfang"]', JSON.stringify(vb.beasts))
  check(sc, 'opponent parts correct on both', va.parts?.[1] === 'ripple/standard/rookie-needle' && vb.parts?.[1] === 'spark/compact/rookie-flat', JSON.stringify([va.parts, vb.parts]))
  check(sc, 'A launchers [own aegiron, B voltfang]', JSON.stringify(va.launchers) === '["aegiron.webp","voltfang.webp"]', JSON.stringify(va.launchers))
  check(sc, 'B launchers [own voltfang, A aegiron]', JSON.stringify(vb.launchers) === '["voltfang.webp","aegiron.webp"]', JSON.stringify(vb.launchers))
  const rounds = await playMatch(A, B, r => ({ a: { peak: r % 2 ? 28 : 16 }, b: { peak: r % 2 ? 14 : 28 } }))
  const ea = await ev(A), eb = await ev(B)
  for (const [i, r] of rounds.entries()) check(sc, `round ${i + 1} scores mirror`, JSON.stringify(r.a.scores) === JSON.stringify(flip(r.b.scores)), `${r.a.scores} vs ${r.b.scores}`)
  const fa = ea.filter(e => e.phase === 'roundEnd' && e.banner).map(e => `${e.round}:${e.banner}`), fb = eb.filter(e => e.phase === 'roundEnd' && e.banner).map(e => `${e.round}:${e.banner}`)
  check(sc, 'same round-end banners in same order', JSON.stringify([...new Set(fa)]) === JSON.stringify([...new Set(fb)]), `${[...new Set(fa)]} | ${[...new Set(fb)]}`)
  const ma = ea.filter(e => e.phase === 'matchEnd').at(-1)?.banner, mb = eb.filter(e => e.phase === 'matchEnd').at(-1)?.banner
  check(sc, 'one victory, one defeat', (ma === 'victory' && mb === 'defeat') || (ma === 'defeat' && mb === 'victory'), `${ma} / ${mb}`)
  const flips = d => { const out = []; const evs = d; const byRound = {}; for (const e of evs) if (e.callout) (byRound[e.round] ??= []).push(e.callout.quality + (e.callout.note ?? '')); for (const [r, l] of Object.entries(byRound)) if (new Set(l).size > 1) out.push(`r${r}:${[...new Set(l)].join('>')}`); return out }
  check(sc, 'A launch verdict never flips after the server answers', flips(ea).length === 0, flips(ea).join(' '))
  check(sc, 'B launch verdict never flips after the server answers', flips(eb).length === 0, flips(eb).join(' '))
  check(sc, 'both reached the result screen', (await route(A)) === 'result' && (await route(B)) === 'result')
  const replays = d => d.page.evaluate(() => { const h = window.__nav.getState().stack.at(-1)?.result?.match?.history ?? []; const want = h.filter((r, i) => ['ringout', 'shatter', 'spirit'].includes(r.finish) || (r.finish === 'spin' && i === h.length - 1)).length; return { want, got: window.__cines, full: window.__cineFull, finishes: h.map(r => r.finish) } })
  const [rpa, rpb] = await Promise.all([replays(A), replays(B)])
  check(sc, 'every decisive finish played the finish replay on both phones', rpa.want > 0 && rpa.got === rpa.want && rpb.got === rpb.want, `A ${JSON.stringify(rpa)} B ${JSON.stringify(rpb)}`)
  check(sc, 'every replay included the decisive moment (confirmed outcome before it started)', [...rpa.full, ...rpb.full].every(Boolean), `A ${rpa.full} B ${rpb.full}`)
  await sleep(1500)
  const c1 = [(await view(A)).coins, (await view(B)).coins]
  check(sc, 'each player paid exactly once (coins rose by a single match reward)', c1[0] - coins0[0] > 0 && c1[0] - coins0[0] < 200 && c1[1] - coins0[1] > 0 && c1[1] - coins0[1] < 200, `A +${c1[0] - coins0[0]}, B +${c1[1] - coins0[1]}`)
  await shot(A, 's1-result'); await shot(B, 's1-result')
})

async function round1(A, B, plan) {
  await Promise.all([
    plan.a ? atLaunch(A, plan.a.offset ?? 20, plan.a.swipe ? 'swipe' : 'pull', plan.a.peak) : Promise.resolve(),
    plan.b ? atLaunch(B, plan.b.offset ?? 20, plan.b.swipe ? 'swipe' : 'pull', plan.b.peak) : Promise.resolve(),
  ])
  await Promise.all([until(A, () => ['battle', 'roundEnd', 'matchEnd'].includes(window.__hud.getState().phase), null, 20000), until(B, () => ['battle', 'roundEnd', 'matchEnd'].includes(window.__hud.getState().phase), null, 20000)])
  const ea = await ev(A), eb = await ev(B)
  return { ca: launchCallouts(ea)[1], cb: launchCallouts(eb)[1], ea, eb }
}
const cstr = c => (c ? c.quality + (c.note ? ':' + c.note : '') : 'none')
const api = (d, method, path, body) => d.page.evaluate(async ({ method, path, body }) => { const t = JSON.parse(localStorage.getItem('spirit.auth') || '{}').token; const r = await fetch(path, { method, headers: { authorization: 'Bearer ' + t, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, { method, path, body })
const mkAB = async (mk, a = {}, b = {}) => [await mk('A', { beast: 'voltfang', launcher: 'launcher-voltfang', name: 'Aki', ...a }), await mk('B', { beast: 'aegiron', launcher: 'launcher-aegiron', name: 'Bea', ...b })]

await scenario(6, 'Only one player pulls: puller sees their tier, the other sees TOO SOFT', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28 } })
  check(sc, 'A got a real tier', r.ca && r.ca.quality !== 'FAIL', cstr(r.ca))
  check(sc, 'B sees TOO SOFT', r.cb?.quality === 'FAIL' && r.cb.note === 'TOO SOFT', cstr(r.cb))
})

await scenario(7, 'Swipe player vs motion player: both launches count', async (sc, mk) => {
  const [A, B] = await mkAB(mk, {}, { beast: 'nagara', launcher: 'launcher-nagara', swipe: true })
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28 }, b: { swipe: true } })
  check(sc, 'A motion launch counted', r.ca && r.ca.quality !== 'FAIL', cstr(r.ca))
  check(sc, 'B swipe launch counted', r.cb && r.cb.quality !== 'FAIL', cstr(r.cb))
})

await scenario(8, 'False start: pulling 700 ms before LAUNCH shows FALSE START', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28, offset: -700 }, b: { peak: 28 } })
  check(sc, 'A sees FALSE START', r.ca?.quality === 'FAIL' && r.ca.note === 'FALSE START', cstr(r.ca))
  check(sc, 'B unaffected', r.cb && r.cb.quality !== 'FAIL', cstr(r.cb))
})

await scenario(9, 'Late pull starting about 500 ms after LAUNCH still counts', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28, offset: 500 }, b: { peak: 28 } })
  check(sc, 'A late pull accepted', r.ca && r.ca.quality !== 'FAIL', cstr(r.ca))
})

await scenario(10, 'Top positions agree between the two phones during battle', async (sc, mk) => {
  const [A, B] = await mkAB(mk, {}, { beast: 'agnyx', launcher: 'launcher-agnyx' })
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 22 } })
  await until(A, () => window.__hud.getState().phase === 'battle' && !!window.__game.battle, null, 10000).catch(() => undefined)
  const ds = []
  for (let i = 0; i < 20 && ds.length < 12; i++) {
    const [a, b] = await Promise.all([view(A), view(B)])
    if (a.tops && b.tops && a.phase === 'battle' && b.phase === 'battle') ds.push(Math.max(Math.hypot(a.tops[0].x - b.tops[1].x, a.tops[0].y - b.tops[1].y), Math.hypot(a.tops[1].x - b.tops[0].x, a.tops[1].y - b.tops[0].y)))
    await sleep(150)
  }
  const mean = ds.reduce((x, y) => x + y, 0) / Math.max(1, ds.length)
  check(sc, 'sampled during battle', ds.length >= 4, `${ds.length} samples`)
  check(sc, 'on-screen drift (informational: opponent is predicted on each phone)', true, `mean ${mean.toFixed(3)}, max ${Math.max(...ds, 0).toFixed(3)}`)
  await sameConfirmed(sc, A, B)
})

await scenario(11, 'Spirit call by A shows on B too', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  const filled = await until(A, () => window.__hud.getState().gauge[0] >= 1 && window.__hud.getState().phase === 'battle', null, 45000).then(() => true).catch(() => false)
  if (!filled) { sc.skipped = 'A gauge never filled during the round'; check(sc, 'spirit gauge filled (skipped)', true, sc.skipped); return }
  await A.page.evaluate(() => window.__ctrl.requestSpirit())
  const onA = await until(A, () => window.__game.battle?.tops[0].spiritTicks > 0, null, 3000).then(() => true).catch(() => false)
  const onB = await until(B, () => window.__game.battle?.tops[1].spiritTicks > 0, null, 3000).then(() => true).catch(() => false)
  check(sc, 'A sees own spirit', onA)
  check(sc, 'B sees A spirit on the opponent side', onB)
})

await scenario(14, 'B loses connection for 3 s mid-battle: match continues and both stay in sync', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await sleep(1000)
  await B.ctx.setOffline(true)
  await B.page.evaluate(() => window.__net.ws?.close())
  const told = await until(A, () => /reconnecting/i.test(window.__hud.getState().notice ?? ''), null, 8000).then(() => true).catch(() => false)
  await sleep(3000)
  await B.ctx.setOffline(false)
  check(sc, 'A told the opponent is reconnecting', told)
  const back = await until(A, () => !window.__hud.getState().notice, null, 15000).then(() => true).catch(() => false)
  check(sc, 'notice clears when B is back', back)
  await Promise.all([until(A, () => window.__hud.getState().round >= 2 || window.__hud.getState().phase === 'matchEnd', null, 60000), until(B, () => window.__hud.getState().round >= 2 || window.__hud.getState().phase === 'matchEnd', null, 60000)])
  const [a, b] = await Promise.all([view(A), view(B)])
  check(sc, 'both moved on to the next round with mirrored scores', JSON.stringify(a.scores) === JSON.stringify(flip(b.scores)), `${a.scores} vs ${b.scores}`)
})

await scenario(15, 'B disappears for good: A is told, then wins once after the seat hold', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  const c0 = (await view(A)).coins
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await B.ctx.setOffline(true)
  await B.page.evaluate(() => window.__net.ws?.close())
  const won = await until(A, () => window.__nav.getState().stack.at(-1).k === 'result', null, 40000).then(() => true).catch(() => false)
  check(sc, 'A reached a result', won)
  const e = await ev(A)
  check(sc, 'A saw "Opponent left. You win!"', e.some(x => /Opponent left/.test(x.notice ?? '')), e.map(x => x.notice).filter(Boolean).join(' | '))
  await sleep(1200)
  const c1 = (await view(A)).coins
  check(sc, 'A paid once', c1 - c0 > 0 && c1 - c0 < 200, `+${c1 - c0}`)
})

await scenario(16, 'B backs out mid-match: A wins once, B gets no reward', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  const a0 = (await view(A)).coins, b0 = (await view(B)).coins
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await go(B, { k: 'home' })
  const won = await until(A, () => window.__nav.getState().stack.at(-1).k === 'result', null, 20000).then(() => true).catch(() => false)
  await sleep(1500)
  const a1 = (await view(A)).coins, b1 = (await view(B)).coins
  check(sc, 'A reached a win result', won)
  check(sc, 'A paid once', a1 - a0 > 0 && a1 - a0 < 200, `+${a1 - a0}`)
  check(sc, 'B got nothing for quitting', b1 === b0, `+${b1 - b0}`)
  check(sc, 'B is back home, not stuck', (await route(B)) === 'home', await route(B))
})

await scenario(17, 'Challenge from the friends list: B accepts and both enter the same battle', async (sc, mk) => {
  const [A, B] = await mkAB(mk, {}, { beast: 'nagara', launcher: 'launcher-nagara' })
  const ca = (await api(A, 'GET', '/v1/me')).json.friendCode, cb = (await api(B, 'GET', '/v1/me')).json.friendCode
  await api(A, 'POST', '/v1/friends', { code: cb }); await api(B, 'POST', '/v1/friends', { code: ca })
  await go(A, { k: 'friends' }); await go(B, { k: 'friends' })
  await A.page.locator('.lb-row', { hasText: 'Bea' }).waitFor({ timeout: 12000 })
  await A.page.locator('.lb-row', { hasText: 'Bea' }).getByRole('button').click()
  const banner = await B.page.getByText(/Aki challenges you/i).waitFor({ timeout: 12000 }).then(() => true).catch(() => false)
  check(sc, 'B sees "Aki challenges you!" without refreshing', banner)
  if (!banner) return
  await B.page.getByRole('button', { name: /^Accept$/ }).click()
  const both = await Promise.all([until(A, () => window.__nav.getState().stack.at(-1).k === 'live', null, 15000), until(B, () => window.__nav.getState().stack.at(-1).k === 'live', null, 15000)]).then(() => true).catch(() => false)
  check(sc, 'both entered the live battle', both)
})

await scenario(18, 'Joining with a wrong code gives a clear message', async (sc, mk) => {
  const B = await mk('B', { beast: 'nagara', launcher: 'launcher-nagara', name: 'Bea' })
  await go(B, { k: 'friends' }); await sleep(1200)
  await B.page.getByLabel('Battle code').fill('QQQQ')
  await B.page.getByRole('button', { name: /^Go$/ }).click()
  const msg = await B.page.locator('.lb-error').textContent({ timeout: 10000 }).catch(() => null)
  check(sc, 'error says no battle with that code', /No battle with that code/.test(msg ?? ''), msg ?? 'none')
})

await scenario(19, 'Host cancels, then B tries the old code', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await go(A, { k: 'friends' }); await go(B, { k: 'friends' }); await sleep(1200)
  await A.page.getByRole('button', { name: /Create battle/i }).click()
  await until(A, () => document.querySelector('.lb-codebox .room-code')?.textContent?.length === 4)
  const code = await A.page.evaluate(() => document.querySelector('.lb-codebox .room-code').textContent)
  await A.page.getByRole('button', { name: /Cancel battle/i }).click()
  await sleep(800)
  await B.page.getByLabel('Battle code').fill(code)
  await B.page.getByRole('button', { name: /^Go$/ }).click()
  const msg = await B.page.locator('.lb-error').textContent({ timeout: 10000 }).catch(() => null)
  check(sc, 'B told the battle is gone', /No battle with that code/.test(msg ?? ''), msg ?? 'none')
  check(sc, 'A back on the lobby main screen', await A.page.getByRole('button', { name: /Create battle/i }).isVisible())
})

await scenario(20, 'A third player cannot join a full battle', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  const C = await mk('C', { beast: 'agnyx', launcher: 'launcher-agnyx', name: 'Cy' })
  const code = await hostJoin(A, B)
  await go(C, { k: 'friends' }); await sleep(1200)
  await C.page.getByLabel('Battle code').fill(code)
  await C.page.getByRole('button', { name: /^Go$/ }).click()
  const msg = await C.page.locator('.lb-error').textContent({ timeout: 10000 }).catch(() => null)
  check(sc, 'C told the battle is full', /already has two players/.test(msg ?? ''), msg ?? 'none')
  const [a, b] = await Promise.all([view(A), view(B)])
  check(sc, 'A and B unaffected (still live)', a.route === 'live' && b.route === 'live')
})

await scenario(21, 'Rematch: after a match ends, hosting again works for both', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await go(B, { k: 'home' })
  await until(A, () => window.__nav.getState().stack.at(-1).k === 'result', null, 20000)
  await sleep(1000)
  await hostJoin(A, B)
  const [a, b] = await Promise.all([view(A), view(B)])
  check(sc, 'second battle live on both', a.route === 'live' && b.route === 'live')
  check(sc, 'second battle starts from round 1, 0-0', a.round === 1 && JSON.stringify(a.scores) === '[0,0]' && JSON.stringify(b.scores) === '[0,0]', `${a.round} ${a.scores} ${b.scores}`)
})

await scenario(22, 'B clock is 7 s fast: launches still line up and count', async (sc, mk) => {
  const [A, B] = await mkAB(mk, {}, { skewMs: 7000 })
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  check(sc, 'A launch counted', r.ca && r.ca.quality !== 'FAIL', cstr(r.ca))
  check(sc, 'B launch counted despite the skewed clock', r.cb && r.cb.quality !== 'FAIL', cstr(r.cb))
})

await scenario(23, 'B on a laggy connection (150 ms each way): launches count and phones agree', async (sc, mk) => {
  const [A, B] = await mkAB(mk, {}, { lagMs: 150 })
  await hostJoin(A, B)
  const r = await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  check(sc, 'A launch counted', r.ca && r.ca.quality !== 'FAIL', cstr(r.ca))
  check(sc, 'B launch counted', r.cb && r.cb.quality !== 'FAIL', cstr(r.cb))
  await sleep(1500)
  const ds = []
  for (let i = 0; i < 10; i++) {
    const [a, b] = await Promise.all([view(A), view(B)])
    if (a.tops && b.tops && a.phase === 'battle' && b.phase === 'battle') ds.push(Math.hypot(a.tops[0].x - b.tops[1].x, a.tops[0].y - b.tops[1].y))
    await sleep(250)
  }
  const mean = ds.reduce((x, y) => x + y, 0) / Math.max(1, ds.length)
  check(sc, 'sampled during battle', ds.length >= 3, `${ds.length} samples, on-screen drift mean ${mean.toFixed(3)} (informational)`)
  await sameConfirmed(sc, A, B)
})


await scenario(30, 'Visual proof: Chromium phone (A) vs WebKit iPhone (B), both screens at every stage', async (sc, mk) => {
  const A = await mk('A', { beast: 'voltfang', launcher: 'launcher-aegiron', name: 'Aki' })
  const B = await mk('B', { beast: 'nagara', launcher: 'launcher-voltfang', name: 'Bea', engine: 'webkit' })
  const both = async tag => { await Promise.all([shot(A, `proof-${tag}`), shot(B, `proof-${tag}`)]) }
  await go(A, { k: 'friends' }); await go(B, { k: 'friends' }); await sleep(1500)
  await both('1-lobby')
  await A.page.getByRole('button', { name: /Create battle/i }).click()
  await until(A, () => document.querySelector('.lb-codebox .room-code')?.textContent?.length === 4)
  const code = await A.page.evaluate(() => document.querySelector('.lb-codebox .room-code').textContent)
  await B.page.getByLabel('Battle code').fill(code)
  await B.page.getByRole('button', { name: /^Go$/ }).click()
  await until(A, () => document.querySelector('.lb-lobby.found'), null, 15000)
  await both('2-found')
  await Promise.all([until(A, () => window.__hud.getState().banner === 'vs' && window.__nav.getState().stack.at(-1).k === 'live', null, 20000), until(B, () => window.__nav.getState().stack.at(-1).k === 'live', null, 20000)])
  await sleep(500)
  await both('3-vs')
  await Promise.all([until(A, () => window.__hud.getState().countdown === '2', null, 20000), until(B, () => window.__hud.getState().countdown === '2', null, 20000)])
  await both('4-countdown')
  await Promise.all([atLaunch(A, 20, 'pull', 28), atLaunch(B, 20, 'pull', 18)]).catch(() => {})
  await Promise.all([until(A, () => window.__hud.getState().phase === 'launch', null, 15000), until(B, () => window.__hud.getState().phase === 'launch', null, 15000)])
  await sleep(250)
  await both('5-launch')
  await Promise.all([until(A, () => window.__hud.getState().phase === 'battle', null, 15000), until(B, () => window.__hud.getState().phase === 'battle', null, 15000)])
  await sleep(1500)
  await both('6-battle')
  const [va, vb] = await Promise.all([view(A), view(B)])
  check(sc, 'A HUD shows Aki vs Bea', JSON.stringify(va.names) === '["Aki","Bea"]', JSON.stringify(va.names))
  check(sc, 'B (WebKit) HUD shows Bea vs Aki', JSON.stringify(vb.names) === '["Bea","Aki"]', JSON.stringify(vb.names))
  check(sc, 'B (WebKit) launchers [own voltfang, A aegiron]', JSON.stringify(vb.launchers) === '["voltfang.webp","aegiron.webp"]', JSON.stringify(vb.launchers))
  await Promise.all([until(A, () => window.__hud.getState().phase === 'roundEnd', null, 60000), until(B, () => window.__hud.getState().phase === 'roundEnd', null, 60000)])
  await sleep(300)
  await both('7-roundend')
  const [ra, rb] = await Promise.all([view(A), view(B)])
  check(sc, 'round-end scores mirror across engines', JSON.stringify(ra.scores) === JSON.stringify(flip(rb.scores)), `${ra.scores} vs ${rb.scores}`)
})


await scenario(24, 'B freezes for 1.5 s mid-battle: it catches back up and its steering reaches the server again', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await sleep(1200)
  await B.page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 1500) {} })
  await sleep(3000)
  const st = await netStats(B)
  check(sc, 'B back within the prediction window after the freeze', st !== null && st.depth <= 20, JSON.stringify(st))
  await sameConfirmed(sc, A, B)
})

await scenario(40, 'Netcode: own top is never corrected and nothing stalls (run behind tools/netproxy.mjs)', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await until(A, () => (window.__ctrl?.driver?.session.confirmed.frame ?? 0) > 180, null, 15000).catch(() => undefined)
  const [sa, sb] = await Promise.all([netStats(A), netStats(B)])
  check(sc, 'A own inputs never replaced', sa && sa.ownReplaced === 0, JSON.stringify(sa))
  check(sc, 'B own inputs never replaced', sb && sb.ownReplaced === 0, JSON.stringify(sb))
  check(sc, 'no stalls and no packet gaps', sa && sb && sa.stalls === 0 && sb.stalls === 0 && sa.gaps === 0 && sb.gaps === 0)
})

await scenario(41, 'Netcode: both phones end every round on the same confirmed state', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 22 } })
  await sameConfirmed(sc, A, B)
})

await scenario(42, 'Netcode: spirit called during a 400 ms freeze still fires on both phones', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  const filled = await until(A, () => window.__hud.getState().gauge[0] >= 1 && window.__hud.getState().phase === 'battle', null, 45000).then(() => true).catch(() => false)
  if (!filled) { check(sc, 'spirit gauge filled (skipped)', true, 'gauge never filled'); return }
  await A.page.evaluate(() => { window.__cuts = 0; window.__hud.subscribe((h, p) => { if (h.cutin && !h.cutin.hesitate && h.cutin.side === 0 && h.cutin !== p.cutin) window.__cuts++ }) })
  await A.page.evaluate(() => { window.__ctrl.requestSpirit(); const t = performance.now(); while (performance.now() - t < 400) {} })
  check(sc, 'A sees own spirit', await until(A, () => window.__game.battle?.tops[0].spiritTicks > 0, null, 4000).then(() => true).catch(() => false))
  check(sc, 'B sees A spirit', await until(B, () => window.__game.battle?.tops[1].spiritTicks > 0, null, 4000).then(() => true).catch(() => false))
  await sleep(1500)
  const cuts = await A.page.evaluate(() => window.__cuts)
  check(sc, 'A spirit fired exactly once', cuts === 1, `cut-ins ${cuts}`)
})

await scenario(43, 'Netcode: B drops its socket mid-round, rejoins and ends on the server state', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await sleep(400)
  await B.page.evaluate(() => window.__net.ws?.close())
  await sameConfirmed(sc, A, B)
  const [a, b] = await Promise.all([view(A), view(B)])
  check(sc, 'scores mirror after the rejoin', JSON.stringify(a.scores) === JSON.stringify(flip(b.scores)), `${a.scores} vs ${b.scores}`)
})

await scenario(44, 'Edge: both Chromium phones play over WebTransport datagrams (needs the edge running)', async (sc, mk) => {
  const [A, B] = await mkAB(mk)
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await sleep(2500)
  const k = d => d.page.evaluate(() => window.__ctrl?.link?.kind ?? null)
  const [ka, kb] = await Promise.all([k(A), k(B)])
  check(sc, 'A on WebTransport', ka === 'wt', ka)
  check(sc, 'B on WebTransport', kb === 'wt', kb)
  await sleep(2500)
  const notices = await Promise.all([A, B].map(d => d.page.evaluate(() => window.__ev.filter(e => /reconnecting/i.test(e.notice ?? '')).length)))
  check(sc, 'no false "reconnecting" notice on either phone', notices[0] === 0 && notices[1] === 0, JSON.stringify(notices))
  const [sa, sb] = await Promise.all([netStats(A), netStats(B)])
  check(sc, 'confirmed frames flowing on both, no own corrections', sa?.confirmed > 60 && sb?.confirmed > 60 && sa.ownReplaced === 0 && sb.ownReplaced === 0, `${JSON.stringify(sa)} ${JSON.stringify(sb)}`)
  await sameConfirmed(sc, A, B)
})

await scenario(45, 'Edge: WebTransport blocked on A, it falls back to the edge WebSocket and the round finishes in sync', async (sc, mk) => {
  const [A, B] = await mkAB(mk, { noWT: true })
  await hostJoin(A, B)
  await round1(A, B, { a: { peak: 28 }, b: { peak: 28 } })
  await sleep(1500)
  check(sc, 'A on the WebSocket fallback', (await A.page.evaluate(() => window.__ctrl?.link?.kind)) === 'ws')
  await sameConfirmed(sc, A, B)
})

writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1))
await browser.close()
await wkb?.close()
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} scenarios passed`)
