import { beginAt, chooseDelay, createBattle, NetDriver, startTimeline, targetMargin, type BattleEvent, type BattleState, type ClientMsg, type MotionSample, type RipFail, type RipPayload, type RipResult, type ServerMsg, type Side, type Timeline, type TouchSample, type WireMsg } from '@spirit/core'
import { mainLink, type WireLink } from '../net/link'
import { rt } from '../net/rt'
import { useHud } from '../state/hud'
import { log } from '../telemetry'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'
import { tierOf } from './launchPlan'
import { bestPayload, calloutOf, judged } from './ripPayload'

const flipWinner = (w: Side | null) => (w === null ? null : ((1 - w) as Side))
const view = (s: BattleState, side: Side): BattleState =>
  side === 0 ? s : { ...s, tops: [s.tops[1], s.tops[0]], specs: [s.specs[1], s.specs[0]], outcome: s.outcome && { ...s.outcome, winner: flipWinner(s.outcome.winner) } }

export class OnlineController extends BattleController {
  driver: NetDriver | null = null
  link: WireLink = mainLink
  private unwire: () => void = () => undefined
  private beginServer = Infinity
  private lastMargin = 0
  private serverFrame = 0
  private statsAt = 0
  private ripRound = 0
  private ended = false
  private spiritSeen: [boolean, boolean] = [false, false]
  private unsub: () => void
  protected override earlyResolve = false
  protected override finishCamOk = false
  private sent: RipPayload | null = null
  private pendingRip: ClientMsg | null = null
  private startedRound = 0

