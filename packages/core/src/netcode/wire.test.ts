import { describe, expect, it } from 'vitest'
import { decode, encode, quantizeTilt as quantize, tiltOf, unpackFrames, type Frame, type WireInput, type WireMsg } from './wire'

const packFrames = (fr: readonly Frame[]) => Uint8Array.from(fr.flatMap(f => f.flatMap(i => [i.x & 255, i.y & 255, i.sp])))

const hex = (b: Uint8Array) => [...b].map(v => v.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => Uint8Array.from(s.match(/../g)!.map(h => parseInt(h, 16)))

describe('wire', () => {
  it('quantizes tilt to int8 and back', () => {
    expect([quantize(0), quantize(1), quantize(-1), quantize(2), quantize(-3), quantize(Number.NaN), quantize(0.5)]).toEqual([0, 127, -127, 127, -127, 0, 64])
    expect(tiltOf(127)).toBe(1)
    expect(tiltOf(quantize(0.3))).toBeCloseTo(0.3, 2)
  })

  it('encodes the golden byte layouts shared with the Go edge', () => {
    expect(hex(encode({ op: 'input', round: 2, first: 300, ack: 298, inputs: [{ x: 127, y: -127, sp: 3 }] }))).toBe('01020000012c0000012a017f8103')
    expect(hex(encode({ op: 'frames', round: 1, first: 5, margin: -12, frames: [[{ x: 1, y: 2, sp: 0 }, { x: -1, y: 0, sp: 9 }]] }))).toBe('020100000005fff401010200ff0009')
    expect(hex(encode({ op: 'hash', round: 3, frame: 120, hash: 0xdeadbeef }))).toBe('030300000078deadbeef')
  })

  it('round-trips every op', () => {
    const msgs: WireMsg[] = [
      { op: 'input', round: 7, first: 1, ack: -1, inputs: [{ x: 0, y: 0, sp: 0 }, { x: -5, y: 9, sp: 255 }] },
      { op: 'frames', round: 255, first: 4000, margin: 31, frames: Array.from({ length: 16 }, (_, i) => [{ x: i, y: -i || 0, sp: i }, { x: -i || 0, y: i, sp: 2 }] as [WireInput, WireInput]) },
      { op: 'hash', round: 1, frame: 60, hash: 1 },
      { op: 'ping', t: 12345.678 },
      { op: 'pong', t: 1.5, server: 1759550000000.25 },
    ]
    for (const m of msgs) expect(decode(encode(m))).toEqual(m)
  })

  it('clamps margin and -128 tilt', () => {
    expect((decode(encode({ op: 'frames', round: 1, first: 1, margin: 99999, frames: [] })) as { margin: number }).margin).toBe(32767)
    expect(decode(unhex('0101000000010000000001808003'))).toEqual({ op: 'input', round: 1, first: 1, ack: 0, inputs: [{ x: -127, y: -127, sp: 3 }] })
  })

  it('packs frames like a frames payload', () => {
    const fr: Frame[] = [[{ x: 1, y: 2, sp: 0 }, { x: -1, y: 0, sp: 9 }]]
    expect(hex(packFrames(fr))).toBe('010200ff0009')
    expect(unpackFrames(packFrames(fr))).toEqual(fr)
    expect(unpackFrames(new Uint8Array(5))).toEqual([])
    expect(unpackFrames(new Uint8Array([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6]).subarray(6))).toEqual([[{ x: 1, y: 2, sp: 3 }, { x: 4, y: 5, sp: 6 }]])
  })

  it('rejects malformed packets', () => {
    expect(decode(new Uint8Array())).toBeNull()
    expect(decode(unhex('09'))).toBeNull()
    expect(decode(unhex('01020000012c0000012a027f8103'))).toBeNull()
    expect(decode(unhex('01020000012c0000012a017f810300'))).toBeNull()
    expect(decode(new Uint8Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 33, ...new Array(99).fill(0)]))).toBeNull()
    expect(decode(unhex('0303000000'))).toBeNull()
  })
})
