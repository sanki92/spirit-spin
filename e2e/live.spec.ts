import { expect, test, type Browser, type Page } from '@playwright/test'

type W = Window & Record<string, any>

async function player(browser: Browser, name: string, beast: string): Promise<Page> {
  const ctx = await browser.newContext({ ...test.info().project.use, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log(`[${name}] pageerror`, e.message))
  await page.goto('/?sim')
  await expect(async () => {
    await page.mouse.click(180, 400)
    await expect(page.getByRole('button', { name: /continue/i }).or(page.getByText(/tap to ready/i))).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  if (await page.getByRole('button', { name: /continue/i }).isVisible()) await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => (window as W).__save && (window as W).__nav && (window as W).__net && (window as W).__rt?.ready)
  await page.waitForFunction(() => !!(window as W).__claimUsername && !!(window as W).__profile?.getState().loaded, null, { timeout: 15000 })
  await page.evaluate(() => (window as W).__claimUsername('T' + Math.random().toString(36).slice(2, 11)))
  await page.evaluate(([n, b]) => {
    const w = window as W
    const s = w.__save.getState()
    if (!s.starter) s.chooseStarter(b)
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
    w.__save.setState({ name: n })
    w.__nav.getState().reset({ k: 'home' })
  }, [name, beast])
  await page.locator('.h3-daily').waitFor({ timeout: 3000 }).then(() => page.keyboard.press('Escape')).catch(() => undefined)
  await page.getByRole('button', { name: /game mode/i }).click()
  await page.getByRole('radio', { name: /live battle/i }).click()
  await expect(page.getByRole('button', { name: /friend battle/i })).toBeVisible()
  return page
}

const route = (p: Page) => p.evaluate(() => (window as W).__nav.getState().stack.at(-1))

test('two phones play a full live match', async ({ browser }) => {
  const a = await player(browser, 'Aki', 'voltfang')
  const b = await player(browser, 'Bo', 'nagara')

  await a.getByRole('button', { name: /friend battle/i }).click()
  await a.getByRole('button', { name: /create battle/i }).click()
  const code = (await a.locator('.room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{4}$/)
  await a.getByRole('button', { name: 'Show QR' }).click()
  await expect(a.locator('.qr')).toBeVisible()

  await b.getByRole('button', { name: /friend battle/i }).click()
  await b.getByLabel('Battle code').fill(code.toLowerCase())
  await b.getByRole('button', { name: /^go$/i }).click()

  await expect.poll(async () => (await route(a)).k, { timeout: 15_000 }).toBe('live')
  await expect.poll(async () => (await route(b)).k, { timeout: 15_000 }).toBe('live')
  await a.screenshot({ path: 'e2e/out/a-battle.png' }).catch(() => undefined)

  await expect.poll(async () => (await route(a)).k, { timeout: 200_000, intervals: [2000] }).toBe('result')
  await expect.poll(async () => (await route(b)).k, { timeout: 20_000 }).toBe('result')
  const ra = await route(a), rb = await route(b)
  expect(ra.result.winner).not.toBe(rb.result.winner)
  expect(ra.result.match.scores).toEqual([rb.result.match.scores[1], rb.result.match.scores[0]])
  const stats = await a.evaluate(() => (window as W).__ctrl?.driver?.session.stats ?? null)
  console.log('A result', JSON.stringify(ra.result.match.scores), 'B', JSON.stringify(rb.result.match.scores), 'stats', JSON.stringify(stats))
  await a.screenshot({ path: 'e2e/out/a-result.png' })
  await b.screenshot({ path: 'e2e/out/b-result.png' })
  await a.evaluate(() => { (window as W).__net.reset(); (window as W).__nav.getState().reset({ k: 'home' }); (window as W).__nav.getState().push({ k: 'social' }) })
  await expect(a.locator('.sc-id b')).toHaveText(/^[A-Z2-9]{6}$/, { timeout: 10_000 })
  await a.screenshot({ path: 'e2e/out/a-friends.png' })
})
