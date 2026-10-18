import { decode, NET, type ServerMsg, type WireMsg } from '@spirit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMOTE, type EdgeApi, type EdgeBatch } from './edge'
import type { LiveMatch } from './live'
import { Room } from './room'

function fakeEdge(fail = false) {
  const calls: string[] = []
  const subs: ((b: EdgeBatch) => void)[] = []
  const edge: EdgeApi = {
    cfg: { grpc: 'x', secret: 'edge-secret-0123456789', wt: 'https://{host}:4433/wt', ws: '/edge/ws' },
    createMatch: async id => { calls.push(`create:${id}`); if (fail) throw new Error('down'); return { certHash: 'ab'.repeat(32) } },
    startRound: async (_id, round, lead) => { calls.push(`start:${round}:${lead}`); return Date.now() + lead },
    endRound: async () => { await new Promise(r => setTimeout(r, 20)); calls.push('endRound'); return {} },
    endMatch: async () => { calls.push('endMatch') },
    stream: (_id, _r, _a, onBatch) => { subs.push(onBatch); return () => undefined },
  }
  return { edge, calls, subs }
}

const BUILD = { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' } as const
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200 + (i % 2), y: 100 + i * 50 })), h: 800 }
let room: Room | null = null
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { room?.close(); vi.useRealTimers() })

function battle() {
  const got: ServerMsg[] = [], bins: WireMsg[] = [], tv: WireMsg[] = [], tvj: ServerMsg[] = []
  room = new Room('TEST', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined })
  room.seat('a', 'A', BUILD, m => got.push(m), () => undefined, b => bins.push(decode(b)!))
  room.seat('b', 'B', BUILD, () => undefined, () => undefined, () => undefined)
  room.watch(m => tvj.push(m), b => tv.push(decode(b)!))
  ;(room as unknown as { nextRound(): void }).nextRound()
  room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
  room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
  return { room, got, bins, tv, tvj }
}

