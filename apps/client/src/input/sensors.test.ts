import { afterEach, describe, expect, it, vi } from 'vitest'
import { SensorFeed } from './sensors'

let now = 1000

function rig() {
  now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const s = new SensorFeed()
  const hold = (gx: number, gy: number, gz: number, ms: number, readHz = 60) => {
    let tilt = s.tilt()
    for (let t = 0; t < ms; t += 5) {
      now += 5
      ;(s as unknown as { handle(e: unknown): void }).handle({ accelerationIncludingGravity: { x: gx, y: gy, z: gz }, acceleration: { x: 0, y: 0, z: 0 }, rotationRate: null })
      if (t % Math.round(1000 / readHz) < 5) tilt = s.tilt()
    }
    return tilt
  }
  return { s, hold }
}

afterEach(() => vi.restoreAllMocks())

describe('tilt steering', () => {
  it('a held turn keeps steering instead of fading back to level', () => {
    const { s, hold } = rig()
    hold(0, 7, 6.5, 500)
    s.calibrateNeutral()
    const held = hold(-1.5, 7, 6.5, 6000)
    expect(held.x).toBeGreaterThan(0.4)
  })

  it('letting go after a long turn returns to level without steering the other way', () => {
    const { s, hold } = rig()
    hold(0, 7, 6.5, 500)
    s.calibrateNeutral()
    hold(-1.5, 7, 6.5, 6000)
    const back = hold(0, 7, 6.5, 1000)
    expect(Math.abs(back.x)).toBeLessThan(0.05)
  })

  it('a slight resting tilt is still absorbed into level over a few seconds', () => {
    const { s, hold } = rig()
    hold(0, 7, 6.5, 500)
    s.calibrateNeutral()
    const rest = hold(-0.35, 7, 6.5, 12000)
    expect(Math.abs(rest.x)).toBeLessThan(0.02)
  })

})
