import {
  applyRound, botInput, botRip, composeRip, createBattle, createRng, newMatch, scoreRip, scoreSwipe, stepBattle,
  type BattleEvent, type BotBrain, type Calibration, type MatchState, type RipFail, type RipResult, type RngState,
  type TickInput, type TopBuild, type TouchSample,
} from '@spirit/core'
import type { Sound } from '../audio/sound'
import { buzz } from '../input/haptics'
import type { ShoutDetector } from '../input/mic'
import type { SensorFeed } from '../input/sensors'
import { useHud } from '../state/hud'
import type { Game } from './Game'

export interface MatchSetup {
  player: TopBuild
  opponent: TopBuild
  bot: BotBrain
  playerHesitates: boolean
  seed: number
  art: [string, string]
}

export interface MatchResult { winner: 0 | 1; match: MatchState; bestRpm: number; spiritCalls: number; comeback: boolean }

const GRIP_MS = 1100
const BEAT_MS = 650
const CAPTURE_AFTER_MS = 700
const FAIL_RIP = (t0: number) => composeRip(0.15, 0.3, 0.45, 0, t0)
const FAIL_TEXT: Record<RipFail['reason'], string> = { 'no-pull': 'TOO SOFT', 'too-early': 'FALSE START', 'too-late': 'TOO LATE' }

export class BattleController {
  match: MatchState = newMatch()
  private botRng: RngState
  private launchAt = 0
  private swipe: TouchSample[] | null = null
  private spiritRequest = false
  private manualTilt = { x: 0, y: 0 }
  private events: BattleEvent[] = []
  private hudTimer = 0
  private timers: number[] = []
  private bestRpm = 0
  private spiritCalls = 0
  private maxDeficit = 0
  private hesitationLeft: boolean
  private disposed = false

  constructor(
    private game: Game,
    private setup: MatchSetup,
    private deps: { sound: Sound; sensors: SensorFeed | null; shout: ShoutDetector | null; calibration: Calibration; onEnd: (r: MatchResult) => void },
  ) {
    this.botRng = createRng(setup.seed ^ 0x9e3779b9)
    this.hesitationLeft = setup.playerHesitates
    game.bind(() => this.tick(), dt => this.frame(dt))
  }

  get inputMode(): 'motion' | 'swipe' {
    return this.deps.sensors?.live ? 'motion' : 'swipe'
  }

