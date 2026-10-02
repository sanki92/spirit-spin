/** FNV-1a over the IEEE-754 bytes of each number. Used for determinism golden tests and server/ghost verification. */
const buf = new DataView(new ArrayBuffer(8))

export function hashNumbers(values: ArrayLike<number>): string {
  let h = 0x811c9dc5
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number
    if (Number.isNaN(v)) throw new Error(`hashNumbers: NaN at index ${i}`)
    buf.setFloat64(0, v)
    for (let b = 0; b < 8; b++) {
      h ^= buf.getUint8(b)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}
