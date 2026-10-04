import { chromium, devices } from 'playwright'

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] })
const ctx = await browser.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto((process.env.LOOK_URL ?? 'https://localhost:5173') + '/?sim')
await page.getByRole('button', { name: 'Start' }).click()
await page.getByRole('button', { name: /continue/i }).click()
await page.getByText(/tap to ready/i).click()
await page.waitForFunction(() => !!window.__save && window.__rt?.ready)
await page.evaluate(() => { const s = window.__save.getState(); if (!s.starter) s.chooseStarter('voltfang'); for (const k of ['safety', 'calibrated', 'firstBattle']) s.markOnboarded(k); window.__sim.auto = true })
const B = { k: 'battle', opponent: { bladeId: 'pebble', discId: 'rim', tipId: 'rookie-ball', beastId: 'aegiron' }, floor: 1, boss: null, opponentName: 'Rookie' }
for (let i = 1; i <= Number(process.env.N ?? 6); i++) {
  await page.evaluate(r => { const n = window.__nav.getState(); n.reset({ k: 'home' }); setTimeout(() => window.__nav.getState().push(r), 50) }, B)
  await page.waitForFunction(() => window.__hud.getState().phase === 'battle' && window.__game?.battle, null, { timeout: 40000 })
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => {
    const r = window.__game.stage.renderer, gl = r.getContext()
    const same = window.__r0 ? window.__r0 === r : ((window.__r0 = r), 'first')
    const px = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return { geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs.length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), canvases: document.querySelectorAll('canvas').length, sameRenderer: same, lost: gl.isContextLost(), centerPixel: [...px] }
  })
  console.log(`battle ${i}`, JSON.stringify(m))
}
await page.screenshot({ path: 'e2e/out/mem-end.png' })
await browser.close()
