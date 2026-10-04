import type { MotionSample } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import { bestPayload, calloutOf, judged, ripPayload } from './ripPayload'

function trace(t0: number, until: number, at = 40): MotionSample[] {
  const out: MotionSample[] = []
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let t = t0 - 1100; t <= until; t += 15 + rnd() * 3.5) {
    const u = t - (t0 + at)
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

  it('a pull 650 ms before LAUNCH is a false start online, same as offline', () => {
    const r = judged(ripPayload(t0, trace(t0, t0 + 850, -650), null, 7)).res
    expect(r).toEqual({ ok: false, reason: 'too-early' })
  })

  it('judges with the server calibration clamp, so a tiny local calibration cannot inflate the result', () => {
    const lo = judged(ripPayload(t0, trace(t0, t0 + 700), null, 2)).res
    const five = judged(ripPayload(t0, trace(t0, t0 + 700), null, 5)).res
    expect(lo).toEqual(five)
  })

  it('drops repeated timestamps (Safari rounds to 1 ms) instead of failing the trace', () => {
    const t = trace(t0, t0 + 850)
    const dup = t.flatMap((s, i) => (i % 9 === 0 ? [s, { ...s }] : [s]))
    expect(judged(ripPayload(t0, dup, null, 7)).res.ok).toBe(true)
  })

  const swipe = (rest: number) => {
    const pts = [] as { t: number; x: number; y: number }[]
    for (let t = t0 - rest; t < t0 + 20; t += 16) pts.push({ t, x: 200, y: 300 })
    for (let i = 0; i <= 10; i++) pts.push({ t: t0 + 20 + i * 14, x: 200, y: 300 + i * 45 })
    return pts
  }
  it('trims a finger resting before LAUNCH so the swipe still counts', () => {
    expect(judged(ripPayload(t0, null, swipe(380), 7)).res.ok).toBe(true)
  })

  it('falls back to the swipe when the motion trace fails', () => {
    const flat = trace(t0, t0 + 850).map(s => ({ ...s, ay: (s.ay > 3 ? 0 : s.ay) }))
    const p = bestPayload(t0, flat, swipe(100), 7, false)
    expect(p.swipe).toBeDefined()
    expect(judged(p).res.ok).toBe(true)
  })

  it('names the real reason for a miss', () => {
    expect(calloutOf({ ok: false, quality: 'WEAK', overspin: false, rpm: 3880, reason: 'too-early' }).note).toBe('FALSE START')
    expect(calloutOf({ ok: false, quality: 'WEAK', overspin: false, rpm: 3880, reason: null }).note).toBe('TOO SOFT')
  })
})
