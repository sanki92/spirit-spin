import { describe, expect, it } from 'vitest'
import { createStepper } from './loop'

describe('fixed-step accumulator', () => {
  it('runs one step per 1/60 s and reports interpolation alpha', () => {
    let steps = 0
    const s = createStepper(60, 5, () => { steps++ })
    expect(s.advance(1000 / 60 * 2.5)).toBeCloseTo(0.5)
    expect(steps).toBe(2)
  })
  it('caps catch-up steps after a long stall', () => {
    let steps = 0
    const s = createStepper(60, 5, () => { steps++ })
    s.advance(5000)
    expect(steps).toBe(5)
  })
  it('time scale slows the sim (hit-stop / slow-mo)', () => {
    let steps = 0
    const s = createStepper(60, 5, () => { steps++ })
    s.scale = 0.5
    s.advance(1000 / 60 * 4)
    expect(steps).toBe(2)
  })
})
