import { describe, expect, it } from 'vitest'
import { NetDriver } from './driver'
import { CLOCK, clockFrame } from './clock'
import { ROLL } from './session'
import { startTimeline } from './replay'
import { fresh } from './testkit'
import { IDLE_INPUT, WIRE, type Frame, type WireMsg } from './wire'

const make = (round = 3) => {
  const sent: WireMsg[] = []
  const d = new NetDriver(startTimeline(fresh()), 0, round, 2, 20, { send: m => sent.push(m) }, 0)
  return { d, sent }
}

describe('net driver', () => {
  it('sends the delay prefill immediately and every step after', () => {
    const { d, sent } = make()
    expect(sent[0]).toEqual({ op: 'input', round: 3, first: 1, ack: 0, inputs: [IDLE_INPUT, IDLE_INPUT] })
    d.step(1, -1, true, [])
    expect(sent[1]).toEqual({ op: 'input', round: 3, first: 1, ack: 0, inputs: [IDLE_INPUT, IDLE_INPUT, { x: 127, y: -127, sp: 1 }] })
  })

  it('keeps a spirit press made while stalled for the next step', () => {
    const { d, sent } = make()
    for (let i = 0; i < ROLL.maxPredict; i++) d.step(0, 0, false, [])
    expect(d.step(0, 0, true, [])).toBe(false)
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 20, frames: [[IDLE_INPUT, IDLE_INPUT]] })
    expect(d.step(0, 0, false, [])).toBe(true)
    const last = sent.filter(m => m.op === 'input').at(-1) as Extract<WireMsg, { op: 'input' }>
    expect(last.inputs.at(-1)!.sp).toBe(1)
  })

  it('a confirmation that already caught the phone up does not also jump the clock', () => {
    const { d } = make()
    for (let i = 0; i < 3; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 100 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: -1500, frames })).toBe('jump')
    expect(d.steer(0)).toBe(0)
  })

  it('pauses steps while far ahead, then resumes', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 400, frames: [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] })
    const jump = d.steer(0)
    expect(jump).toBeLessThan(0)
    let skipped = 0
    while (!d.step(0, 0, false, [])) skipped++
    expect(skipped).toBe(-jump)
    expect(d.session.stats.stalls).toBe(0)
  })

  it('ignores margins until a frame with its first real input is confirmed, so the pre-start prefill never pauses the phone', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: 900, frames: [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] })).toBe('same')
    expect(d.steer(0)).toBe(0)
    d.onFrames({ op: 'frames', round: 3, first: 3, margin: 900, frames: [[IDLE_INPUT, IDLE_INPUT]] })
    expect(d.steer(0)).toBeLessThan(0)
  })

  it('after a freeze the clock jump stops at the expected lead instead of the stale lateness', () => {
    const { d } = make()
    d.rtt = 200
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 10 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: -1500, frames })
    expect(d.steer(0)).toBe(0)
    expect(d.session.depth).toBe(20)
  })

  it('a pause keeps its length across later packets', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const three = [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] as Frame[]
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 400, frames: three })
    const jump = d.steer(0)
    expect(jump).toBeLessThan(0)
    expect(d.step(0, 0, false, [])).toBe(false)
    d.onFrames({ op: 'frames', round: 3, first: 4, margin: 400, frames: [] })
    d.steer(WIRE.tickMs)
    let skipped = 1
    while (!d.step(0, 0, false, [])) skipped++
    expect(skipped).toBe(-jump)
  })

  it('drops frames of another round', () => {
    const { d } = make(3)
    expect(d.onFrames({ op: 'frames', round: 2, first: 1, margin: 0, frames: [[IDLE_INPUT, IDLE_INPUT]] })).toBeNull()
    expect(d.session.confirmed.frame).toBe(0)
  })

  it('confirms frames, sends hash checkpoints and applies margin to the clock', () => {
    const { d, sent } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 60 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: 5, frames })).toBe('jump')
    expect(d.clock.scale).toBe(1.03)
    expect(sent.at(-1)).toMatchObject({ op: 'hash', round: 3, frame: 60 })
  })

  it('stops stepping once the confirmed round is over', () => {
    const { d } = make()
    d.session.confirmed.state.outcome = { winner: 1, finish: 'spin', points: 1 }
    expect(d.step(0, 0, false, [])).toBe(false)
    expect(d.done).toBe(true)
  })
})

