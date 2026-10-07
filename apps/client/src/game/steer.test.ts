import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CALIBRATION } from '@spirit/core'
import { useHud } from '../state/hud'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'
import type { SensorFeed } from '../input/sensors'

const fakeGame = () => ({ bind: () => undefined, skipCine: () => undefined, setBattle: () => undefined, spirits: null, fx: { clearDecals: () => undefined }, arm: () => undefined, stage: { introSweep: () => undefined } }) as unknown as Game

function rig(live = true) {
  const sensors = { live, tilt: vi.fn(() => ({ x: 0.5, y: 0 })), calibrateNeutral: vi.fn() }
  const c = new BattleController(fakeGame(), { seed: 1 } as MatchSetup, { sound: {} as never, sensors: sensors as unknown as SensorFeed, shout: null, calibration: DEFAULT_CALIBRATION, onEnd: () => undefined })
  const p = c as unknown as { playerInput(): { tiltX: number; tiltY: number }; prepRound(): void; enterBattlePhase(): void }
  return { c, p, sensors }
}

describe('steering input', () => {
  it('on-screen stick still steers while motion sensors are live', () => {
    const { c, p } = rig()
    c.setManualTilt(0.8, -1)
    expect(p.playerInput()).toMatchObject({ tiltX: 1, tiltY: -1 })
  })

  it('a thumb resting on the stick zone does not bias tilt steering, full stick still reaches 1', () => {
    const { c, p } = rig()
    c.setManualTilt(0.1, -0.12)
    expect(p.playerInput()).toMatchObject({ tiltX: 0.5, tiltY: 0 })
    c.setManualTilt(-1, 1)
    expect(p.playerInput()).toMatchObject({ tiltX: -0.5, tiltY: 1 })
  })

  it('a held stick or arrow key does not carry into the next round', () => {
    const { c, p } = rig(false)
    c.setManualTilt(1, 0)
    p.prepRound()
    expect(p.playerInput()).toMatchObject({ tiltX: 0, tiltY: 0 })
  })

  it('HUD bars start each round clean instead of showing the last round', () => {
    const { p } = rig(false)
    useHud.getState().set({ spin: [0.7, 0], guard: [0.2, 0], gauge: [1, 0.4], spiritActive: [true, false] })
    p.prepRound()
    expect(useHud.getState()).toMatchObject({ spin: [0, 0], guard: [1, 1], gauge: [0, 0], spiritActive: [false, false] })
  })

  it('tilt neutral is taken once, at the first sim input after launch', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) })
    const { p, sensors } = rig()
    p.enterBattlePhase()
    p.playerInput()
    p.playerInput()
    vi.advanceTimersByTime(2000)
    expect(sensors.calibrateNeutral).toHaveBeenCalledTimes(1)
    expect(sensors.calibrateNeutral.mock.invocationCallOrder[0]).toBeLessThan(sensors.tilt.mock.invocationCallOrder[0]!)
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