  start(): void {
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null })
    this.later(1400, () => this.beginRound())
  }

  dispose(): void {
    this.disposed = true
    this.deps.sound.stopHums()
    for (const t of this.timers) clearTimeout(t)
    this.game.setBattle(null)
  }

  submitSwipe(points: TouchSample[]): void {
    if (useHud.getState().phase === 'countdown' || useHud.getState().phase === 'grip') this.swipe = points
  }

  requestSpirit(): void {
    this.spiritRequest = true
  }

  setManualTilt(x: number, y: number): void {
    this.manualTilt = { x, y }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(() => !this.disposed && fn(), ms))
  }

  private beginRound(): void {
    const hud = useHud.getState()
    this.swipe = null
    this.game.setBattle(null)
    this.game.fx.clearDecals()
    hud.set({ phase: 'grip', banner: null, callout: null, cutin: null, countdown: null, inputMode: this.inputMode, round: this.match.round })
    this.deps.sensors?.calibrateNeutral()
    const t0 = performance.now() + GRIP_MS + BEAT_MS * 3
    this.launchAt = t0
    const s = this.deps.sound
    for (const [i, label] of (['3', '2', '1'] as const).entries()) {
      const at = t0 - BEAT_MS * (3 - i)
      s.play('tick', { at: s.perfToAudio(at), volume: 0.8 })
      this.later(at - performance.now(), () => useHud.getState().set({ phase: 'countdown', countdown: label }))
    }
    s.play('launch', { at: s.perfToAudio(t0) })
    this.later(t0 - performance.now(), () => {
      useHud.getState().set({ countdown: 'LAUNCH' })
      buzz(40)
    })
    this.later(t0 + CAPTURE_AFTER_MS - performance.now(), () => this.resolveLaunch())
  }

  private resolveLaunch(): void {
    const t0 = this.launchAt
    let res: RipResult | RipFail
    if (this.swipe) res = scoreSwipe(this.swipe, t0, window.innerHeight)
    else if (this.deps.sensors?.live) res = scoreRip(this.deps.sensors.window(t0 - 1100, t0 + CAPTURE_AFTER_MS), t0, this.deps.calibration)
    else res = { ok: false, reason: 'no-pull' }
    const rip = res.ok ? res : FAIL_RIP(t0)
    this.bestRpm = Math.max(this.bestRpm, rip.rpm)
    useHud.getState().set({
      phase: 'launch',
      countdown: null,
      callout: res.ok ? { quality: res.overspin ? 'OVERSPIN' : res.quality, rpm: res.rpm } : { quality: 'FAIL', rpm: rip.rpm, note: FAIL_TEXT[res.reason] },
    })
    this.deps.sound.play('rip', { volume: 0.9 })
    this.deps.sound.play('callout', { rate: res.ok && res.quality === 'PERFECT' ? 1.15 : 1 })
    const opp = botRip(this.botRng, this.setup.bot, this.game.specs![1])
    const hesitate = this.hesitationLeft
    const battle = createBattle(this.game.specs!, [{ rip, hesitate }, { rip: opp, hesitate: false }], (this.setup.seed + this.match.round * 7919) >>> 0)
    this.game.dropT = 0
    this.game.setBattle(battle)
    this.later(1100, () => {
      if (useHud.getState().phase === 'launch') useHud.getState().set({ phase: 'battle', callout: null })
    })
  }

  private playerInput(): TickInput {
    const sensors = this.deps.sensors
    const tilt = sensors?.live ? sensors.tilt() : this.manualTilt
    const spirit = this.spiritRequest
    this.spiritRequest = false
    return { tiltX: tilt.x, tiltY: tilt.y, spirit }
  }

  private tick(): void {
    const b = this.game.battle
    if (!b) return
    const input = this.playerInput()
    stepBattle(b, [input, botInput(b, 1, this.setup.bot, this.botRng)], this.events)
    for (const e of this.events) this.onEvent(e)
    this.events.length = 0
  }

  private onEvent(e: BattleEvent): void {
    const g = this.game, s = this.deps.sound, hud = useHud.getState()
    switch (e.k) {
      case 'clash': {
        const heavy = e.energy > 1.5
        g.fx.clash(e.x, e.y, e.energy, heavy ? g.elementOf(Math.random() < 0.5 ? 0 : 1) : null)
        s.play(heavy ? 'clashHeavy' : 'clash', { volume: Math.min(1, 0.4 + e.energy * 0.3), rate: 0.9 + Math.random() * 0.25 })
        g.stage.shake(Math.min(0.08, e.energy * 0.025))
        if (heavy) g.hitstop(40 + Math.min(60, e.energy * 20))
        buzz(heavy ? 35 : 10)
        break
      }
      case 'wall':
        s.play('wall', { volume: 0.35 })
        break
      case 'spirit': {
        this.spiritCalls += e.side === 0 ? 1 : 0
        const t = g.battle!.tops[e.side]
        hud.set({ cutin: { beast: g.specs![e.side].beastId, side: e.side, hesitate: false } })
        g.spirits?.[e.side].show(true)
        g.fx.burst(t.x, t.y)
        g.slowmo(0.3, 1000)
        s.play('spirit')
        buzz([30, 40, 60])
        this.later(1300, () => useHud.getState().set({ cutin: null }))
        break
      }
      case 'hesitate':
        this.hesitationLeft = false
        hud.set({ cutin: { beast: g.specs![e.side].beastId, side: e.side, hesitate: true } })
        s.play('hesitate')
        this.later(1400, () => useHud.getState().set({ cutin: null }))
        break
      case 'spiritEnd':
        g.spirits?.[e.side].show(false)
        break
      case 'finish':
        this.finishRound(e)
        break
    }
  }

  private finishRound(e: Extract<BattleEvent, { k: 'finish' }>): void {
    const g = this.game, s = this.deps.sound
    const o = e.outcome
    const b = g.battle!
    if (o.finish === 'shatter' || (o.finish === 'spirit' && o.winner !== null && b.tops[(1 - o.winner) as 0 | 1].shattered)) {
      const loser = b.tops[(1 - (o.winner ?? 0)) as 0 | 1]
      g.fx.crack(loser.x, loser.y)
    }
    g.slowmo(0.25, 1300)
    g.stage.shake(0.1)
    s.play(o.finish === 'ringout' ? 'ringout' : o.finish === 'shatter' ? 'shatter' : o.finish === 'spin' ? 'spinDown' : 'finish')
    buzz([60, 40, 120])
    g.spirits?.forEach(sp => sp.show(false))
    this.match = applyRound(this.match, o)
    const [p, q] = this.match.scores
    this.maxDeficit = Math.max(this.maxDeficit, q - p)
    useHud.getState().set({ phase: 'roundEnd', banner: o.finish, scores: this.match.scores })
    this.later(2300, () => {
      if (this.match.winner === null) return this.beginRound()
      const won = this.match.winner === 0
      useHud.getState().set({ phase: 'matchEnd', banner: won ? 'victory' : 'defeat' })
      s.play(won ? 'victory' : 'defeat')
      this.later(1800, () =>
        this.deps.onEnd({ winner: this.match.winner!, match: this.match, bestRpm: this.bestRpm, spiritCalls: this.spiritCalls, comeback: won && this.maxDeficit >= 3 }),
      )
    })
  }

  private frame(dt: number): void {
    const shout = this.deps.shout
    if (shout?.ready) {
      const b = this.game.battle
      if (shout.update(dt * 1000) && b && b.tops[0].gauge >= 1) this.spiritRequest = true
      if (Math.abs(useHud.getState().shoutLevel - shout.level) > 0.04) useHud.getState().set({ shoutLevel: shout.level })
    }
    this.hudTimer += dt
    const b = this.game.battle
    if (b) {
      this.deps.sound.hum(0, b.outcome || b.tops[0].out ? 0 : b.tops[0].spin)
      this.deps.sound.hum(1, b.outcome || b.tops[1].out ? 0 : b.tops[1].spin)
    } else this.deps.sound.stopHums()
    if (b && this.hudTimer > 0.1) {
      this.hudTimer = 0
      useHud.getState().set({
        spin: [b.tops[0].spin, b.tops[1].spin],
        gauge: [b.tops[0].gauge, b.tops[1].gauge],
        spiritActive: [b.tops[0].spiritTicks > 0, b.tops[1].spiritTicks > 0],
      })
    }
  }
}
