import { devices, expect, test, type Browser, type Page } from '@playwright/test'

type W = Window & Record<string, any>
const route = (p: Page) => p.evaluate(() => (window as W).__nav.getState().stack.at(-1))

async function phone(browser: Browser, name: string, beast: string): Promise<Page> {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  await page.goto('/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => !!(window as W).__save && (window as W).__rt?.ready)
  await page.waitForFunction(() => !!(window as W).__claimUsername && !!(window as W).__profile?.getState().loaded, null, { timeout: 15000 })
  await page.evaluate(() => (window as W).__claimUsername('T' + Math.random().toString(36).slice(2, 11)))
  await page.evaluate(([n, b]) => {
    const w = window as W
    w.__save.getState().chooseStarter(b)
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
    w.__save.setState({ name: n })
    w.__nav.getState().reset({ k: 'home' })
  }, [name, beast])
  await page.waitForTimeout(2500)
  return page
}

test('stadium mode: a big screen hosts, two phones join, the screen shows the match', async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const tv = await tvCtx.newPage()
  await tv.goto('/?stadium&sim')
  await tv.getByRole('button', { name: 'Start' }).click()
  await tv.getByRole('button', { name: /continue/i }).click()
  await tv.getByText(/tap to ready/i).click()
  await expect.poll(async () => (await route(tv)).k, { timeout: 10_000 }).toBe('stadium')
  await expect(tv.locator('.stadium-code')).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 })
  const code = (await tv.locator('.stadium-code').textContent())!.trim()
  await tv.waitForTimeout(800)
  await tv.screenshot({ path: 'e2e/out/stadium-lobby.png' })

  const a = await phone(browser, 'Aki', 'agnyx')
  const b = await phone(browser, 'Bo', 'aegiron')
  await a.evaluate(c => (window as W).__nav.getState().push({ k: 'friends', join: c }), code)
  await expect(a.getByText(/getting your battle ready/i)).toBeVisible({ timeout: 10_000 })
  await expect(tv.locator('.stadium-seat.in')).toHaveCount(1, { timeout: 10_000 })
  await b.evaluate(c => (window as W).__nav.getState().push({ k: 'friends', join: c }), code)
  for (const p of [a, b]) await expect.poll(async () => (await route(p)).k, { timeout: 15_000 }).toBe('live')
  await expect(tv.locator('.game-canvas')).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => tv.evaluate(() => (window as W).__game?.battle?.tick ?? 0), { timeout: 30_000, intervals: [250] }).toBeGreaterThan(30)
  const dropped = await tv.evaluate(() => {
    const w = window as W
    const round = w.__net.last('round')?.round ?? 0
    w.__launches = [] as number[]
    const launch = w.__game.launch.bind(w.__game)
    w.__game.launch = (t: unknown) => { w.__launches.push(w.__net.last('round')?.round ?? 0); launch(t) }
    w.__net.ws.close()
    return round
  })
  await expect.poll(async () => tv.evaluate(() => (window as W).__net.connected), { timeout: 10_000 }).toBe(true)
  await tv.waitForTimeout(1500)
  expect(await tv.evaluate(r => ((window as W).__launches as number[]).filter(x => x === r).length, dropped)).toBe(0)
  await tv.waitForTimeout(9000)
  await tv.screenshot({ path: 'e2e/out/stadium-battle.png' })
  await expect.poll(async () => (await route(a)).k, { timeout: 200_000, intervals: [2000] }).toBe('result')
  await expect(tv.locator('.stadium-code')).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 20_000 })
  expect((await tv.locator('.stadium-code').textContent())!.trim()).not.toBe(code)
})
