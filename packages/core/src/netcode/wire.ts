export const WIRE = { tickMs: 1000 / 60, maxInputs: 16, maxFrames: 16, maxReliableFrames: 255, hashEvery: 60, keepAliveMs: 50 } as const

export interface WireInput { x: number; y: number; sp: number }
export type Frame = readonly [WireInput, WireInput]
export const IDLE_INPUT: WireInput = Object.freeze({ x: 0, y: 0, sp: 0 })

export const quantizeTilt = (v: number): number => Math.round((Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0) * 127)
export const tiltOf = (q: number): number => q / 127

export type WireMsg =
  | { op: 'input'; round: number; first: number; ack: number; inputs: WireInput[] }
  | { op: 'frames'; round: number; first: number; margin: number; frames: Frame[] }
  | { op: 'hash'; round: number; frame: number; hash: number }
  | { op: 'ping'; t: number }
  | { op: 'pong'; t: number; server: number }

const OP = { input: 1, frames: 2, hash: 3, ping: 4, pong: 5 } as const
const i8 = (v: number) => (v < -127 ? -127 : v > 127 ? 127 : v)

function put(v: DataView, o: number, p: WireInput): void {
  v.setInt8(o, i8(p.x))
  v.setInt8(o + 1, i8(p.y))
  v.setUint8(o + 2, p.sp & 255)
}

function get(v: DataView, o: number): WireInput {
  return { x: i8(v.getInt8(o)), y: i8(v.getInt8(o + 1)), sp: v.getUint8(o + 2) }
}

export function encode(m: WireMsg): Uint8Array {
  const size = m.op === 'input' ? 11 + 3 * m.inputs.length : m.op === 'frames' ? 9 + 6 * m.frames.length : m.op === 'hash' ? 10 : m.op === 'ping' ? 9 : 17
  const b = new Uint8Array(size)
  const v = new DataView(b.buffer)
  v.setUint8(0, OP[m.op])
  switch (m.op) {
    case 'input':
      v.setUint8(1, m.round & 255)
      v.setUint32(2, m.first)
      v.setInt32(6, m.ack)
      v.setUint8(10, m.inputs.length)
      m.inputs.forEach((p, i) => put(v, 11 + 3 * i, p))
      break
    case 'frames':
      v.setUint8(1, m.round & 255)
      v.setUint32(2, m.first)
      v.setInt16(6, Math.max(-32767, Math.min(32767, Math.round(m.margin))))
      v.setUint8(8, m.frames.length)
      m.frames.forEach((f, i) => { put(v, 9 + 6 * i, f[0]); put(v, 12 + 6 * i, f[1]) })
      break
    case 'hash':
      v.setUint8(1, m.round & 255)
      v.setUint32(2, m.frame)
      v.setUint32(6, m.hash >>> 0)
      break
    case 'ping':
      v.setFloat64(1, m.t)
      break
    case 'pong':
      v.setFloat64(1, m.t)
      v.setFloat64(9, m.server)
  }
  return b
}

export function packFrames(frames: readonly Frame[]): Uint8Array {
  const b = new Uint8Array(frames.length * 6)
  const v = new DataView(b.buffer)
  frames.forEach((f, i) => { put(v, 6 * i, f[0]); put(v, 6 * i + 3, f[1]) })
  return b
}

export function unpackFrames(b: Uint8Array): Frame[] {
  if (b.length % 6) return []
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return Array.from({ length: b.length / 6 }, (_, i) => [get(v, 6 * i), get(v, 6 * i + 3)] as Frame)
}

export function decode(buf: ArrayBuffer | Uint8Array): WireMsg | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (b.length < 1) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  switch (b[0]) {
    case 1: {
      if (b.length < 11) return null
      const n = v.getUint8(10)
      if (n > 32 || b.length !== 11 + 3 * n) return null
      return { op: 'input', round: v.getUint8(1), first: v.getUint32(2), ack: v.getInt32(6), inputs: Array.from({ length: n }, (_, i) => get(v, 11 + 3 * i)) }
    }
    case 2: {
      if (b.length < 9) return null
      const n = v.getUint8(8)
      if (b.length !== 9 + 6 * n) return null
      return { op: 'frames', round: v.getUint8(1), first: v.getUint32(2), margin: v.getInt16(6), frames: Array.from({ length: n }, (_, i) => [get(v, 9 + 6 * i), get(v, 12 + 6 * i)] as [WireInput, WireInput]) }
    }
    case 3: return b.length === 10 ? { op: 'hash', round: v.getUint8(1), frame: v.getUint32(2), hash: v.getUint32(6) } : null
    case 4: return b.length === 9 ? { op: 'ping', t: v.getFloat64(1) } : null
    case 5: return b.length === 17 ? { op: 'pong', t: v.getFloat64(1), server: v.getFloat64(9) } : null
    default: return null
  }
}
