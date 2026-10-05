import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

type W = Window & Record<string, any>
const ROUTES = ['home', 'garage', 'tower', 'collection', 'shop', 'journal', 'settings', 'friends', 'ranked', 'cups', 'pass', 'profile'] as const

test('main screens have no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'New player' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => !!(window as W).__save && (window as W).__rt?.ready)
  await page.evaluate(() => {
    const w = window as W
    w.__save.getState().chooseStarter('voltfang')
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
  })
  const report: string[] = []
  for (const k of ROUTES) {
    await page.evaluate(r => { const n = (window as W).__nav.getState(); n.reset({ k: 'home' }); if (r !== 'home') n.push({ k: r }) }, k)
    await page.waitForTimeout(900)
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    for (const v of res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')) report.push(`${k}: ${v.id} (${v.impact}) x${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`)
  }
  console.log(report.join('\n') || 'no serious violations')
  expect(report).toEqual([])
})
