import {
  applyRound, botInput, replaysFinish, botRip, composeRip, RIP, createBattle, createRng, newMatch, scoreRip, scoreSwipe, stepBattle,
  type BattleEvent, type BotBrain, type Calibration, type MatchState, type RipFail, type RipResult, type RngState, type Side,
  type FinishKind, type MotionSample, type TickInput, type TopBuild, type TouchSample,
} from '@spirit/core'
import type { Sound } from '../audio/sound'
import { buzz } from '../input/haptics'
import type { ShoutDetector } from '../input/mic'
import { deadzone, type SensorFeed } from '../input/sensors'
import { useHud } from '../state/hud'
import { log } from '../telemetry'
import type { Game } from './Game'
import { Announcer } from './commentator'
import { useSave } from '../state/save'
import { coachTip } from './coach'
import { tierOf, type LaunchTier } from './launchPlan'
import { spiritTransitions, type SpiritSeen } from './transitions'

export interface MatchSetup {
  player: TopBuild
  opponent: TopBuild
  bot: BotBrain
  playerHesitates: boolean
  seed: number
  art: [string, string]
  coach?: boolean
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
const CAPTURE_AFTER_MS = 850
const FAIL_RIP = (t0: number) => composeRip(0.15, 0.3, 0.45, 0, t0)
const RESOLVE_AFTER_START_MS = RIP.windowMs + 10
const mag = (s: MotionSample) => Math.hypot(s.ax, s.ay, s.az)
export const FAIL_TEXT: Record<RipFail['reason'], string> = { 'no-pull': 'TOO SOFT', 'too-early': 'FALSE START', 'too-late': 'TOO LATE' }

export class BattleController {
  match: MatchState = newMatch()
  protected botRng: RngState
  protected launchAt = 0
  protected swipe: TouchSample[] | null = null
  protected swipeLive: TouchSample[] | null = null
  protected spiritRequest = false
  protected lastSpiritVia: 'shout' | 'button' | null = null
  protected manualTilt = { x: 0, y: 0 }
  protected needNeutral = false
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
  protected announcer: Announcer
  protected resolvedAt = -1
  protected earlyResolve = true
  protected finishCamOk = true
  protected concluded = false
  protected windowFrom = -Infinity
  protected coachSince = 0
  protected coached = false
  protected pullShown = 0
  protected lastTiers: [LaunchTier, LaunchTier] = ['GOOD', 'GOOD']

  constructor(
    protected game: Game,
    protected setup: MatchSetup,
    protected deps: { sound: Sound; sensors: SensorFeed | null; shout: ShoutDetector | null; calibration: Calibration; onEnd: (r: MatchResult) => void; onCalibrate?: (pulls: number[]) => Calibration; onAbort?: () => void },
  ) {
    this.botRng = createRng(setup.seed ^ 0x9e3779b9)
    this.hesitationLeft = setup.playerHesitates
    this.announcer = new Announcer(deps.sound, () => useSave.getState().settings.commentator !== false)
    game.bind(() => this.tick(), dt => this.frame(dt))
    game.onLand = (side, tier) => {
      if (this.disposed) return
      const hard = tier === 'PERFECT' || tier === 'GREAT' || tier === 'OVERSPIN'
      deps.sound.play(hard ? 'clashHeavy' : 'clash', { volume: tier === 'FAIL' || tier === 'WEAK' ? 0.35 : hard ? 0.8 : 0.55, rate: tier === 'PERFECT' ? 0.8 : 1 })
      if (side === 0) buzz(tier === 'PERFECT' ? [40, 30, 70] : hard ? 35 : 15)
    }
  }

  get inputMode(): 'motion' | 'swipe' {
    return this.deps.sensors?.live ? 'motion' : 'swipe'
  }

