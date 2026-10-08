import { describe, expect, it } from 'vitest'
import { guardLook, guardVisible, toScreen } from './GuardBars'

const fight = { fighting: true, cine: false, zoom: false, summon: false, outcome: false, out: false, broken: false }

describe('floating guard bars', () => {
  it('show only while the tops are fighting', () => {
    expect(guardVisible(fight)).toBe(true)
    expect(guardVisible({ ...fight, fighting: false })).toBe(false)
    expect(guardVisible({ ...fight, cine: true })).toBe(false)
    expect(guardVisible({ ...fight, zoom: true })).toBe(false)
    expect(guardVisible({ ...fight, summon: true })).toBe(false)
    expect(guardVisible({ ...fight, outcome: true })).toBe(false)
    expect(guardVisible({ ...fight, out: true })).toBe(false)
    expect(guardVisible({ ...fight, broken: true })).toBe(false)
  })

  it('maps normalized device coordinates to pixels in place', () => {
    const o = { x: 0, y: 0 }
    expect(toScreen(0, 0, 400, 800, o)).toBe(o)
    expect(o).toEqual({ x: 200, y: 400 })
    toScreen(-1, 1, 400, 800, o)
    expect(o).toEqual({ x: 0, y: 0 })
    toScreen(1, -1, 400, 800, o)
    expect(o).toEqual({ x: 400, y: 800 })
  })

  it('fills to the guard left and turns low under 30%', () => {
    expect(guardLook(1)).toEqual({ pct: 100, low: false })
    expect(guardLook(0.31)).toEqual({ pct: 31, low: false })
    expect(guardLook(0.29)).toEqual({ pct: 29, low: true })
    expect(guardLook(-0.4)).toEqual({ pct: 0, low: true })
    expect(guardLook(1.7)).toEqual({ pct: 100, low: false })
  })
})