  constructor(game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2], private side: Side) {
    super(game, setup, deps)
    game.timeWarp = false
    this.unsub = rt.on(m => this.onNet(m))
    this.unwire = this.link.on(m => this.onWire(m))
  }

  override start(): void {
    log('match.start', { online: true, side: this.side, player: this.setup.player, opponent: this.setup.opponent, input: this.inputMode, rtt: Math.round(rt.rtt) })
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null, notice: null, coachTip: null, coach: false, pull: 0 })
    for (const k of ['round', 'start', 'left', 'error'] as const) {
      const m = rt.last(k)
      if (m) this.onNet(m)
    }
    rt.battlePings(true)
    rt.send({ k: 'ready' })
  }

  override dispose(): void {
    this.unsub()
    this.unwire()
    rt.battlePings(false)
    if (this.link !== mainLink) this.link.close()
    this.game.netScale = 1
    rt.leave()
    super.dispose()
  }

  protected override beginRound(): void {}

  private onNet(m: ServerMsg): void {
    if (this.disposed) return
    if (m.k === 'round' && m.round > this.ripRound) {
      this.ripRound = m.round
      this.driver = null
      this.beginServer = Infinity
      this.pendingRip = null
      this.countdown(Math.max(performance.now() + 900, rt.toLocalPerf(m.launchAt)))
    } else if (m.k === 'start' && m.round >= this.ripRound && m.round !== this.startedRound) {
      this.ripRound = m.round
      this.onStart(m)
    } else if (m.k === 'room' && this.pendingRip && this.startedRound !== this.ripRound) rt.send(this.pendingRip)
    else if (m.k === 'catchup' && m.round === this.startedRound) this.onCatchup(m.tl)
    else if (m.k === 'resync' && m.round === this.startedRound && this.driver) {
      log('net.resync', { round: m.round, frame: m.tl.frame })
      this.driver.resync(m.tl)
    }
    else if (m.k === 'end' && m.round === this.ripRound && !this.ended) {
      const outcome = this.side === 0 ? m.outcome : { ...m.outcome, winner: flipWinner(m.outcome.winner) }
      const scores: [number, number] = this.side === 0 ? m.scores : [m.scores[1], m.scores[0]]
      const winner = this.side === 0 ? m.winner : flipWinner(m.winner)
      if (!this.game.battle && this.driver) this.game.setBattle(view(this.driver.view(), this.side))
      if (this.game.battle) this.finishRound({ k: 'finish', tick: this.driver?.session.confirmed.state.tick ?? 0, outcome })
      if (this.driver) log('net.round', this.roundStats())
      this.match = { ...this.match, scores, winner }
      useHud.getState().set({ scores })
      if (winner !== null) {
        this.ended = true
        if (!this.game.battle) this.later(1500, () => this.concludeMatch())
      }
    } else if (m.k === 'error' && m.code === 'no-room' && !this.ended) {
      log('net.room-lost', { round: this.ripRound })
      this.ended = true
      this.driver = null
      useHud.getState().set({ notice: 'Connection lost. The match ended without a result.' })
      const abort = this.deps.onAbort
      if (abort) this.later(2200, abort)
      else {
        this.match = { ...this.match, winner: 1 }
        this.later(1800, () => this.concludeMatch())
      }
    } else if (m.k === 'left' && !this.ended) {
      this.ended = true
      log('net.peer-left', { reason: m.reason })
      useHud.getState().set({ notice: 'Opponent left. You win!' })
      this.match = { ...this.match, winner: 0 }
      this.later(1500, () => this.concludeMatch())
    } else if (m.k === 'peer') useHud.getState().set({ notice: m.online ? null : 'Opponent reconnecting…' })
  }

  protected override adjudicate(_res: RipResult | RipFail, motion: MotionSample[] | null, swipe: TouchSample[] | null, preferSwipe: boolean): RipResult | RipFail {
    this.sent = bestPayload(this.launchAt, motion, swipe, this.deps.calibration.pull100, preferSwipe)
    const r = judged(this.sent).res
    return r.ok ? { ...r, startT: r.startT + this.launchAt } : r
  }

  protected override launch(_rip: RipResult, _opp: RipResult, motion: MotionSample[] | null, swipe: TouchSample[] | null): void {
    const p = this.sent ?? bestPayload(this.launchAt, motion, swipe, this.deps.calibration.pull100, !!swipe)
    this.sent = null
    if (this.startedRound === this.ripRound) return
    const msg: ClientMsg = { k: 'rip', round: this.ripRound, pull100: p.pull100, ...(p.motion ? { motion: p.motion } : {}), ...(p.swipe ? { swipe: p.swipe } : {}) }
    this.pendingRip = msg
    rt.send(msg)
  }

  private onStart(m: Extract<ServerMsg, { k: 'start' }>): void {
    this.startedRound = m.round
    this.pendingRip = null
    this.resolvedAt = this.launchAt
    const [a, b] = this.game.specs!
    const specs = this.side === 0 ? [a, b] as const : [b, a] as const
    const rips = m.rips.map(v => ({ ...v, startT: 0 }) as unknown as RipResult)
    const s = createBattle([specs[0], specs[1]], [{ rip: rips[0]!, hesitate: false }, { rip: rips[1]!, hesitate: false }], m.seed)
    this.makeDriver(m.round, startTimeline(s))
    const d = this.driver!
    this.beginServer = beginAt(m.t0, this.rttNow(), d.session.delay, d.clock.target)
    this.spiritSeen = [false, false]
    const mine = m.rips[this.side]
    useHud.getState().set({ phase: 'launch', countdown: null, pull: 0, callout: calloutOf(mine) })
    log('net.start', { round: m.round, mine: mine.rpm, theirs: m.rips[(1 - this.side) as Side].rpm, rtt: Math.round(this.rttNow()), jitter: Math.round(this.link.net.jitter), delay: d.session.delay, target: Math.round(d.clock.target), transport: this.link.kind })
    this.game.setBattle(view(s, this.side))
    this.game.launch([tierOf(mine), tierOf(m.rips[(1 - this.side) as Side])])
    this.enterBattlePhase()
  }

  private rttNow(): number {
    return this.link.net.count >= 3 ? this.link.net.rtt : rt.rtt
  }

  private makeDriver(round: number, tl: Timeline): void {
    const jitter = this.link.net.count >= 3 ? this.link.net.jitter : 15
    this.driver = new NetDriver(tl, this.side, round, chooseDelay(this.rttNow(), jitter), targetMargin(jitter), this.link)
    this.statsAt = performance.now()
  }

  private onCatchup(tl: Timeline): void {
    this.makeDriver(this.startedRound, tl)
    this.beginServer = -Infinity
    this.game.battle = view(this.driver!.view(), this.side)
    log('net.catchup', { round: this.startedRound, frame: tl.frame })
  }

  private onWire(m: WireMsg): void {
    const d = this.driver
    if (!d || m.op !== 'frames' || this.disposed) return
    const before = this.game.battle?.tops.map(t => ({ x: t.x, y: t.y }))
    d.rtt = this.rttNow()
    const r = d.onFrames(m, this.link.serverNow())
    if (!r) return
    this.lastMargin = m.margin
    this.serverFrame = m.first + m.frames.length - 1
    for (let i = 0; i < r.jump; i++) this.stepOnce(d)
    this.game.netScale = d.clock.scale
    if (r.result !== 'same' || r.jump) {
      const after = view(d.view(), this.side)
      if (r.result === 'rollback' && before) for (let i = 0; i < 2; i++) this.game.correct(i as Side, before[i]!.x - after.tops[i]!.x, before[i]!.y - after.tops[i]!.y)
      this.game.battle = after
      this.transitions()
    }
    if (performance.now() - this.statsAt > 5000) {
      log('net.stats', this.roundStats())
      this.statsAt = performance.now()
    }
  }

  private roundStats(): Record<string, unknown> {
    const d = this.driver!, s = d.session.stats
    return { round: this.startedRound, transport: this.link.kind, frame: d.session.frame, confirmed: d.session.confirmed.frame, depth: d.session.depth, maxDepth: s.maxDepth, rollbacks: s.rollbacks, resim: s.resimFrames, ownReplaced: s.ownReplaced, stalls: s.stalls, jumps: s.jumps, gaps: s.gaps, serverFrame: this.serverFrame, scale: d.clock.scale, margin: this.lastMargin, target: Math.round(d.clock.target), delay: d.session.delay, rtt: Math.round(this.link.net.rtt), jitter: Math.round(this.link.net.jitter) }
  }

  private stepOnce(d: NetDriver): void {
    const inp = this.playerInput()
    const ok = d.step(inp.tiltX, inp.tiltY, inp.spirit, this.events)
    if (ok) for (const e of this.events) if (e.k === 'clash' || e.k === 'wall') this.onEvent(this.side === 1 && e.k === 'wall' ? { ...e, side: (1 - e.side) as Side } : e)
    this.events.length = 0
    if (!ok) return
    this.game.battle = view(d.view(), this.side)
    this.transitions()
  }

  protected override tick(): void {
    const d = this.driver
    if (!d || d.done || this.link.serverNow() < this.beginServer) return
    this.stepOnce(d)
  }

  private transitions(): void {
    const b = this.game.battle
    if (!b) return
    for (let i = 0; i < 2; i++) {
      const on = b.tops[i]!.spiritTicks > 0
      if (on === this.spiritSeen[i]) continue
      this.spiritSeen[i] = on
      const e: BattleEvent = on ? { k: 'spirit', tick: b.tick, side: i as Side } : { k: 'spiritEnd', tick: b.tick, side: i as Side }
      this.onEvent(e)
    }
  }
}