  start(): void {
    log('match.start', { player: this.setup.player, opponent: this.setup.opponent, bot: this.setup.bot, hesitates: this.setup.playerHesitates, input: this.inputMode })
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null, coachTip: null, coach: false, pull: 0 })
    this.later(300, () => this.announcer.say('intro', true))
    this.later(1400, () => this.beginRound())
  }

  dispose(): void {
    this.disposed = true
    useHud.getState().set({ coachTip: null, coach: false, pull: 0 })
    this.announcer.dispose()
    this.deps.sound.stopHums()
    for (const t of this.timers) clearTimeout(t)
    this.game.setBattle(null)
  }

  submitSwipe(points: TouchSample[]): void {
    this.swipeLive = null
    if (this.swipeOpen()) this.swipe = points
  }

  trackSwipe(points: TouchSample[]): void {
    if (this.swipeOpen()) this.swipeLive = points
  }

  private swipeOpen(): boolean {
    const p = useHud.getState().phase
    return (p === 'countdown' || p === 'grip' || p === 'coach') && this.resolvedAt !== this.launchAt
  }

  protected launchSwipe(): TouchSample[] | null {
    return this.swipe ?? (this.swipeLive ? [...this.swipeLive] : null)
  }

  requestSpirit(): void {
    this.spiritRequest = true
    this.lastSpiritVia = 'button'
  }

  setManualTilt(x: number, y: number): void {
    this.manualTilt = { x: deadzone(x, 0.15), y: deadzone(y, 0.15) }
  }

  protected later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(() => !this.disposed && fn(), ms))
  }

  protected beginRound(): void {
    if (this.setup.coach && !this.coached && this.match.round === 1) return this.coachRound()
    this.countdown(performance.now() + (this.match.round === 1 ? GRIP_MS * 2.2 : GRIP_MS) + BEAT_MS * 3)
  }

  protected prepRound(): void {
    this.game.skipCine(false)
    this.swipe = null
    this.swipeLive = null
    this.manualTilt = { x: 0, y: 0 }
    this.windowFrom = -Infinity
    this.pullShown = 0
    this.game.setBattle(null)
    this.game.spirits?.forEach(sp => sp.reset())
    this.game.fx.clearDecals()
    this.game.arm()
    useHud.getState().set({ phase: 'grip', banner: null, callout: null, cutin: null, countdown: null, cine: false, pull: 0, spin: [0, 0], guard: [1, 1], gauge: [0, 0], spiritActive: [false, false], summon: null, coachTip: null, coach: !!this.setup.coach && !this.coached, inputMode: this.inputMode, round: this.match.round })
    this.game.stage.introSweep()
  }

  protected countdown(t0: number): void {
    this.prepRound()
    this.launchAt = t0
    const s = this.deps.sound
    for (const [i, label] of (['3', '2', '1'] as const).entries()) {
      const at = t0 - BEAT_MS * (3 - i)
      s.play('tick', { at: s.perfToAudio(at), volume: 0.8 })
      this.later(at - performance.now(), () => { if (this.resolvedAt !== t0) useHud.getState().set({ phase: 'countdown', countdown: label }) })
    }
    s.play('launch', { at: s.perfToAudio(t0) })
    this.later(t0 - performance.now(), () => {
      if (this.resolvedAt === t0) return
      useHud.getState().set({ countdown: 'LAUNCH' })
      buzz(40)
      this.announcer.say('rip', true)
    })
    this.later(t0 + CAPTURE_AFTER_MS - performance.now(), () => this.resolveLaunch())
  }

  protected coachRound(): void {
    this.prepRound()
    this.launchAt = Infinity
    const s = this.deps.sound
    const start = performance.now() + GRIP_MS
    for (const [i, label] of (['3', '2', '1'] as const).entries()) {
      const at = start + BEAT_MS * i
      s.play('tick', { at: s.perfToAudio(at), volume: 0.8 })
      this.later(at - performance.now(), () => useHud.getState().set({ phase: 'countdown', countdown: label }))
    }
    this.later(start + BEAT_MS * 3 - performance.now(), () => {
      this.swipe = null
      this.coachSince = performance.now()
      useHud.getState().set({ phase: 'coach', countdown: null })
      buzz(20)
    })
  }

  protected adjudicate(res: RipResult | RipFail, _motion: MotionSample[] | null, _swipe: TouchSample[] | null, _preferSwipe: boolean): RipResult | RipFail {
    return res
  }

  protected pollLaunch(now: number): void {
    const phase = useHud.getState().phase
    const sensors = this.deps.sensors?.live ? this.deps.sensors : null
    if (phase === 'coach') {
      const from = this.coachSince + 400
      const start = now > from ? sensors?.window(from, now).find(s => mag(s) > RIP.startThreshold) : undefined
      if (start && now >= start.t + RESOLVE_AFTER_START_MS) {
        this.windowFrom = from
        this.launchAt = start.t - RIP.timingCenterMs
        this.swipe = null
        this.resolveLaunch()
      } else if (!start && this.swipe) {
        const t0 = this.swipe[0]!.t
        if (scoreSwipe(this.swipe, t0, window.innerHeight).ok) {
          this.launchAt = t0
          this.resolveLaunch()
        } else this.swipe = null
      }
      return
    }
    if (!this.earlyResolve || phase !== 'countdown' || now < this.launchAt || this.resolvedAt === this.launchAt) return
    const t0 = this.launchAt
    const start = sensors?.window(t0 + RIP.earliestMs, t0 + RIP.latestMs).find(s => mag(s) > RIP.startThreshold)
    if (start && now < start.t + RESOLVE_AFTER_START_MS) return
    if (start || (this.swipe && scoreSwipe(this.swipe, t0, window.innerHeight).ok)) this.resolveLaunch()
  }

  protected meterPull(now: number): void {
    const sensors = this.deps.sensors
    const phase = useHud.getState().phase
    if (!sensors?.live || (phase !== 'countdown' && phase !== 'coach')) return
    const w = sensors.window(now - RIP.windowMs, now)
    let pull = 0
    for (let i = 1; i < w.length; i++) pull += mag(w[i]!) * Math.min((w[i]!.t - w[i - 1]!.t) / 1000, 1 / 30)
    this.pullShown = Math.max(pull / this.deps.calibration.pull100, this.pullShown - 1.2 / 60)
    if (Math.abs(useHud.getState().pull - this.pullShown) > 0.015) useHud.getState().set({ pull: this.pullShown })
  }

  protected resolveLaunch(): void {
    const t0 = this.launchAt
    if (this.resolvedAt === t0 || this.disposed) return
    this.resolvedAt = t0
    this.swipe = this.launchSwipe()
    this.swipeLive = null
    const coaching = useHud.getState().phase === 'coach'
    let res: RipResult | RipFail
    const from = Math.max(t0 - 1100, this.windowFrom)
    if (coaching) this.calibrateFromCoach(from, t0)
    const motion = this.deps.sensors?.live ? scoreRip(this.deps.sensors.window(from, t0 + CAPTURE_AFTER_MS), t0, this.deps.calibration) : null
    const swiped = this.swipe ? scoreSwipe(this.swipe, t0, window.innerHeight) : null
    const usedSwipe = !!swiped?.ok && (!motion?.ok || swiped.rpm > motion.rpm)
    res = usedSwipe ? (swiped as RipResult) : motion ?? swiped ?? { ok: false, reason: 'no-pull' }
    const swipeRaw = this.swipe
    if (!usedSwipe) this.swipe = null
    const motionWin = this.deps.sensors?.live ? this.deps.sensors.window(from, t0 + CAPTURE_AFTER_MS) : null
    const win = this.swipe ? null : motionWin ?? []
    res = this.adjudicate(res, motionWin, swipeRaw, usedSwipe)
    const rip = res.ok ? res : FAIL_RIP(t0)
    const opp = botRip(this.botRng, this.setup.bot, this.game.specs![1])
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
    this.lastTiers = [tierOf(res), tierOf(opp)]
    if (coaching) this.finishCoach(res, usedSwipe || !motion)
    useHud.getState().set({
      phase: 'launch',
      countdown: null,
      pull: 0,
      callout: res.ok ? { quality: res.overspin ? 'OVERSPIN' : res.quality, rpm: res.rpm } : { quality: 'FAIL', rpm: rip.rpm, note: FAIL_TEXT[res.reason] },
    })
    const cue = !res.ok ? 'weak' : res.overspin ? 'overspin' : res.quality === 'PERFECT' ? 'perfect' : res.quality === 'WEAK' ? 'weak' : null
    if (cue) this.later(500, () => this.announcer.say(cue, true))
    this.deps.sound.play('rip', { volume: 0.9 })
    this.deps.sound.play('callout', { rate: res.ok && res.quality === 'PERFECT' ? 1.15 : 1 })
    this.launch(rip, opp, win, usedSwipe ? this.swipe : null)
  }

  protected launch(rip: RipResult, opp: RipResult, _motion: MotionSample[] | null, _swipe: TouchSample[] | null): void {
    const hesitate = this.hesitationLeft
    const battle = createBattle(this.game.specs!, [{ rip, hesitate }, { rip: opp, hesitate: false }], (this.setup.seed + this.match.round * 7919) >>> 0)
    this.game.setBattle(battle)
    this.game.launch(this.lastTiers)
    this.enterBattlePhase()
  }

  protected calibrateFromCoach(from: number, t0: number): void {
    const s = useSave.getState()
    if (!this.deps.sensors?.live || this.swipe || s.onboarded.calibrated || !this.deps.onCalibrate) return
    const raw = scoreRip(this.deps.sensors.window(from, t0 + CAPTURE_AFTER_MS), t0, { pull100: 1 })
    if (!raw.ok) return
    this.deps.calibration = this.deps.onCalibrate([raw.pullRatio])
    s.markOnboarded('calibrated')
  }

  protected finishCoach(res: RipResult | RipFail, swipe: boolean): void {
    this.coached = true
    log('coach.launch', { ok: res.ok, quality: res.ok ? res.quality : res.reason, swipe, waitedMs: Math.round(performance.now() - this.coachSince) })
    useHud.getState().set({ coach: false, coachTip: coachTip(res, swipe) })
    this.later(5200, () => useHud.getState().set({ coachTip: null }))
  }

  protected enterBattlePhase(): void {
    this.needNeutral = true
    this.later(1100, () => {
      if (useHud.getState().phase === 'launch') useHud.getState().set({ phase: 'battle', callout: null })
    })
  }

  protected currentTilt(): { x: number; y: number } {
    const m = this.manualTilt, sensors = this.deps.sensors
    if (!sensors?.live) return m
    if (this.needNeutral) { sensors.calibrateNeutral(); this.needNeutral = false }
    const s = sensors.tilt()
    return { x: Math.max(-1, Math.min(1, s.x + m.x)), y: Math.max(-1, Math.min(1, s.y + m.y)) }
  }

  protected playerInput(): TickInput {
    const tilt = this.currentTilt()
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

  protected spiritSeen: SpiritSeen = { spirit: [false, false], summon: [false, false] }

  protected transitions(): void {
    const b = this.game.battle
    if (b) for (const e of spiritTransitions(b.tops, b.tick, this.spiritSeen)) this.onEvent(e)
  }

  protected onEvent(e: BattleEvent): void {
    const g = this.game, s = this.deps.sound, hud = useHud.getState()
    switch (e.k) {
      case 'clash': {
        this.roundClashes++
        g.noteClash(e.x, e.y, e.energy)
        const heavy = e.energy > 1.5
        g.fx.clash(e.x, e.y, e.energy, heavy ? g.elementOf(Math.random() < 0.5 ? 0 : 1) : null)
        s.play(heavy ? 'clashHeavy' : 'clash', { volume: Math.min(1, 0.4 + e.energy * 0.3), rate: 0.9 + Math.random() * 0.25 })
        g.stage.shake(Math.min(0.08, e.energy * 0.025))
        if (heavy) {
          this.announcer.say('clash')
          g.hitstop(40 + Math.min(60, e.energy * 20))
          g.stage.punch(Math.min(0.07, e.energy * 0.02))
        }
        buzz(heavy ? 35 : 10)
        break
      }
      case 'wall': {
        s.play('wall', { volume: 0.35 })
        const t = g.battle?.tops[e.side]
        if (t) g.stadium?.hitWall(t.x, t.y, Math.min(1.6, 0.5 + Math.hypot(t.vx, t.vy)))
        break
      }
      case 'spirit': {
        log('spirit', { side: e.side, tick: e.tick, via: e.side === 0 ? (this.lastSpiritVia ?? 'button') : 'bot' })
        this.spiritCalls += e.side === 0 ? 1 : 0
        const t = g.battle!.tops[e.side]
        hud.set({ cutin: { beast: g.specs![e.side].beastId, side: e.side, hesitate: false } })
        g.spirits?.[e.side].pose(false)
        g.spirits?.[e.side].show(true)
        this.later(1100, () => this.announcer.say('spirit', true))
        g.fx.burst(t.x, t.y)
        g.spiritZoom(e.side, 1100)
        hud.set({ summon: e.side })
        s.play('spirit')
        buzz([30, 40, 60])
        this.later(1300, () => useHud.getState().set({ cutin: null }))
        break
      }
      case 'takeover':
        g.spirits?.[e.side].pose(true)
        g.frameBoth(2500)
        if (useHud.getState().summon === e.side) hud.set({ summon: null })
        break
      case 'beast': {
        g.power?.onEvent(e, g.battle?.tops ?? null)
        const el = g.elementOf(e.side)
        if (e.move === 'shockwave' || e.move === 'fling') { g.fx.burst(e.x, e.y); g.stage.shake(0.06); s.play('clashHeavy', { volume: 0.6, rate: 0.8 }) }
        else if (e.move === 'strike' || e.move === 'dive' || e.move === 'pounce') { g.fx.clash(e.x, e.y, 2.5, el); g.hitstop(45); g.stage.punch(0.04); s.play('clashHeavy', { volume: 0.7 }) }
        else g.fx.clash(e.x, e.y, 1, el)
        buzz(e.move === 'strike' ? 30 : 12)
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
    const loser = o.winner === null ? null : ((1 - o.winner) as 0 | 1)
    g.spirits?.forEach(sp => sp.show(false))
    this.match = applyRound(this.match, o)
    this.announcer.say(o.finish === 'ringout' ? 'ringout' : o.finish === 'shatter' ? 'shatter' : o.finish === 'spin' ? 'spin' : o.finish === 'spirit' ? 'spiritFinish' : 'draw', true)
    const [p, q] = this.match.scores
    this.maxDeficit = Math.max(this.maxDeficit, q - p)
    const impact = () => {
      if (this.disposed) return
      if (o.finish === 'shatter' || (o.finish === 'spirit' && loser !== null && b.tops[loser].shattered)) {
        const l = b.tops[loser ?? 1]
        g.fx.crack(l.x, l.y)
        g.shatter(loser ?? 1, l.x, l.y)
      }
      g.stage.shake(0.1)
      s.play(o.finish === 'ringout' ? 'ringout' : o.finish === 'shatter' ? 'shatter' : o.finish === 'spin' ? 'spinDown' : 'finish')
      buzz([60, 40, 120])
      useHud.getState().set({ phase: 'roundEnd', banner: o.finish, scores: this.match.scores, cine: false })
      if (this.match.winner === null && Math.max(p, q) >= 3) this.later(1800, () => this.announcer.say('matchPoint', true))
      this.later(2300, () => {
        if (this.match.winner === null) return this.beginRound()
        this.concludeMatch()
      })
    }
    const still = document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
    const decisive = replaysFinish(o, this.match.winner !== null)
    if (!still && decisive && this.finishCamOk && g.finishCam(loser, impact)) {
      s.play('clashHeavy', { volume: 0.5, rate: 0.55 })
      useHud.getState().set({ phase: 'roundEnd', banner: null, cine: true })
      log('finishCam', { round: this.match.round, finish: o.finish })
    } else {
      g.slowmo(0.25, 1300)
      impact()
    }
  }

  protected concludeMatch(): void {
    if (this.concluded) return
    this.concluded = true
    const s = this.deps.sound
    const won = this.match.winner === 0
    this.announcer.say(won && this.maxDeficit >= 3 ? 'comeback' : won ? 'victory' : 'defeat', true)
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
    const now = performance.now()
    this.meterPull(now)
    this.pollLaunch(now)
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
        guard: [1 - b.tops[0].shatter, 1 - b.tops[1].shatter],
        gauge: [b.tops[0].gauge, b.tops[1].gauge],
        spiritActive: [b.tops[0].spiritTicks > 0, b.tops[1].spiritTicks > 0],
      })
    }
  }
}
