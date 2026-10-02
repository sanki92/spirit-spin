import {
  applyRound, botInput, botRip, composeRip, createBattle, createRng, newMatch, scoreRip, scoreSwipe, stepBattle,
  type BattleEvent, type BotBrain, type Calibration, type MatchState, type RipFail, type RipResult, type RngState,
  type FinishKind, type MotionSample, type TickInput, type TopBuild, type TouchSample,
} from '@spirit/core'
import type { Sound } from '../audio/sound'
import { buzz } from '../input/haptics'
import type { ShoutDetector } from '../input/mic'
import type { SensorFeed } from '../input/sensors'
import { useHud } from '../state/hud'
import { log } from '../telemetry'
import type { Game } from './Game'

export interface MatchSetup {
  player: TopBuild
  opponent: TopBuild
  bot: BotBrain
  playerHesitates: boolean
  seed: number
  art: [string, string]
}

export interface MatchResult {
  winner: 0 | 1
  match: MatchState
  bestRpm: number
  spiritCalls: number
  comeback: boolean
  perfectRips: number
  overspins: number
  finishes: FinishKind[]
  aggression: number
  verdict?: { winner: 0 | 1; scores: [number, number]; rating?: number; delta?: number } | null
}

const GRIP_MS = 1100
const BEAT_MS = 650
const CAPTURE_AFTER_MS = 700
const FAIL_RIP = (t0: number) => composeRip(0.15, 0.3, 0.45, 0, t0)
const FAIL_TEXT: Record<RipFail['reason'], string> = { 'no-pull': 'TOO SOFT', 'too-early': 'FALSE START', 'too-late': 'TOO LATE' }

export class BattleController {
  match: MatchState = newMatch()
  protected botRng: RngState
  protected launchAt = 0
  protected swipe: TouchSample[] | null = null
  protected spiritRequest = false
  protected lastSpiritVia: 'shout' | 'button' | null = null
  protected manualTilt = { x: 0, y: 0 }
  protected events: BattleEvent[] = []
  protected hudTimer = 0
  protected timers: number[] = []
  protected bestRpm = 0
  protected spiritCalls = 0
  protected maxDeficit = 0
  protected perfectRips = 0
  protected roundClashes = 0
  protected perfTimer = 0
  protected overspins = 0
  protected tiltSum = 0
  protected tiltTicks = 0
  protected hesitationLeft: boolean
  protected disposed = false

  constructor(
    protected game: Game,
    protected setup: MatchSetup,
    protected deps: { sound: Sound; sensors: SensorFeed | null; shout: ShoutDetector | null; calibration: Calibration; onEnd: (r: MatchResult) => void },
  ) {
    this.botRng = createRng(setup.seed ^ 0x9e3779b9)
    this.hesitationLeft = setup.playerHesitates
    game.bind(() => this.tick(), dt => this.frame(dt))
  }

  get inputMode(): 'motion' | 'swipe' {
    return this.deps.sensors?.live ? 'motion' : 'swipe'
  }

  start(): void {
    log('match.start', { player: this.setup.player, opponent: this.setup.opponent, bot: this.setup.bot, hesitates: this.setup.playerHesitates, input: this.inputMode })
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
    this.lastSpiritVia = 'button'
  }

  setManualTilt(x: number, y: number): void {
    this.manualTilt = { x, y }
  }

