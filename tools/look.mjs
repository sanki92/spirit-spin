import { chromium, devices } from 'playwright'

const [, , out = 'e2e/out/look', ...steps] = process.argv
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const dev = process.env.LOOK_DEVICE ? devices[process.env.LOOK_DEVICE] : devices['Pixel 7']
const ctx = await browser.newContext({ ...dev, ignoreHTTPSErrors: true, ...(process.env.LOOK_H ? { viewport: { width: 390, height: Number(process.env.LOOK_H) } } : {}) })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)) })
await page.goto((process.env.LOOK_URL ?? 'https://localhost:5173') + '/?sim')
await page.getByRole('button', { name: 'Start' }).click()
await page.getByRole('button', { name: /continue/i }).click()
await page.getByText(/tap to ready/i).click()
await page.waitForFunction(() => !!window.__save && window.__rt?.ready)
await page.evaluate(() => {
  const s = window.__save.getState()
  if (!s.starter) s.chooseStarter('voltfang')
  for (const k of ['safety', 'calibrated', 'firstBattle']) s.markOnboarded(k)
})
let n = 0
for (const step of steps) {
  const [kind, ...rest] = step.split(':')
  const arg = rest.join(':')
  if (kind === 'js') await page.evaluate(arg)
  else if (kind === 'go') await page.evaluate(r => { const nav = window.__nav.getState(); nav.reset({ k: 'home' }); const o = JSON.parse(r); if (o.k !== 'home') nav.push(o) }, arg)
  else if (kind === 'click') await page.getByRole(arg.split('=')[0], { name: new RegExp(arg.split('=')[1], 'i') }).first().click()
  else if (kind === 'text') await page.getByText(new RegExp(arg, 'i')).first().click()
  else if (kind === 'wait') await page.waitForTimeout(Number(arg))
  else if (kind === 'until') await page.waitForFunction(arg, null, { timeout: 180000, polling: 50 })
  else if (kind === 'drag') { const [x1, y1, x2, y2] = arg.split(',').map(Number); await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 12 }); await page.mouse.up() }
  else if (kind === 'shot') { await page.screenshot({ path: `${out}-${arg || ++n}.png`, fullPage: false }); console.log('shot', `${out}-${arg || n}.png`) }
  else if (kind === 'full') { await page.screenshot({ path: `${out}-${arg || ++n}.png`, fullPage: true }); console.log('shot', `${out}-${arg || n}.png`) }
  else if (kind === 'scroll') await page.evaluate(y => document.querySelector('.page')?.scrollTo(0, Number(y)), arg)
}
await browser.close()
