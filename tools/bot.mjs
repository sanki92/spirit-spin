import { chromium, devices } from 'playwright'

const URL = process.env.LOOK_URL ?? 'https://localhost:5173'
const MATCHES = Number(process.env.MATCHES ?? 3)
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
page.on('pageerror', e => say('PAGEERROR', e.message.slice(0, 200)))
page.on('console', m => { const t = m.text(); if (t.startsWith('[bot]')) say(t.slice(6)); else if (m.type() === 'error' && !/Failed to load resource/.test(t)) say('CONSOLE', t.slice(0, 200)) })
await page.goto(URL + '/?sim')
await page.getByRole('button', { name: 'Start' }).click()
await page.getByRole('button', { name: 'New player' }).click()
await page.getByRole('button', { name: /continue/i }).click()
await page.getByText(/tap to ready/i).click()
await page.waitForFunction(() => !!window.__save && window.__rt?.ready)
await page.evaluate(() => {
  const s = window.__save.getState()
  if (!s.starter) s.chooseStarter('agnyx')
  for (const k of ['safety', 'calibrated', 'firstBattle']) s.markOnboarded(k)
  window.__save.setState(st => ({ name: 'Bot', loadout: { bladeId: 'ember', discId: 'heavy', tipId: 'rookie-semi', beastId: 'agnyx' }, cosmetics: { ...st.cosmetics, launcher: 'launcher-agnyx' } }))
  window.__sim.auto = false
  window.__pull = (peak = 26, ms = 140) => { const st = window.__sim; const t0 = performance.now(); const id = setInterval(() => { const u = performance.now() - t0; st.lin = u < ms ? -peak * Math.sin(Math.PI * u / ms) : u < ms + 110 ? peak * 0.8 * Math.sin(Math.PI * (u - ms) / 110) : 0; if (u > ms + 120) { st.lin = 0; clearInterval(id) } }, 8) }
  let last = '', la = 0
  window.__hud.subscribe(h => {
    const k = `${h.phase}|${h.round}|${h.scores}|${h.banner ?? ''}|${h.callout ? h.callout.quality + (h.callout.note ? ':' + h.callout.note : '') + ' ' + h.callout.rpm : ''}|${h.notice ?? ''}`
    if (k === last) return
    last = k
    if (h.phase !== 'battle' || h.notice) console.log('[bot] hud', `phase=${h.phase} round=${h.round} score(me-you)=${h.scores.join('-')}${h.banner ? ' banner=' + h.banner : ''}${h.callout ? ' myLaunch=' + h.callout.quality + (h.callout.note ? ':' + h.callout.note : '') + ' ' + h.callout.rpm : ''}${h.notice ? ' notice="' + h.notice + '"' : ''}`)
  })
  setInterval(() => {
    const c = window.__ctrl, h = window.__hud.getState()
    if (c && h.phase === 'countdown' && c.launchAt !== la && c.launchAt > performance.now()) {
      la = c.launchAt
      const peak = 18 + Math.random() * 12, off = 10 + Math.random() * 60
      setTimeout(() => window.__pull(peak), c.launchAt - performance.now() + off)
    }
    const g = window.__game?.battle
    if (g && h.phase === 'battle') {
      const me = g.tops[0], you = g.tops[1]
      const dx = you.x - me.x, dy = you.y - me.y, d = Math.hypot(dx, dy) || 1
      window.__sim.g = { x: -(dx / d) * 2.6, y: 7 + (dy / d) * 2.6, z: 6.5 }
    } else window.__sim.g = { x: 0, y: 7, z: 6.5 }
  }, 50)
  const wire = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')
  Object.defineProperty(WebSocket.prototype, 'onmessage', { set(f) { wire.set.call(this, e => { const s = String(e.data); const k = (s.match(/"k":"([a-z]+)"/) || [])[1]; if (k === 'start') { const m = JSON.parse(s); console.log('[bot] server start round', m.round, 'rips(host,guest)=', m.rips.map(r => (r.ok ? r.quality + ' ' + r.rpm : 'FAIL:' + r.reason)).join(' | ')) } else if (k === 'end') { const m = JSON.parse(s); console.log('[bot] server end round', m.round, 'finish', m.outcome.finish, 'winnerSide', m.outcome.winner, 'scores(host,guest)', m.scores.join('-'), m.winner !== null ? 'MATCH WINNER side ' + m.winner : '') } else if (k === 'peer') { const m = JSON.parse(s); console.log('[bot] peer', m.name, m.build.beastId, m.build.launcher ?? '(no launcher)', 'online=' + m.online) } else if (k === 'error' || k === 'left') console.log('[bot] server', s.slice(0, 160)); f(e) }) }, get() { return wire.get.call(this) } })
})

for (let n = 1; n <= MATCHES; n++) {
  await page.evaluate(() => { const nav = window.__nav.getState(); nav.reset({ k: 'home' }); setTimeout(() => window.__nav.getState().push({ k: 'friends' }), 50) })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Create battle/i }).click()
  await page.waitForFunction(() => document.querySelector('.lb-codebox .room-code')?.textContent?.length === 4, null, { timeout: 20000 })
  const code = await page.evaluate(() => document.querySelector('.lb-codebox .room-code').textContent)
  say(`=== MATCH ${n}: BATTLE CODE ${code} === (open Live battle > Join battle, type ${code})`)
  await page.waitForFunction(() => window.__nav.getState().stack.at(-1).k === 'live', null, { timeout: 15 * 60 * 1000 })
  say('opponent joined, battle loading')
  await page.waitForFunction(() => window.__nav.getState().stack.at(-1).k !== 'live', null, { timeout: 15 * 60 * 1000 })
  const r = await page.evaluate(() => { const st = window.__nav.getState().stack.at(-1); return st.k === 'result' ? { route: 'result', winner: st.result.winner, scores: st.result.match.scores, best: st.result.bestRpm, perfect: st.result.perfectRips } : { route: st.k } })
  say('match over', JSON.stringify(r))
  await page.waitForTimeout(3000)
}
await browser.close()
