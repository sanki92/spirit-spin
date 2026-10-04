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
