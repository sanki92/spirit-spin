import { describe, expect, it } from 'vitest'
import { hashNumbers } from './hash'

describe('hashNumbers', () => {
  it('is stable and order-sensitive', () => {
    expect(hashNumbers([0.1, 0.2])).toBe(hashNumbers([0.1, 0.2]))
    expect(hashNumbers([0.1, 0.2])).not.toBe(hashNumbers([0.2, 0.1]))
    expect(hashNumbers([1])).toMatch(/^[0-9a-f]{8}$/)
  })
  it('throws on NaN so corrupted state never hashes silently', () => {
    expect(() => hashNumbers([1, Number.NaN])).toThrow()
  })
})
