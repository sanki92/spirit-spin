import { describe, expect, it } from 'vitest'
import { NetDriver } from './driver'
import { ROLL } from './session'
import { startTimeline } from './replay'
import { fresh } from './testkit'
import { IDLE_INPUT, type Frame, type WireMsg } from './wire'

const make = (round = 3) => {
  const sent: WireMsg[] = []
  const d = new NetDriver(startTimeline(fresh()), 0, round, 2, 20, { send: m => sent.push(m) })
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
    d.onFrames({ op: 'frames', round: 3, first: 1, margin: 20, frames: [[IDLE_INPUT, IDLE_INPUT]] }, 0)
    expect(d.step(0, 0, false, [])).toBe(true)
    const last = sent.filter(m => m.op === 'input').at(-1) as Extract<WireMsg, { op: 'input' }>
    expect(last.inputs.at(-1)!.sp).toBe(1)
  })

  it('a confirmation that already caught the phone up does not also jump the clock', () => {
    const { d } = make()
    for (let i = 0; i < 3; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 100 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: -1500, frames }, 0)).toEqual({ result: 'jump', jump: 0 })
  })

  it('pauses steps while far ahead, then resumes', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const r = d.onFrames({ op: 'frames', round: 3, first: 1, margin: 400, frames: [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] }, 0)
    expect(r!.jump).toBeLessThan(0)
    let skipped = 0
    while (!d.step(0, 0, false, [])) skipped++
    expect(skipped).toBe(-r!.jump)
    expect(d.session.stats.stalls).toBe(0)
  })

  it('ignores margins until a frame with its first real input is confirmed, so the pre-start prefill never pauses the phone', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    expect(d.onFrames({ op: 'frames', round: 3, first: 1, margin: 900, frames: [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] }, 0)).toEqual({ result: 'same', jump: 0 })
    expect(d.onFrames({ op: 'frames', round: 3, first: 3, margin: 900, frames: [[IDLE_INPUT, IDLE_INPUT]] }, 0)!.jump).toBeLessThan(0)
  })

  it('after a freeze the clock jump stops at the expected lead instead of the stale lateness', () => {
    const { d } = make()
    d.rtt = 200
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 10 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    const r = d.onFrames({ op: 'frames', round: 3, first: 1, margin: -1500, frames }, 0)!
    expect(r.jump).toBe(0)
    expect(d.session.depth).toBe(20)
  })

  it('a pause is not cancelled by the next frames packet while the clock is held', () => {
    const { d } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const three = [[IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT], [IDLE_INPUT, IDLE_INPUT]] as Frame[]
    const r = d.onFrames({ op: 'frames', round: 3, first: 1, margin: 400, frames: three }, 0)!
    expect(r.jump).toBeLessThan(0)
    expect(d.step(0, 0, false, [])).toBe(false)
    d.onFrames({ op: 'frames', round: 3, first: 4, margin: 400, frames: [] }, 16)
    let skipped = 1
    while (!d.step(0, 0, false, [])) skipped++
    expect(skipped).toBe(-r.jump)
  })

  it('drops frames of another round', () => {
    const { d } = make(3)
    expect(d.onFrames({ op: 'frames', round: 2, first: 1, margin: 0, frames: [[IDLE_INPUT, IDLE_INPUT]] }, 0)).toBeNull()
    expect(d.session.confirmed.frame).toBe(0)
  })

  it('confirms frames, sends hash checkpoints and applies margin to the clock', () => {
    const { d, sent } = make()
    for (let i = 0; i < 30; i++) d.step(0, 0, false, [])
    const frames = Array.from({ length: 60 }, () => [IDLE_INPUT, IDLE_INPUT] as Frame)
    const r = d.onFrames({ op: 'frames', round: 3, first: 1, margin: 5, frames }, 0)
    expect(r).toEqual({ result: 'jump', jump: 0 })
    expect(d.clock.scale).toBe(1)
    expect(sent.at(-1)).toMatchObject({ op: 'hash', round: 3, frame: 60 })
  })

  it('stops stepping once the confirmed round is over', () => {
    const { d } = make()
    d.session.confirmed.state.outcome = { winner: 1, finish: 'spin', points: 1 }
    expect(d.step(0, 0, false, [])).toBe(false)
    expect(d.done).toBe(true)
  })
})
