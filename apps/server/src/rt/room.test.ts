import type { ServerMsg } from '@spirit/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Room } from './room'

const BUILD = { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' } as const
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200 + (i % 2), y: 100 + i * 50 })), h: 800 }
let room: Room | null = null
afterEach(() => room?.close())

describe('room', () => {
  it('late inputs carry to the next tick and snapshots report each side input lead', () => {
    const got: ServerMsg[] = []
    room = new Room('TEST', { seatHoldMs: 1000, now: () => 0, onDone: () => undefined, speed: 1e-9 })
    room.seat('a', 'A', BUILD, m => got.push(m))
    room.seat('b', 'B', BUILD, () => undefined)
    ;(room as unknown as { nextRound(): void }).nextRound()
    room.onRip(0, { round: 1, swipe: SWIPE, pull100: 7 })
    room.onRip(1, { round: 1, swipe: SWIPE, pull100: 7 })
    expect(room.phase).toBe('battle')
    for (let i = 0; i < 5; i++) room.step()
    room.onInputs(0, 3, [[0.77, -0.5, 0]])
    room.onInputs(1, 9, [[0.1, 0.1, 0], [0.1, 0.1, 0]])
    room.step()
    const snap = got.filter((m): m is Extract<ServerMsg, { k: 'snap' }> => m.k === 'snap').at(-1)!
    expect(snap.tick).toBe(6)
    expect(snap.inputs[0].x).toBe(0.77)
    expect(snap.leads).toEqual([0 - 6, 10 - 6])
  })
})
