import { expect, test } from '@playwright/test'

type W = Window & Record<string, any>

test('awakening reveals the new form and the beast speaks', async ({ page }) => {
  await page.goto('/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => !!(window as W).__save && (window as W).__rt?.ready)
  await page.evaluate(() => {
    const w = window as W
    w.__save.getState().chooseStarter('nagara')
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
    const b = w.__save.getState().beasts.nagara
    w.__save.getState().setBeast({ ...b, trust: 72, respect: 66, battles: 14, calm: 6, counters: { ...b.counters, comebacks: 1 }, memories: [{ at: '2026-10-01', text: 'We came back from 0-3 against Brick.', importance: 4, tags: ['comeback'] }] })
    w.__nav.getState().reset({ k: 'awaken' })
  })
  await expect(page.locator('.aw-base')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/out/awaken-before.png' })
  await page.getByRole('button', { name: /^awaken$/i }).click()
  await expect(page.locator('.awaken-speech p')).not.toHaveText('…', { timeout: 15_000 })
  await expect(page.locator('.awaken-speech p')).toHaveText(/\w{3,}/)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/out/awaken-after.png' })
  const mem = await page.evaluate(() => (window as W).__save.getState().beasts.nagara.memories[0])
  expect(mem).toMatchObject({ importance: 5, tags: ['awakening'] })
  expect(await page.evaluate(() => (window as W).__save.getState().beasts.nagara.awakened)).toBeTruthy()
  await page.getByRole('button', { name: /continue/i }).click()
  await expect.poll(() => page.evaluate(() => (window as W).__nav.getState().stack.at(-1).k)).toBe('home')
})
