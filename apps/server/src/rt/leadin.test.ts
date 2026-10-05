import { describe, expect, it } from 'vitest'
import { leadInFor } from './room'

describe('battle lead-in after both launches', () => {
  it('fits the slower player’s ping, within 0.4s and 1.1s', () => {
    expect(leadInFor([40, 60])).toBe(400)
    expect(leadInFor([90, 300])).toBe(550)
    expect(leadInFor([2000, 50])).toBe(1100)
  })

  it('keeps the safe default when a phone did not report its ping', () => {
    expect(leadInFor([40, undefined])).toBe(1100)
    expect(leadInFor([Number.NaN, 40])).toBe(1100)
  })
})
