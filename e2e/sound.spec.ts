import { expect, test } from '@playwright/test'

type W = Window & Record<string, any>

test('battle plays the new countdown, crowd, clash and announcer sounds', async ({ page }) => {
  const errors: string[] = []
  const fetched = new Set<string>()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('requestfinished', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/assets/audio/')) fetched.add(u.pathname.replace(/\.[0-9a-f]{8}\.mp3$/, '')) })
  await page.addInitScript(() => {
    const w = window as W
    w.__starts = []
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: number[]) {
      w.__starts.push({ dur: +(this.buffer?.duration ?? 0).toFixed(2), loop: this.loop })
      return start.apply(this, a as [])
    }
  })
  await page.goto('/?sim')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'New player' }).click()
  await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const w = window as W
    w.__save.getState().chooseStarter('voltfang')
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
  })
  await page.evaluate(() => {
    const n = (window as W).__nav.getState()
    n.reset({ k: 'home' })
    n.push({ k: 'battle', opponent: { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' }, floor: 1, boss: null, opponentName: 'Sound Check' })
  })
  await page.waitForTimeout(25_000)
  const starts = await page.evaluate(() => (window as W).__starts as { dur: number; loop: boolean }[])
  console.log('fetched', [...fetched].sort().join(' '))
  console.log('starts', starts.length, 'loops', starts.filter(s => s.loop).length)
  console.log('errors', errors.join(' | '))
  expect(errors.filter(e => !/favicon|ERR_CONNECTION|WebSocket|Failed to load resource/.test(e))).toEqual([])
  for (const id of ['/assets/audio/count-0', '/assets/audio/go-0', '/assets/audio/crowdCalm-0', '/assets/audio/vo/count-3']) expect([...fetched]).toContain(id)
  expect(starts.filter(s => s.loop).length).toBeGreaterThanOrEqual(3)
  expect(starts.length).toBeGreaterThan(10)
})
