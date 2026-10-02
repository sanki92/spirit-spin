import { describe, expect, it } from 'vitest'
import { rngNext, rngRange, createRng } from './rng'

describe('rng', () => {
  it('same seed gives identical sequence', () => {
    const a = createRng(123), b = createRng(123)
    for (let i = 0; i < 1000; i++) expect(rngNext(a)).toBe(rngNext(b))
  })
  it('different seeds differ', () => {
    const a = createRng(1), b = createRng(2)
    const sa = Array.from({ length: 10 }, () => rngNext(a)), sb = Array.from({ length: 10 }, () => rngNext(b))
    expect(sa).not.toEqual(sb)
  })
  it('values in [0,1) and range helper respects bounds', () => {
    const r = createRng(99)
    for (let i = 0; i < 5000; i++) {
      const v = rngNext(r); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1)
      const w = rngRange(r, -2, 3); expect(w).toBeGreaterThanOrEqual(-2); expect(w).toBeLessThan(3)
    }
  })
  it('state is plain serializable data', () => {
    const r = createRng(5); rngNext(r)
    const copy = JSON.parse(JSON.stringify(r)); expect(rngNext(copy)).toBe(rngNext(r))
  })
})