describe('net driver clock steering', () => {
  const steer = (t0: number) => {
    const sent: WireMsg[] = []
    const d = new NetDriver(startTimeline(fresh()), 0, 3, 2, 20, { send: m => sent.push(m) }, t0)
    d.rtt = 100
    return d
  }
  const idle = (n: number) => Array.from({ length: n }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)

  it('after a freeze it jumps straight to the frame the server clock says it should be on', () => {
    const d = steer(0)
    for (let i = 0; i < 10; i++) d.step(0, 0, false, [])
    const now = 100 * WIRE.tickMs
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: -1500, frames: idle(90) })).toBe('jump')
    expect(d.steer(now)).toBe(clockFrame(now, 0, 100, 20, 2) - 90)
  })

  it('pauses when the clock says it is far ahead, and leaves small errors to time dilation', () => {
    const d = steer(0)
    for (let i = 0; i < 40; i++) d.step(0, 0, false, [])
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 900, frames: idle(10) })
    expect(d.steer(10 * WIRE.tickMs)).toBeLessThan(-CLOCK.leapFrames)
    const e = steer(0)
    for (let i = 0; i < 30; i++) e.step(0, 0, false, [])
    e.onFrames({ op: 'frames', round: 3, first: 1, margin: 20, frames: idle(10) })
    expect(e.steer((30 - 2) * WIRE.tickMs - 70)).toBe(0)
  })

  it('a stalled phone keeps sending its ack, so a sender that restarted from an old ack catches it up', () => {
    const sent: WireMsg[] = []
    const d = new NetDriver(startTimeline(fresh()), 0, 3, 2, 20, { send: m => sent.push(m) }, 0)
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 20, frames: idle(5) })
    while (d.step(0, 0, false, []));
    const n = sent.length
    expect(d.step(0, 0, false, [])).toBe(false)
    expect(sent.length).toBe(n + 1)
    expect(sent.at(-1)).toMatchObject({ op: 'input', ack: 5 })
  })

  it('a resync drops any pending pause', () => {
    const d = steer(0)
    for (let i = 0; i < 40; i++) d.step(0, 0, false, [])
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 900, frames: idle(10) })
    expect(d.steer(10 * WIRE.tickMs)).toBeLessThan(0)
    d.resync(startTimeline(fresh()))
    expect(d.step(0, 0, false, [])).toBe(true)
  })
})

describe('net driver resume ordering (iOS runs a frame before the buffered packets)', () => {
  const idle = (n: number) => Array.from({ length: n }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)

  it('does not predict into frames the server already decided when its confirmed state is stale', () => {
    const sent: WireMsg[] = []
    const d = new NetDriver(startTimeline(fresh()), 0, 3, 1, 20, { send: m => sent.push(m) }, 0)
    d.rtt = 10
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 30, frames: idle(234) })
    d.steer(236 * WIRE.tickMs)
    const now = 504 * WIRE.tickMs
    expect(d.steer(now)).toBe(0)
    expect(d.waiting).toBe(true)
    const n0 = sent.length
    expect(d.step(0, 0, false, [])).toBe(false)
    expect(sent.length).toBe(n0 + 1)
    d.onFrames({ op: 'frames', round: 3, first: 235, margin: 30, frames: idle(266) })
    const n = d.steer(now)
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(8)
  })
})

describe('net driver waiting cannot trap the player', () => {
  const idle = (n: number) => Array.from({ length: n }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)

  it('a badly wrong latency estimate holds steps only briefly after a hitch, never for the rest of the round', () => {
    const d = new NetDriver(startTimeline(fresh()), 0, 3, 1, 20, { send: () => undefined }, 0)
    d.rtt = 50
    let confirmed = 0
    let held = 0
    for (let f = 1; f <= 600; f++) {
      const now = f * WIRE.tickMs
      if (f % 2 === 0 && f > 40) {
        const upto = f - 30
        if (upto > confirmed) { d.onFrames({ op: 'frames', round: 3, first: confirmed + 1, margin: 30, frames: idle(upto - confirmed) }); confirmed = upto }
      }
      if (f >= 300 && f < 318) continue
      d.step(0, 0, false, [])
      for (let n = d.steer(now); n > 0; n--) d.step(0, 0, false, [])
      if (d.waiting) held++
    }
    expect(held).toBeGreaterThan(0)
    expect(held).toBeLessThanOrEqual(Math.ceil((2 * (50 + 20)) / WIRE.tickMs) + 1)
    expect(d.waiting).toBe(false)
    expect(clockFrame(600 * WIRE.tickMs, 0, 50, 20, 1) - d.session.frame).toBeLessThanOrEqual(CLOCK.leapFrames)
  })

  it('stops reporting waiting once the round is decided', () => {
    const d = new NetDriver(startTimeline(fresh()), 0, 3, 1, 20, { send: () => undefined }, 0)
    d.rtt = 10
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 30, frames: idle(20) })
    d.steer(22 * WIRE.tickMs)
    d.steer(400 * WIRE.tickMs)
    expect(d.waiting).toBe(true)
    d.session.confirmed.state.outcome = { winner: 0, finish: 'spin', points: 1 }
    d.steer(401 * WIRE.tickMs)
    expect(d.waiting).toBe(false)
  })
})