describe('room', () => {
  it('a battle runs on the live sequencer: start carries t0, frames reach seats and watchers, the round ends', () => {
    const { room, got, bins, tv } = battle()
    expect(room.phase).toBe('battle')
    const start = got.find((m): m is Extract<ServerMsg, { k: 'start' }> => m.k === 'start')!
    expect(start.t0).toBe(room.live!.t0)
    vi.advanceTimersByTime(2000)
    expect(bins.some(m => m.op === 'frames' && m.frames.length > 0)).toBe(true)
    expect(tv.some(m => m.op === 'frames' && m.frames.length > 0)).toBe(true)
    vi.advanceTimersByTime(45000)
    expect(got.some(m => m.k === 'end')).toBe(true)
    expect(room.seats[0]!.tiltN).toBeGreaterThan(0)
  })

  it('rejoin mid-battle gets start then catchup at the verified frame', () => {
    const { room } = battle()
    vi.advanceTimersByTime(3000)
    const again: ServerMsg[] = []
    room.seat('a', 'A', BUILD, m => again.push(m), () => undefined, () => undefined)
    const ks = again.map(m => m.k)
    expect(ks.indexOf('start')).toBeGreaterThan(-1)
    expect(ks.indexOf('catchup')).toBe(ks.indexOf('start') + 1)
    const c = again.find((m): m is Extract<ServerMsg, { k: 'catchup' }> => m.k === 'catchup')!
    expect(c.tl.frame).toBe((room.live as LiveMatch).seq.frame)
  })

  it('a seat silent for 2 s mid-battle is shown as reconnecting, and back when its inputs resume', () => {
    const peers: Extract<ServerMsg, { k: 'peer' }>[] = []
    room = new Room('TEST', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined })
    room.seat('a', 'A', BUILD, m => { if (m.k === 'peer') peers.push(m) })
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    const r = room
    const feed = (side: 0 | 1) => r.onWire(side, { op: 'input', round: 1, first: (r.live as LiveMatch).seq.frame + 1, ack: 0, inputs: [{ x: 0, y: 0, sp: 0 }] })
    for (let i = 0; i < 12; i++) { feed(0); feed(1); vi.advanceTimersByTime(100) }
    expect(peers.filter(p => !p.online)).toHaveLength(0)
    for (let i = 0; i < 30 && !peers.some(p => !p.online); i++) { feed(0); vi.advanceTimersByTime(100) }
    expect(peers.at(-1)).toMatchObject({ k: 'peer', online: false })
    expect(r.phase).toBe('battle')
    feed(1)
    expect(peers.at(-1)).toMatchObject({ k: 'peer', online: true })
  })

  it('a seat still marked silent when the next battle starts is announced back online', () => {
    const peers: Extract<ServerMsg, { k: 'peer' }>[] = []
    room = new Room('TEST', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined })
    room.seat('a', 'A', BUILD, m => { if (m.k === 'peer') peers.push(m) })
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    room.seats[1]!.quiet = true
    const before = peers.length
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 2, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 2, swipe: SWIPE, pull100: 7 })
    expect(peers.slice(before)).toEqual([expect.objectContaining({ k: 'peer', name: 'B', online: true })])
    expect(room.seats[1]!.quiet).toBe(false)
  })

  it('edge mode: start carries a per-seat ticket and the edge t0; watchers get no ticket', async () => {
    const { edge, calls } = fakeEdge()
    const a: ServerMsg[] = [], b: ServerMsg[] = [], tv: ServerMsg[] = []
    room = new Room('EDGE', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, m => a.push(m))
    room.seat('b', 'B', BUILD, m => b.push(m))
    room.watch(m => tv.push(m))
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    const sa = a.find((m): m is Extract<ServerMsg, { k: 'start' }> => m.k === 'start')!
    const sb = b.find((m): m is Extract<ServerMsg, { k: 'start' }> => m.k === 'start')!
    const st = tv.find((m): m is Extract<ServerMsg, { k: 'start' }> => m.k === 'start')!
    expect(sa.edge).toMatchObject({ wt: 'https://{host}:4433/wt', ws: '/edge/ws', certHash: 'ab'.repeat(32) })
    expect(sa.edge!.ticket).not.toBe(sb.edge!.ticket)
    expect(st.edge).toBeUndefined()
    expect(calls).toEqual([expect.stringMatching(/^create:EDGE-/), 'start:1:1100'])
    expect(room.live?.constructor.name).toBe('RemoteRound')
  })

  it('edge mode: an unreachable edge falls back to the in-process round', async () => {
    const { edge } = fakeEdge(true)
    const a: ServerMsg[] = []
    room = new Room('DOWN', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, m => a.push(m))
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    const s = a.find((m): m is Extract<ServerMsg, { k: 'start' }> => m.k === 'start')!
    expect(s.edge).toBeUndefined()
    expect(room.live?.constructor.name).toBe('LiveMatch')
  })

  it('edge mode: streamed frames reach watchers and the outcome ends the round', async () => {
    const { edge, subs, calls } = fakeEdge()
    const a: ServerMsg[] = [], tvBins: Uint8Array[] = []
    room = new Room('EDGE2', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, m => a.push(m))
    room.seat('b', 'B', BUILD, () => undefined)
    room.watch(() => undefined, b => tvBins.push(b))
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    const idle = { x: 0, y: 0, sp: 0 }
    subs[0]!({ round: 1, first: 1, frames: Array.from({ length: 3000 }, () => [idle, idle] as const), hashes: [], inputHi: [0, 0] })
    expect(tvBins.length).toBeGreaterThan(0)
    expect(a.some(m => m.k === 'end')).toBe(true)
    let settled = false
    void Promise.resolve(room.close()).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(5)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(settled).toBe(true)
    expect(calls.slice(-2)).toEqual(['endRound', 'endMatch'])
  })

  it('edge mode: liveness comes from each side newest input frame on the edge stream', async () => {
    const { edge, subs } = fakeEdge()
    const peers: Extract<ServerMsg, { k: 'peer' }>[] = []
    room = new Room('LIVE', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, m => { if (m.k === 'peer') peers.push(m) })
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    const before = peers.length
    const idle = { x: 0, y: 0, sp: 0 }
    let f = 0
    for (let i = 0; i < 40; i++) {
      f += 1
      subs[0]!({ round: 1, first: f, frames: [[idle, idle]], hashes: [], inputHi: [f + 3, i < 10 ? f + 3 : 12] })
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(room.phase).toBe('battle')
    expect(peers.slice(before)).toEqual([expect.objectContaining({ name: 'B', online: false })])
    subs[0]!({ round: 1, first: f + 1, frames: [[idle, idle]], hashes: [], inputHi: [f + 4, f + 4] })
    expect(peers.at(-1)).toMatchObject({ name: 'B', online: true })
  })

  it('edge mode: a failed round start still ends the edge match when the room closes', async () => {
    const { edge, calls } = fakeEdge()
    edge.startRound = async () => { calls.push('start-fail'); throw new Error('deadline') }
    room = new Room('HALF', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, () => undefined)
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    expect(room.live?.constructor.name).toBe('LiveMatch')
    room.close()
    await vi.advanceTimersByTimeAsync(10)
    expect(calls.at(-1)).toBe('endMatch')
  })

  it('edge mode: a room that finishes while the edge match is being created ends it once created, and never starts a round', async () => {
    const { edge, calls } = fakeEdge()
    edge.createMatch = async id => { await new Promise(r => setTimeout(r, 100)); calls.push(`create:${id}`); return { certHash: '' } }
    room = new Room('GONE', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, () => undefined)
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    room.forfeit(1, 'quit')
    await vi.advanceTimersByTimeAsync(200)
    expect(calls.some(c => c.startsWith('start:'))).toBe(false)
    expect(calls.at(-1)).toBe('endMatch')
  })

  it('edge mode: seats are not flagged silent while the edge is slow to start the round', async () => {
    const { edge } = fakeEdge()
    edge.createMatch = async () => { await new Promise(r => setTimeout(r, 4000)); return { certHash: '' } }
    const peers: Extract<ServerMsg, { k: 'peer' }>[] = []
    room = new Room('SLOW', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, m => { if (m.k === 'peer') peers.push(m) })
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    const before = peers.length
    await vi.advanceTimersByTimeAsync(4500)
    expect(peers.slice(before).filter(p => !p.online)).toHaveLength(0)
  })

  it('edge mode: an edge failure after the room finished is not reported as a fallback', async () => {
    const { edge } = fakeEdge()
    edge.createMatch = async () => { await new Promise(r => setTimeout(r, 100)); throw new Error('down') }
    const logs: Record<string, unknown>[] = []
    room = new Room('LATE', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge, log: o => logs.push(o) })
    room.seat('a', 'A', BUILD, () => undefined)
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    room.forfeit(1, 'quit')
    await vi.advanceTimersByTimeAsync(200)
    expect(logs.filter(l => l.msg === 'edge.fallback')).toHaveLength(0)
  })

  it('a decisive finish holds the next round back long enough for the finish replay; a plain spin-out does not', () => {
    const roundAt = (finish: 'ringout' | 'spin') => {
      const { room, got } = battle()
      for (let i = 0; i < 100 && !room.live; i++) vi.advanceTimersByTime(100)
      ;(room.live as LiveMatch).stop()
      ;(room as unknown as { live: unknown }).live = { ver: { outcome: { winner: 0, finish, points: finish === 'spin' ? 1 : 2 }, tilt: { sum: [0, 0], n: [0, 0] } }, stop: () => undefined }
      ;(room as unknown as { endRound(): void }).endRound()
      const before = got.filter(m => m.k === 'round').length
      let ms = 0
      while (got.filter(m => m.k === 'round').length === before && ms < 20000) { vi.advanceTimersByTime(100); ms += 100 }
      room.close()
      return ms
    }
    expect(roundAt('spin')).toBe(3200)
    expect(roundAt('ringout')).toBe(3200 + NET.finishReplayMs)
  })

  it('edge mode: the match-deciding round ends the edge match only after a linger, so phones still receive the final frames; a shutdown does not wait', async () => {
    const play = async () => {
      const { edge, subs, calls } = fakeEdge()
      room = new Room('LAST', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
      room.seat('a', 'A', BUILD, () => undefined)
      room.seat('b', 'B', BUILD, () => undefined)
      ;(room as unknown as { match: { scores: [number, number] } }).match.scores = [3, 0]
      ;(room as unknown as { nextRound(): void }).nextRound()
      room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
      room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
      await vi.advanceTimersByTimeAsync(10)
      const idle = { x: 0, y: 0, sp: 0 }
      subs[0]!({ round: 1, first: 1, frames: Array.from({ length: 3000 }, () => [idle, idle] as const), hashes: [], inputHi: [0, 0] })
      return calls
    }
    const calls = await play()
    expect(room!.phase).toBe('done')
    await vi.advanceTimersByTimeAsync(REMOTE.lingerMs - 100)
    expect(calls.filter(c => c === 'endMatch')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(calls.slice(-2)).toEqual(['endRound', 'endMatch'])
    const again = await play()
    let settled = false
    void room!.close().then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(60)
    expect(settled).toBe(true)
    expect(again.slice(-2)).toEqual(['endRound', 'endMatch'])
  })

  it('edge mode: a forfeit ends the edge match at once, with no linger', async () => {
    const { edge, calls } = fakeEdge()
    room = new Room('QUIT', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, edge })
    room.seat('a', 'A', BUILD, () => undefined)
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    await vi.advanceTimersByTimeAsync(10)
    room.forfeit(1, 'quit')
    await vi.advanceTimersByTimeAsync(50)
    expect(calls.at(-1)).toBe('endMatch')
  })

  it('binary input from a seat reaches the live round and a forfeit stops it', () => {
    const { room } = battle()
    vi.advanceTimersByTime(1200)
    const f = (room.live as LiveMatch).seq.frame + 2
    room.onWire(0, { op: 'input', round: 1, first: f, ack: 0, inputs: [{ x: 100, y: 0, sp: 0 }] })
    vi.advanceTimersByTime(100)
    expect((room.live as LiveMatch).seq.confirmed[f - 1]![0].x).toBe(100)
    const live = room.live as LiveMatch
    room.forfeit(1, 'quit')
    expect(live.done).toBe(true)
  })
})

describe('room events', () => {
  it('logs who joined, who dropped, who quit and how the match ended', () => {
    const logs: Record<string, unknown>[] = []
    room = new Room('LOGS', { seatHoldMs: 1000, now: () => Date.now(), onDone: () => undefined, log: o => logs.push(o) })
    room.seat('a', 'A', BUILD, () => undefined)
    room.seat('b', 'B', BUILD, () => undefined)
    room.disconnect(1)
    room.seat('b', 'B', BUILD, () => undefined)
    room.forfeit(0, 'quit')
    expect(logs.map(l => l.msg)).toEqual(['room.join', 'room.join', 'room.drop', 'room.rejoin', 'room.forfeit', 'room.end'])
    expect(logs[4]).toMatchObject({ code: 'LOGS', side: 0, name: 'A', reason: 'quit' })
    expect(logs[5]).toMatchObject({ names: ['A', 'B'], winner: 1 })
  })
})
