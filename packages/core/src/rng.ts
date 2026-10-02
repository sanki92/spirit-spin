/** Deterministic, serializable PRNG (mulberry32). Integer ops only, so identical on every JS engine. */
export interface RngState { s: number }

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 }
}

export function rngNext(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0
  let t = r.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function rngRange(r: RngState, a: number, b: number): number {
  return a + (b - a) * rngNext(r)
}
