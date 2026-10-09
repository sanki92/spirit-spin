import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CALIBRATION, type BattleEvent } from '@spirit/core'
import { summonReset, useHud } from '../state/hud'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'
import { OnlineController } from './OnlineController'
import { SpectatorController } from './SpectatorController'

vi.mock('../net/rt', () => ({ rt: { on: () => () => undefined, last: () => null, send: () => undefined, battlePings: () => undefined, leave: () => undefined, rtt: 100, toLocalPerf: (t: number) => t } }))
vi.mock('../net/link', () => ({ mainLink: { on: () => () => undefined, close: () => undefined, net: { count: 0, rtt: 0, jitter: 0 }, kind: 'ws', serverNow: () => 0 } }))
vi.mock('../net/edgeLink', () => ({ EdgeLink: class {} }))

type Deps = ConstructorParameters<typeof BattleController>[2]

const top = () => ({ x: 0, y: 0, vx: 0, vy: 0, spin: 1, shatter: 0, gauge: 1, spiritTicks: 0, summonTicks: 0, out: false, shattered: false })

function rig(make: (g: Game, d: Deps) => BattleController = (g, d) => new BattleController(g, { seed: 1 } as MatchSetup, d)) {
  const noop = () => undefined
  const battle = { tick: 100, outcome: null, tops: [top(), top()] }
  const game = {
    bind: noop, skipCine: noop, setBattle: noop, arm: noop, spirits: null, power: null, stadium: null, battle,
    specs: [{ beastId: 'voltfang' }, { beastId: 'nagara' }],
    fx: { clearDecals: noop, burst: noop, clash: noop, crack: noop },
    stage: { introSweep: noop, shake: noop, punch: noop, perf: { p95: 0, slow: 0, frames: 0 } },
    spiritZoom: vi.fn(), frameBoth: vi.fn(), narrowZoom: vi.fn(), releaseZoom: vi.fn(), slowmo: noop, finishCam: () => false, elementOf: () => null, hitstop: noop,
  }
  const sound = { play: noop, voice: noop, hum: noop, stopHums: noop, stopVoice: noop }
  const c = make(game as unknown as Game, { sound: sound as never, sensors: null, calibration: DEFAULT_CALIBRATION, onEnd: noop })
  const p = c as unknown as { onEvent(e: BattleEvent): void; frame(dt: number): void; spiritRequest: boolean }
  const run = (s: number) => { for (let t = 0; t < s - 1e-9; t += 1 / 60) p.frame(1 / 60) }
  return { c, p, game, battle, run }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) })
  vi.stubGlobal('document', { documentElement: { classList: { contains: () => true } } })
  useHud.getState().set({ phase: 'battle', gauge: [0, 0], spiritActive: [false, false], ...summonReset })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('summon presentation online', () => {
  it('holds the summon for its full length when the view races through the summon ticks', () => {
    const { p, game, run } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 0 })
    run(2 / 60)
    p.onEvent({ k: 'takeover', tick: 160, side: 0 })
    expect(useHud.getState().summon).toBe(0)
    expect(game.frameBoth).not.toHaveBeenCalled()
    run(0.8)
    expect(useHud.getState().summon).toBe(0)
    run(0.25)
    expect(useHud.getState().summon).toBeNull()
    expect(game.frameBoth).toHaveBeenCalledTimes(1)
  })

  it('a takeover that arrives after the full summon, as offline, applies at once', () => {
    const { p, game, run } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 1 })
    run(1.02)
    p.onEvent({ k: 'takeover', tick: 160, side: 1 })
    expect(useHud.getState().summon).toBeNull()
    expect(game.frameBoth).toHaveBeenCalledTimes(1)
  })

  it('a spirit cancelled during the held summon drops the pending takeover', () => {
    const { p, game, run } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 0 })
    p.onEvent({ k: 'takeover', tick: 160, side: 0 })
    p.onEvent({ k: 'spiritEnd', tick: 161, side: 0 })
    expect(useHud.getState().summon).toBeNull()
    run(1.5)
    expect(game.frameBoth).not.toHaveBeenCalled()
  })
})

