import { describe, expect, it } from 'vitest'
import { tracePlausible } from './plausibility'
import { pullTrace } from './rip.fixtures'

describe('tracePlausible', () => {
  it('a realistic jittery noisy trace passes', () => expect(tracePlausible(pullTrace({ start: 0 }))).toEqual({ ok: true, reasons: [] }))
  it('perfectly regular timestamps are flagged', () => {
    const tr = pullTrace({ start: 0 }).map((s, i) => ({ ...s, t: i * 16 }))
    expect(tracePlausible(tr).reasons).toContain('no-interval-jitter')
  })
  it('noise-free rest is flagged', () => {
    const tr = pullTrace({ start: 0 }).map(s => (Math.abs(s.ay) < 3 ? { ...s, ax: 0, ay: 0, az: 0 } : s))
    expect(tracePlausible(tr).reasons).toContain('no-sensor-noise')
  })
  it('impossible acceleration is flagged', () => {
    const tr = pullTrace({ start: 0 }); tr[80] = { ...(tr[80] as typeof tr[number]), ay: -300 }
    expect(tracePlausible(tr).reasons).toContain('impossible-accel')
  })
  it('too few samples is flagged', () => expect(tracePlausible(pullTrace({ start: 0 }).filter((_, i) => i % 5 === 0)).reasons).toContain('low-sample-rate'))
  it('repeated identical vectors are flagged', () => {
    const tr = pullTrace({ start: 0 }); for (let i = 10; i < 22; i++) tr[i] = { ...(tr[i] as typeof tr[number]), ax: 1, ay: 2, az: 3 }
    expect(tracePlausible(tr).reasons).toContain('repeated-samples')
  })
})