  protected later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(() => !this.disposed && fn(), ms))
  }

  protected beginRound(): void {
    this.countdown(performance.now() + GRIP_MS + BEAT_MS * 3)
  }

  protected countdown(t0: number): void {
    const hud = useHud.getState()
    this.swipe = null
    this.game.setBattle(null)
    this.game.fx.clearDecals()
    hud.set({ phase: 'grip', banner: null, callout: null, cutin: null, countdown: null, inputMode: this.inputMode, round: this.match.round })
    this.game.stage.introSweep()
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

  protected resolveLaunch(): void {
    const t0 = this.launchAt
    let res: RipResult | RipFail
    const motion = this.deps.sensors?.live ? scoreRip(this.deps.sensors.window(t0 - 1100, t0 + CAPTURE_AFTER_MS), t0, this.deps.calibration) : null
    const swiped = this.swipe ? scoreSwipe(this.swipe, t0, window.innerHeight) : null
    const usedSwipe = !!swiped?.ok && (!motion?.ok || swiped.rpm > motion.rpm)
    res = usedSwipe ? (swiped as RipResult) : motion ?? swiped ?? { ok: false, reason: 'no-pull' }
    if (!usedSwipe) this.swipe = null
    const rip = res.ok ? res : FAIL_RIP(t0)
    const opp = botRip(this.botRng, this.setup.bot, this.game.specs![1])
    const win = this.swipe ? null : this.deps.sensors?.window(t0 - 1100, t0 + CAPTURE_AFTER_MS) ?? []
    const mags = win ? win.map(s => Math.hypot(s.ax, s.ay, s.az)) : []
    log('rip', {
      round: this.match.round, mode: this.swipe ? 'swipe' : this.deps.sensors?.live ? 'motion' : 'none', ok: res.ok,
      reason: res.ok ? null : res.reason, rpm: rip.rpm, quality: res.ok ? res.quality : 'FAIL', overspin: res.ok ? res.overspin : false,
      timing: +rip.timing.toFixed(3), straightness: +rip.straightness.toFixed(3), pullRatio: +rip.pullRatio.toFixed(3),
      offsetMs: res.ok ? Math.round(res.startT - t0) : null, style: rip.style, bankDir: rip.bankDir, calibration: this.deps.calibration.pull100,
      samples: win?.length ?? null, peakMs2: mags.length ? +Math.max(...mags).toFixed(1) : null,
      firstOver12Ms: win ? (win.find(s => Math.hypot(s.ax, s.ay, s.az) > 12)?.t ?? null) && Math.round((win.find(s => Math.hypot(s.ax, s.ay, s.az) > 12)!.t) - t0) : null,
      swipePts: this.swipe?.length ?? null, swipeDy: this.swipe ? Math.round((this.swipe[this.swipe.length - 1]?.y ?? 0) - (this.swipe[0]?.y ?? 0)) : null,
      opponentRpm: opp.rpm, opponentQuality: opp.quality,
    })
    this.bestRpm = Math.max(this.bestRpm, rip.rpm)
    if (res.ok && res.quality === 'PERFECT' && !res.overspin) this.perfectRips++
    if (res.ok && res.overspin) this.overspins++
    useHud.getState().set({
      phase: 'launch',
      countdown: null,
      callout: res.ok ? { quality: res.overspin ? 'OVERSPIN' : res.quality, rpm: res.rpm } : { quality: 'FAIL', rpm: rip.rpm, note: FAIL_TEXT[res.reason] },
    })
    this.deps.sound.play('rip', { volume: 0.9 })
    this.deps.sound.play('callout', { rate: res.ok && res.quality === 'PERFECT' ? 1.15 : 1 })
    this.launch(rip, opp, win, usedSwipe ? this.swipe : null)
  }

  protected launch(rip: RipResult, opp: RipResult, _motion: MotionSample[] | null, _swipe: TouchSample[] | null): void {
    const hesitate = this.hesitationLeft
    const battle = createBattle(this.game.specs!, [{ rip, hesitate }, { rip: opp, hesitate: false }], (this.setup.seed + this.match.round * 7919) >>> 0)
    this.game.dropT = 0
    this.game.setBattle(battle)
    this.enterBattlePhase()
  }

  protected enterBattlePhase(): void {
    this.later(1100, () => {
      if (useHud.getState().phase === 'launch') useHud.getState().set({ phase: 'battle', callout: null })
      this.deps.sensors?.calibrateNeutral()
    })
  }

  protected playerInput(): TickInput {
    const sensors = this.deps.sensors
    const tilt = sensors?.live ? sensors.tilt() : this.manualTilt
    this.tiltSum += Math.min(1, Math.hypot(tilt.x, tilt.y))
    this.tiltTicks++
    const spirit = this.spiritRequest
    this.spiritRequest = false
    return { tiltX: tilt.x, tiltY: tilt.y, spirit }
  }

  protected tick(): void {
    const b = this.game.battle
    if (!b) return
    const input = this.playerInput()
    stepBattle(b, [input, botInput(b, 1, this.setup.bot, this.botRng)], this.events)
    for (const e of this.events) this.onEvent(e)
    this.events.length = 0
  }

  protected onEvent(e: BattleEvent): void {
    const g = this.game, s = this.deps.sound, hud = useHud.getState()
    switch (e.k) {
      case 'clash': {
        this.roundClashes++
        const heavy = e.energy > 1.5
        g.fx.clash(e.x, e.y, e.energy, heavy ? g.elementOf(Math.random() < 0.5 ? 0 : 1) : null)
        s.play(heavy ? 'clashHeavy' : 'clash', { volume: Math.min(1, 0.4 + e.energy * 0.3), rate: 0.9 + Math.random() * 0.25 })
        g.stage.shake(Math.min(0.08, e.energy * 0.025))
        if (heavy) {
          g.hitstop(40 + Math.min(60, e.energy * 20))
          g.stage.punch(Math.min(0.07, e.energy * 0.02))
        }
        buzz(heavy ? 35 : 10)
        break
      }
      case 'wall':
        s.play('wall', { volume: 0.35 })
        break
      case 'spirit': {
        log('spirit', { side: e.side, tick: e.tick, via: e.side === 0 ? (this.lastSpiritVia ?? 'button') : 'bot' })
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
        log('hesitate', { side: e.side })
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

  protected finishRound(e: Extract<BattleEvent, { k: 'finish' }>): void {
    const g = this.game, s = this.deps.sound
    const o = e.outcome
    const bt = g.battle!
    log('round', { round: this.match.round, outcome: o, seconds: +(bt.tick / 60).toFixed(1), clashes: this.roundClashes, tops: bt.tops.map(t => ({ spin: +t.spin.toFixed(2), shatter: +t.shatter.toFixed(2), out: t.out, x: +t.x.toFixed(2), y: +t.y.toFixed(2) })), avgTilt: this.tiltTicks ? +(this.tiltSum / this.tiltTicks).toFixed(2) : 0 })
    this.roundClashes = 0
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
      this.concludeMatch()
    })
  }

  protected concludeMatch(): void {
    const s = this.deps.sound
    const won = this.match.winner === 0
    useHud.getState().set({ phase: 'matchEnd', banner: won ? 'victory' : 'defeat' })
    s.play(won ? 'victory' : 'defeat')
    this.later(1800, () =>
      this.deps.onEnd({
        winner: this.match.winner!,
        match: this.match,
        bestRpm: this.bestRpm,
        spiritCalls: this.spiritCalls,
        comeback: won && this.maxDeficit >= 3,
        perfectRips: this.perfectRips,
        overspins: this.overspins,
        finishes: this.match.history.filter(h => h.winner === 0).map(h => h.finish),
        aggression: this.tiltTicks ? this.tiltSum / this.tiltTicks : 0,
        ...this.extra(),
      }),
    )
  }

  protected extra(): Partial<MatchResult> {
    return {}
  }

  protected frame(dt: number): void {
    const shout = this.deps.shout
    if (shout?.ready) {
      const b = this.game.battle
      if (shout.update(dt * 1000) && b && b.tops[0].gauge >= 1) {
        this.spiritRequest = true
        this.lastSpiritVia = 'shout'
        log('shout.trigger', { level: +shout.level.toFixed(2) })
      }
      if (Math.abs(useHud.getState().shoutLevel - shout.level) > 0.04) useHud.getState().set({ shoutLevel: shout.level })
    }
    this.hudTimer += dt
    this.perfTimer += dt
    if (this.perfTimer > 5) {
      this.perfTimer = 0
      const st = this.game.stage
      log('perf', { p95: +st.perf.p95.toFixed(1), slowFrames: st.perf.slow, frames: st.perf.frames, dpr: st.dpr, quality: st.quality, calls: st.renderer.info.render.calls, tris: st.renderer.info.render.triangles, programs: st.renderer.info.programs?.length ?? null, sensorsLive: this.deps.sensors?.live ?? false, shoutLevel: this.deps.shout ? +this.deps.shout.level.toFixed(2) : null })
      st.perf.slow = 0
      st.perf.frames = 0
    }
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
