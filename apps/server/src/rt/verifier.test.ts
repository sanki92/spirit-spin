import { startTimeline, stepTimeline, timelineHash, type Frame } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import { battle } from './testkit'
import { Verifier } from './verifier'

const idle: Frame = [{ x: 0, y: 0, sp: 0 }, { x: 0, y: 0, sp: 0 }]
const tilted: Frame = [{ x: 127, y: 0, sp: 0 }, { x: 0, y: 0, sp: 0 }]

describe('verifier', () => {
  it('replays frames, tracks tilt, keeps checkpoints every 60 frames', () => {
    const v = new Verifier(battle())
    v.apply(1, Array.from({ length: 120 }, (_, i) => (i % 2 ? tilted : idle)))
    expect(v.frame).toBe(120)
    expect(v.tilt).toEqual({ sum: [60, 0], n: [120, 120] })
    const g = startTimeline(battle())
    for (let i = 0; i < 60; i++) stepTimeline(g, i % 2 ? tilted : idle, [])
    expect(v.check(60, timelineHash(g))).toBe('ok')
    expect(v.check(60, 1)).toBe('mismatch')
    expect(v.check(61, 1)).toBe('unknown')
    expect(v.desyncs).toBe(1)
  })

  it('stops at the outcome', () => {
    const v = new Verifier(battle())
    v.apply(1, Array.from({ length: 3000 }, () => idle))
    expect(v.outcome).not.toBeNull()
    expect(v.frame).toBeLessThan(3000)
  })
})
