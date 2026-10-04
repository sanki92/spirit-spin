import { decode, Replayer, roundHalfUp, SEQ, startTimeline, timelineHash, WIRE, type ServerMsg, type Timeline, type WireMsg } from '@spirit/core'
import { describe, expect, it } from 'vitest'
import { LiveMatch, type LiveDeps } from './live'
import { battle } from './testkit'

const I = (x = 0, sp = 0) => ({ x, y: 0, sp })
const T0 = SEQ.leadInMs
const at = (f: number) => T0 + f * WIRE.tickMs + SEQ.graceMs

function harness(round = 1) {
  let now = 0
  const out = { bin: [[], []] as WireMsg[][], watch: [] as WireMsg[], json: [] as [number, ServerMsg][], ended: 0, logs: [] as Record<string, unknown>[] }
  const d: LiveDeps = {
    now: () => now, every: () => () => undefined,
    send: (s, b) => out.bin[s]!.push(decode(b)!), watch: b => out.watch.push(decode(b)!),
    resync: (s, m) => out.json.push([s, m]), end: () => out.ended++, log: o => out.logs.push(o),
  }
  const m = new LiveMatch(round, battle(), d)
  return { m, out, set: (t: number) => { now = t } }
}
const framesOf = (ms: WireMsg[]) => ms.filter((x): x is Extract<WireMsg, { op: 'frames' }> => x.op === 'frames')

describe('live match', () => {
  it('confirms frames from both seats and fans them out once, with margins', () => {
    const { m, out, set } = harness()
    expect(m.t0).toBe(T0)
    set(T0)
    m.onWire(0, { op: 'input', round: 1, first: 1, ack: 0, inputs: [I(5)] })
    m.onWire(1, { op: 'input', round: 1, first: 1, ack: 0, inputs: [I(-5)] })
    expect(framesOf(out.bin[0]!).filter(f => f.frames.length)).toHaveLength(0)
    set(at(1))
    m.tick()
    const a = framesOf(out.bin[0]!).filter(f => f.frames.length)
    expect(a).toEqual([{ op: 'frames', round: 1, first: 1, margin: roundHalfUp(at(1) - T0), frames: [[I(5), I(-5)]] }])
    expect(framesOf(out.bin[1]!).filter(f => f.frames.length)).toHaveLength(1)
    expect(framesOf(out.watch).flatMap(f => f.frames)).toHaveLength(1)
  })

  it('repeats a missing seat at the deadline and counts late input', () => {
    const { m, set } = harness()
    set(at(5))
    m.tick()
    expect(m.seq.frame).toBe(5)
    m.onWire(0, { op: 'input', round: 1, first: 2, ack: 0, inputs: [I(9)] })
    expect(m.seq.late).toEqual([1, 0])
  })

  it('ignores input of another round', () => {
    const { m, set } = harness(2)
    set(T0)
    m.onWire(0, { op: 'input', round: 1, first: 1, ack: 0, inputs: [I(5)] })
    m.onWire(1, { op: 'input', round: 2, first: 1, ack: 0, inputs: [I(5)] })
    expect(m.seq.frame).toBe(0)
  })

  it('a hash mismatch sends the verified timeline and logs loudly; a matching hash does not', () => {
    const { m, out, set } = harness()
    set(at(61))
    m.tick()
    const rp = new Replayer(JSON.parse(JSON.stringify(m.catchup(null).tl)) as Timeline)
    expect(rp.frame).toBe(61)
    m.onWire(0, { op: 'hash', round: 1, frame: 60, hash: 123 })
    expect(out.json[0]![1]).toMatchObject({ k: 'resync', round: 1 })
    expect(out.logs.some(l => l.msg === 'net.desync')).toBe(true)
    const v = new Replayer(startTimeline(battle()))
    v.push(1, m.seq.confirmed.slice(0, 60))
    while (v.stepOne([]));
    m.onWire(1, { op: 'hash', round: 1, frame: 60, hash: timelineHash(v.tl) })
    expect(out.json).toHaveLength(1)
  })

  it('a flood of mismatching hashes resyncs and logs at most once per half second per side', () => {
    const { m, out, set } = harness()
    set(at(70))
    m.tick()
    for (let i = 0; i < 50; i++) m.onWire(0, { op: 'hash', round: 1, frame: 60, hash: i })
    expect(out.json).toHaveLength(1)
    expect(out.logs.filter(l => l.msg === 'net.desync')).toHaveLength(1)
    m.onWire(1, { op: 'hash', round: 1, frame: 60, hash: 7 })
    expect(out.json).toHaveLength(2)
    set(at(70) + 600)
    m.onWire(0, { op: 'hash', round: 1, frame: 60, hash: 9 })
    expect(out.json).toHaveLength(3)
  })

  it('catchup replays to identical hash and frames continue from it', () => {
    const { m, out, set } = harness()
    set(at(100))
    m.tick()
    const c = JSON.parse(JSON.stringify(m.catchup(0))) as Extract<ServerMsg, { k: 'catchup' }>
    out.bin[0] = []
    set(at(200))
    m.tick()
    const rp = new Replayer(c.tl)
    for (const f of framesOf(out.bin[0]!)) rp.push(f.first, f.frames)
    while (rp.stepOne([]));
    expect(framesOf(out.bin[0]!)[0]!.first).toBe(101)
    expect(rp.frame).toBe(200)
    expect(timelineHash(rp.tl)).toBe(timelineHash(m.ver.tl))
  })

  it('ends on the outcome exactly once and logs a round summary', () => {
    const { m, out, set } = harness()
    set(at(3000))
    m.tick()
    m.tick()
    expect(m.ver.outcome).not.toBeNull()
    expect(out.ended).toBe(1)
    expect(out.logs.find(l => l.msg === 'net.round')).toMatchObject({ round: 1, desyncs: 0 })
  })
})
