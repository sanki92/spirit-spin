import { webkit, devices } from 'playwright'

const [, , out = 'e2e/out/wk', ...steps] = process.argv
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true, ...(process.env.WK_H ? { viewport: { width: 390, height: Number(process.env.WK_H) } } : {}) })
await ctx.addInitScript(() => {
  if (!localStorage.getItem('spirit.save')) localStorage.setItem('spirit.save', JSON.stringify({ state: { birthYear: 2008, starter: 'voltfang', beasts: { voltfang: { id: 'voltfang', trust: 35, respect: 20, courage: 0, pride: 0, curiosity: 0, calm: 0, battles: 0, awakened: null, memories: [], counters: { wins: 0, comebacks: 0, spiritFinishes: 0, bossWins: 0 }, daily: {} } }, owned: { blades: ['fang'], discs: ['standard'], tips: ['flat'] }, loadout: { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' }, onboarded: { safety: true, calibrated: true, firstBattle: true } }, version: 2 }))
  if (window.AudioContext) return
  const param = () => ({ value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} })
  const node = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k]
      if (['gain', 'playbackRate', 'frequency', 'Q', 'detune', 'pan'].includes(k)) return (t[k] = param())
      if (k === 'buffer' || k === 'onended') return null
      if (k === 'frequencyBinCount') return 128
      return () => node()
    },
    set(t, k, v) { t[k] = v; return true },
  })
  class Ctx {
    state = 'running'; currentTime = 0; sampleRate = 48000; destination = node(); baseLatency = 0
    resume() { return Promise.resolve() } suspend() { return Promise.resolve() } close() { return Promise.resolve() }
    decodeAudioData() { return Promise.resolve({ duration: 1, length: 48000, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(48000) }) }
    createGain() { return node() } createBufferSource() { return node() } createAnalyser() { return node() } createBiquadFilter() { return node() }
    createMediaStreamSource() { return node() } createDynamicsCompressor() { return node() } createStereoPanner() { return node() } createOscillator() { return node() }
    addEventListener() {} removeEventListener() {}
  }
  window.AudioContext = Ctx
})
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto((process.env.LOOK_URL ?? 'https://localhost:5173') + '/' + (process.env.WK_QUERY ?? ''))
let n = 0
for (const step of steps) {
  const [kind, ...rest] = step.split(':')
  const arg = rest.join(':')
  if (kind === 'js') await page.evaluate(arg)
  else if (kind === 'click') await page.getByRole(arg.split('=')[0], { name: new RegExp(arg.split('=')[1], 'i') }).first().click()
  else if (kind === 'text') await page.getByText(new RegExp(arg, 'i')).first().click()
  else if (kind === 'wait') await page.waitForTimeout(Number(arg))
  else if (kind === 'until') await page.waitForFunction(arg, null, { timeout: 60000, polling: 100 })
  else if (kind === 'swipe') { const [x, y1, y2] = arg.split(',').map(Number); await page.touchscreen.tap(x, y1); await page.mouse.move(x, y1); await page.mouse.down(); await page.mouse.move(x, y2, { steps: 10 }); await page.mouse.up() }
  else if (kind === 'shot') { await page.screenshot({ path: `${out}-${arg || ++n}.png` }); console.log('shot', `${out}-${arg || n}.png`) }
}
await browser.close()
