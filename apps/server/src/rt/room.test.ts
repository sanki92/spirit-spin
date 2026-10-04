import { decode, type ServerMsg, type WireMsg } from '@spirit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Room } from './room'

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
    expect(c.tl.frame).toBe(room.live!.seq.frame)
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
    const feed = (side: 0 | 1) => r.onWire(side, { op: 'input', round: 1, first: r.live!.seq.frame + 1, ack: 0, inputs: [{ x: 0, y: 0, sp: 0 }] })
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

  it('binary input from a seat reaches the live round and a forfeit stops it', () => {
    const { room } = battle()
    vi.advanceTimersByTime(1200)
    const f = room.live!.seq.frame + 2
    room.onWire(0, { op: 'input', round: 1, first: f, ack: 0, inputs: [{ x: 100, y: 0, sp: 0 }] })
    vi.advanceTimersByTime(100)
    expect(room.live!.seq.confirmed[f - 1]![0].x).toBe(100)
    const live = room.live!
    room.forfeit(1, 'quit')
    expect(live.done).toBe(true)
  })
})