describe('round end during a summon', () => {
  it('waits for the summon to finish, plays the takeover, then ends the round and clears the letterbox', () => {
    const { p, game, run } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 0 })
    p.onEvent({ k: 'takeover', tick: 160, side: 0 })
    p.onEvent({ k: 'finish', tick: 163, outcome: { winner: 0, finish: 'spin', points: 1 } })
    expect(useHud.getState()).toMatchObject({ summon: 0, phase: 'battle' })
    run(1.05)
    expect(game.frameBoth).toHaveBeenCalledTimes(1)
    expect(useHud.getState()).toMatchObject({ summon: null, phase: 'roundEnd' })
  })

  it('clears the letterbox when the round ends on the spirit call tick', () => {
    const { p, run } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 1 })
    p.onEvent({ k: 'finish', tick: 100, outcome: { winner: 1, finish: 'ringout', points: 2 } })
    run(1.05)
    expect(useHud.getState()).toMatchObject({ summon: null, phase: 'roundEnd' })
  })

  it('a round that ends with no summon on screen ends at once', () => {
    const { p } = rig()
    p.onEvent({ k: 'finish', tick: 300, outcome: { winner: 0, finish: 'ringout', points: 2 } })
    expect(useHud.getState().phase).toBe('roundEnd')
  })

  it('a held round end is not lost when the next round starts first', () => {
    const { p } = rig()
    p.onEvent({ k: 'spirit', tick: 100, side: 0 })
    p.onEvent({ k: 'finish', tick: 100, outcome: { winner: 0, finish: 'ringout', points: 2 } })
    ;(p as unknown as { prepRound(): void }).prepRound()
    expect((p as unknown as { match: { scores: number[] } }).match.scores).toEqual([2, 0])
  })
})

describe('refused spirit press', () => {
  it('accepts a press as soon as the rival beast has ended in the sim, before the HUD catches up', () => {
    const { c, p, battle } = rig()
    battle.tops[1]!.spiritTicks = 0
    useHud.getState().set({ gauge: [1, 0], spiritActive: [false, true] })
    c.requestSpirit()
    expect(p.spiritRequest).toBe(true)
    expect(useHud.getState().refused).toBe(0)
  })

  it('refuses a press while the rival beast is out in the sim even if the HUD has not shown it yet', () => {
    const { c, p, battle } = rig()
    battle.tops[1]!.spiritTicks = 90
    useHud.getState().set({ gauge: [0.4, 0], spiritActive: [false, false] })
    c.requestSpirit()
    expect(p.spiritRequest).toBe(false)
    expect(useHud.getState().refused).toBe(1)
  })
})

describe('a round end held for a summon', () => {
  const end = { k: 'end', round: 1, outcome: { winner: 0, finish: 'spin', points: 1 }, scores: [1, 0], winner: null } as const
  const online = () => rig((g, d) => new OnlineController(g, { seed: 1 } as MatchSetup, d, 0))
  const spectator = () => rig((g, d) => new SpectatorController(g, { seed: 1 } as MatchSetup, d, ['A', 'B']))
  type Net = { onNet(m: unknown): void; ripRound: number; finishRound(e: unknown): void }

  for (const [name, make, left] of [['online', online, { k: 'left', reason: 'quit' }], ['spectator', spectator, { k: 'left', winner: 0 }]] as const) {
    it(`${name}: is dropped when the match was decided while it was held`, () => {
      const { p, run } = make()
      const n = p as unknown as Net
      n.ripRound = 1
      p.onEvent({ k: 'spirit', tick: 100, side: 0 })
      n.onNet(end)
      n.onNet(left)
      vi.advanceTimersByTime(2000)
      expect(useHud.getState().phase).toBe('matchEnd')
      run(1.05)
      expect(useHud.getState().phase).toBe('matchEnd')
    })

    it(`${name}: a duplicate end while one is held is applied once`, () => {
      const { p, run } = make()
      const n = p as unknown as Net
      n.ripRound = 1
      const spy = vi.spyOn(n, 'finishRound')
      p.onEvent({ k: 'spirit', tick: 100, side: 0 })
      n.onNet(end)
      n.onNet(end)
      run(1.05)
      n.onNet(end)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  }
})
