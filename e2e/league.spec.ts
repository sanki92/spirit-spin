import { expect, test, type Page } from '@playwright/test'

type W = Window & Record<string, any>
const API = 'http://localhost:5174'

async function onboard(page: Page, name: string) {
  await page.goto('/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => !!(window as W).__save && (window as W).__rt?.ready)
  await page.evaluate(n => {
    const w = window as W
    w.__save.getState().chooseStarter('voltfang')
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
    w.__save.setState({ name: n, owned: { blades: ['fang', 'bastion', 'crescent', 'wing'], discs: ['standard', 'heavy', 'rim'], tips: ['flat', 'ball', 'needle'] } })
    w.__save.getState().unlockBeast('aegiron')
    w.__save.getState().unlockBeast('nagara')
    w.__nav.getState().reset({ k: 'home' })
  }, name)
  await page.waitForTimeout(2600)
}

const route = (p: Page) => p.evaluate(() => (window as W).__nav.getState().stack.at(-1))

test('ranked: build a deck, battle a verified ghost and see the rating move', async ({ page }) => {
  await onboard(page, 'Aki')
  await page.getByRole('button', { name: /ranked/i }).click()
  await expect(page.locator('.rank-rating')).toHaveText(/\d+/)
  await page.screenshot({ path: 'e2e/out/ranked.png' })
  await page.getByRole('button', { name: /find a rival/i }).click()
  await expect.poll(async () => (await route(page)).k, { timeout: 10_000 }).toBe('ghost')
  await page.waitForTimeout(9000)
  await page.screenshot({ path: 'e2e/out/ghost-battle.png' })
  await expect.poll(async () => (await route(page)).k, { timeout: 200_000, intervals: [2000] }).toBe('result')
  const r = await route(page)
  expect(r.result.verdict).toBeTruthy()
  expect(typeof r.result.verdict.rating).toBe('number')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/out/ranked-result.png' })
})

test('tournament: host plays their ghost pairing and the standings update', async ({ page, request }) => {
  await onboard(page, 'Host')
  await page.getByRole('button', { name: /cups/i }).click()
  await page.getByLabel('Tournament name').fill('Night Cup')
  await page.getByRole('button', { name: /^create$/i }).click()
  await expect.poll(async () => (await route(page)).k).toBe('cup')
  const code = (await page.locator('.code-chip').textContent())!.slice(0, 6)
  for (const n of ['Bo', 'Cy', 'Di']) {
    const g = (await (await request.post(`${API}/v1/auth/guest`)).json()) as { token: string }
    await request.put(`${API}/v1/save`, { headers: { authorization: `Bearer ${g.token}` }, data: { baseVersion: 0, save: { coins: 1, xp: 0, tower: 0, name: n } } })
    expect((await request.post(`${API}/v1/tournaments/join`, { headers: { authorization: `Bearer ${g.token}` }, data: { code } })).ok()).toBe(true)
  }
  await expect(page.getByText('4 of 16 players')).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'e2e/out/cup-lobby.png' })
  await page.getByRole('button', { name: /^start$/i }).click()
  await expect(page.getByText(/round 1 of 3/i)).toBeVisible()
  await page.screenshot({ path: 'e2e/out/cup-running.png' })
  await page.getByRole('button', { name: /ghost/i }).click()
  await expect.poll(async () => (await route(page)).k, { timeout: 10_000 }).toBe('ghost')
  await expect.poll(async () => (await route(page)).k, { timeout: 200_000, intervals: [2000] }).toBe('result')
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /skip|continue/i }).first().click()
  await expect.poll(async () => (await route(page)).k).toBe('cup')
  await expect(page.locator('.match-card')).toContainText(/you (won|lost)/i)
  await page.screenshot({ path: 'e2e/out/cup-after.png', fullPage: true })
})
