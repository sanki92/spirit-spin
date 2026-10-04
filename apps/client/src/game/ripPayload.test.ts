import type { MotionSample } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import { calloutOf, judged, ripPayload } from './ripPayload'

function trace(t0: number, until: number): MotionSample[] {
  const out: MotionSample[] = []
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let t = t0 - 1100; t <= until; t += 15 + rnd() * 3.5) {
    const u = t - (t0 + 40)
    const pull = u >= 0 && u < 140 ? -28 * Math.sin((Math.PI * u) / 140) : u >= 140 && u < 250 ? 22 * Math.sin((Math.PI * (u - 140)) / 110) : 0
    out.push({ t, ax: (rnd() - 0.5) * 0.3, ay: pull + (rnd() - 0.5) * 0.3, az: (rnd() - 0.5) * 0.3, gx: 0, gy: 0, gz: 0, roll: 0 })
  }
  return out
}

describe('networked rip judging', () => {
  const t0 = 10_000
  it('a clean pull recorded over the full window passes the server judge', () => {
    const r = judged(ripPayload(t0, trace(t0, t0 + 700), null, 7)).res
    expect(r.ok).toBe(true)
  })

  it('the same pull cut off early fails the server plausibility check, so online modes must wait for the full window', () => {
    const r = judged(ripPayload(t0, trace(t0, t0 + 300), null, 7)).res
    expect(r.ok).toBe(false)
  })

  it('judges with the server calibration clamp, so a tiny local calibration cannot inflate the result', () => {
    const lo = judged(ripPayload(t0, trace(t0, t0 + 700), null, 2)).res
    const five = judged(ripPayload(t0, trace(t0, t0 + 700), null, 5)).res
    expect(lo).toEqual(five)
  })

  it('names the real reason for a miss', () => {
    expect(calloutOf({ ok: false, quality: 'WEAK', overspin: false, rpm: 3880, reason: 'too-early' }).note).toBe('FALSE START')
    expect(calloutOf({ ok: false, quality: 'WEAK', overspin: false, rpm: 3880, reason: null }).note).toBe('TOO SOFT')
  })
})
