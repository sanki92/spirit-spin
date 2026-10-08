import { expect, test, type Browser, type Page } from '@playwright/test'

type W = Window & Record<string, any>

async function player(browser: Browser, name: string, beast: string): Promise<Page> {
  const ctx = await browser.newContext({ ...test.info().project.use, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log(`[${name}] pageerror`, e.message))
  await page.goto('/?sim')
  await expect(async () => {
    await page.mouse.click(180, 400)
    if (await page.getByRole('button', { name: 'New player' }).isVisible()) await page.getByRole('button', { name: 'New player' }).click()
    await expect(page.getByRole('button', { name: /continue/i }).or(page.getByText(/tap to ready/i))).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  if (await page.getByRole('button', { name: /continue/i }).isVisible()) await page.getByRole('button', { name: /continue/i }).click()
  await page.getByText(/tap to ready/i).click()
  await page.waitForFunction(() => (window as W).__save && (window as W).__nav && (window as W).__net && (window as W).__rt?.ready)
  await page.waitForFunction(() => !!(window as W).__claimUsername && !!(window as W).__profile?.getState().loaded, null, { timeout: 15000 })
  await expect.poll(() => page.evaluate(() => (window as W).__claimUsername('T' + Math.random().toString(36).slice(2, 11)).then((r: { ok: boolean }) => r.ok)), { timeout: 15_000 }).toBe(true)
  await page.evaluate(([n, b]) => {
    const w = window as W
    const s = w.__save.getState()
    if (!s.starter) s.chooseStarter(b)
    for (const k of ['safety', 'calibrated', 'firstBattle']) w.__save.getState().markOnboarded(k)
    w.__save.setState({ name: n })
    w.__nav.getState().reset({ k: 'home' })
  }, [name, beast])
  await page.locator('.h3-daily').waitFor({ timeout: 1500 }).then(() => page.keyboard.press('Escape')).catch(() => undefined)
  await page.getByRole('button', { name: /game mode/i }).click()
  await page.getByRole('radio', { name: /live battle/i }).click()
  await expect(page.getByRole('button', { name: /friend battle/i })).toBeVisible()
  return page
}

const route = (p: Page) => p.evaluate(() => (window as W).__nav.getState().stack.at(-1))

const HITCH_MS = 700

test('a spirit called in a live match summons on both phones for its full length and both stay in sync', async ({ browser }) => {
  test.setTimeout(480_000)
  const a = await player(browser, 'Aki', 'voltfang')
  const b = await player(browser, 'Bo', 'nagara')

  await a.getByRole('button', { name: /friend battle/i }).click()
  await a.getByRole('button', { name: /create battle/i }).click()
  const code = (await a.locator('.room-code').textContent())!.trim()
  await b.getByRole('button', { name: /friend battle/i }).click()
  await b.getByLabel('Battle code').fill(code.toLowerCase())
  await b.getByRole('button', { name: /^go$/i }).click()
  await expect.poll(async () => (await route(a)).k, { timeout: 15_000 }).toBe('live')
  await expect.poll(async () => (await route(b)).k, { timeout: 15_000 }).toBe('live')
  for (const p of [a, b]) await p.waitForFunction(() => !!(window as W).__ctrl?.driver, null, { timeout: 60_000 })

  for (const [p, hitch] of [[a, HITCH_MS], [b, 0]] as const) await p.evaluate(hitch => {
    const w = window as W
    w.__seen = []
    w.__spans = []
    let prev: unknown = null
    w.__hud.subscribe((s: any) => {
      if (s.summon === prev) return
      const now = performance.now()
      if (s.summon !== null && w.__seen.at(-1) !== s.summon) w.__seen.push(s.summon)
      if (prev === null) {
        w.__spans.push({ from: now, to: null })
        if (hitch) { while (performance.now() - now < hitch); w.__spans.at(-1).from = performance.now(); hitch = 0 }
      } else if (s.summon === null) w.__spans.at(-1).to = now
      prev = s.summon
    })
  }, hitch)

  let pressed: unknown = null
  for (let attempt = 0; attempt < 8 && !pressed; attempt++) {
    const at = await a.waitForFunction(() => {
      const w = window as W, b = w.__game?.battle, btn = document.querySelector('.spirit-btn') as HTMLButtonElement | null
      if (!b || !btn || w.__hud.getState().phase !== 'battle' || b.tops[0].gauge < 1 || b.tops[1].spiritTicks > 0) return false
      const viaButton = btn.classList.contains('ready') && !btn.disabled
      if (viaButton) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true }))
      else w.__ctrl.requestSpirit()
      return { round: w.__ctrl.startedRound, tick: b.tick, viaButton }
    }, null, { timeout: 180_000, polling: 16 }).then(h => h.jsonValue())
    const landed = await a.waitForFunction(() => {
      const s = (window as W).__ctrl?.driver?.session.confirmed.state
      return s?.pausedTicks > 0 ? 'spirit' : !s || s.outcome ? 'missed' : false
    }, null, { timeout: 15_000, polling: 16 }).then(h => h.jsonValue())
    console.log('press', attempt, JSON.stringify(at), landed)
    if (landed === 'spirit') pressed = at
  }
  expect(pressed, 'a press landed in the sim before its round ended').not.toBeNull()

  for (const p of [a, b]) await p.waitForFunction(() => (window as W).__spans[0]?.to != null, null, { timeout: 10_000 })
  const seenA = await a.evaluate(() => (window as W).__seen)
  const seenB = await b.evaluate(() => (window as W).__seen)
  const spansA = await a.evaluate(() => (window as W).__spans)
  const spansB = await b.evaluate(() => (window as W).__spans)
  const shown = (s: { from: number; to: number }[]) => Math.round(s[0]!.to - s[0]!.from)
  console.log('summon seen A', JSON.stringify(seenA), 'B', JSON.stringify(seenB), 'shown ms A', shown(spansA), 'B', shown(spansB))
  expect(seenA[0]).toBe(0)
  expect(seenB[0]).toBe(1)
  expect(shown(spansA)).toBeGreaterThanOrEqual(800)
  expect(shown(spansB)).toBeGreaterThanOrEqual(800)

  await expect.poll(async () => (await route(a)).k, { timeout: 300_000, intervals: [2000] }).toBe('result')
  await expect.poll(async () => (await route(b)).k, { timeout: 20_000 }).toBe('result')
  const ra = await route(a), rb = await route(b)
  expect(ra.result.match.scores).toEqual([rb.result.match.scores[1], rb.result.match.scores[0]])
  console.log('scores A', JSON.stringify(ra.result.match.scores), 'B', JSON.stringify(rb.result.match.scores))
})
