import { createBattle, NET, Predictor, type BattleEvent, type BattleState, type MotionSample, type RipResult, type ServerMsg, type Side, type TouchSample } from '@spirit/core'
import { rt } from '../net/rt'
import { useHud } from '../state/hud'
import { log } from '../telemetry'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'

const r3 = (v: number) => Math.round(v * 1000) / 1000
const r2 = (v: number) => Math.round(v * 100) / 100
const flipWinner = (w: Side | null) => (w === null ? null : ((1 - w) as Side))
const view = (s: BattleState, side: Side): BattleState =>
  side === 0 ? s : { ...s, tops: [s.tops[1], s.tops[0]], specs: [s.specs[1], s.specs[0]], outcome: s.outcome && { ...s.outcome, winner: flipWinner(s.outcome.winner) } }

export class OnlineController extends BattleController {
  private pred: Predictor | null = null
  private seq = 0
  private batch: [number, number, number][] = []
  private batchFrom = 1
  private snapTick = 0
  private snapAt = 0
  private ripRound = 0
  private ended = false
  private lead: number | null = null
  private spiritSeen: [boolean, boolean] = [false, false]
  private unsub: () => void
  private stats = { snaps: 0, corr: 0, maxCorr: 0, doubled: 0, skipped: 0, lag: 0, lagN: 0, at: 0 }

  constructor(game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2], private side: Side) {
    super(game, setup, deps)
    this.unsub = rt.on(m => this.onNet(m))
  }

  override start(): void {
    log('match.start', { online: true, side: this.side, player: this.setup.player, opponent: this.setup.opponent, input: this.inputMode, rtt: Math.round(rt.rtt) })
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null, notice: null })
    const r = rt.last('round')
    if (r) this.onNet(r)
  }

  override dispose(): void {
    this.unsub()
    super.dispose()
  }

  protected override beginRound(): void {}

  private onNet(m: ServerMsg): void {
    if (this.disposed) return
    if (m.k === 'round' && m.round > this.ripRound) {
      this.ripRound = m.round
      this.pred = null
      this.countdown(Math.max(performance.now() + 900, rt.toLocalPerf(m.launchAt)))
    } else if (m.k === 'start' && m.round === this.ripRound) this.onStart(m)
    else if (m.k === 'snap') this.onSnap(m)
    else if (m.k === 'end' && m.round === this.ripRound && !this.ended) {
      const outcome = this.side === 0 ? m.outcome : { ...m.outcome, winner: flipWinner(m.outcome.winner) }
      if (!this.game.battle) this.game.setBattle(this.pred ? view(this.pred.state, this.side) : null)
      this.finishRound({ k: 'finish', tick: this.pred?.state.tick ?? 0, outcome })
      const scores: [number, number] = this.side === 0 ? m.scores : [m.scores[1], m.scores[0]]
      this.match = { ...this.match, scores, winner: this.side === 0 ? m.winner : flipWinner(m.winner) }
      useHud.getState().set({ scores })
      if (this.match.winner !== null) this.ended = true
    } else if (m.k === 'error' && m.code === 'no-room' && !this.ended) {
      log('net.room-lost', { round: this.ripRound })
      this.ended = true
      this.pred = null
      useHud.getState().set({ notice: 'Connection lost. The match was forfeited.' })
      this.match = { ...this.match, winner: 1 }
      this.later(1800, () => this.concludeMatch())
    } else if (m.k === 'left' && !this.ended) {
      this.ended = true
      log('net.peer-left', { reason: m.reason })
      useHud.getState().set({ notice: 'Opponent left. You win!' })
      this.match = { ...this.match, winner: 0 }
      this.later(1500, () => this.concludeMatch())
    } else if (m.k === 'peer') useHud.getState().set({ notice: m.online ? null : 'Opponent reconnecting…' })
  }

  protected override launch(_rip: RipResult, _opp: RipResult, motion: MotionSample[] | null, swipe: TouchSample[] | null): void {
    const t0 = this.launchAt
    const m = motion?.filter(s => s.t >= t0 - 400 && s.t <= t0 + 700).map(s => ({ t: r2(s.t - t0), ax: r2(s.ax), ay: r2(s.ay), az: r2(s.az), gx: r2(s.gx), gy: r2(s.gy), gz: r2(s.gz), roll: r2(s.roll) }))
    rt.send({
      k: 'rip', round: this.ripRound, pull100: this.deps.calibration.pull100,
      ...(m?.length ? { motion: m } : {}),
      ...(swipe?.length ? { swipe: { points: swipe.map(p => ({ t: r2(p.t - t0), x: r2(p.x), y: r2(p.y) })), h: innerHeight } } : {}),
    })
  }

  private onStart(m: Extract<ServerMsg, { k: 'start' }>): void {
    const [a, b] = this.game.specs!
    const specs = this.side === 0 ? [a, b] as const : [b, a] as const
    const rips = m.rips.map(v => ({ ...v, startT: 0 }) as unknown as RipResult)
    const s = createBattle([specs[0], specs[1]], [{ rip: rips[0]!, hesitate: false }, { rip: rips[1]!, hesitate: false }], m.seed)
    this.pred = new Predictor(s, this.side, [{ x: 0, y: 0, seq: this.side === 0 ? this.seq : 0 }, { x: 0, y: 0, seq: this.side === 1 ? this.seq : 0 }])
    this.snapTick = m.tick
    this.snapAt = performance.now()
    this.lead = null
    this.batch = []
    this.spiritSeen = [false, false]
    const mine = m.rips[this.side]
    useHud.getState().set({ callout: mine.ok ? { quality: mine.overspin ? 'OVERSPIN' : mine.quality, rpm: mine.rpm } : { quality: 'FAIL', rpm: mine.rpm, note: 'TOO SOFT' } })
    log('net.start', { round: m.round, mine: mine.rpm, theirs: m.rips[(1 - this.side) as Side].rpm, rtt: Math.round(rt.rtt) })
    this.game.dropT = 0
    this.game.setBattle(view(s, this.side))
    this.enterBattlePhase()
  }

  protected override tick(): void {
    const p = this.pred
    if (!p || p.state.outcome || !rt.connected) return
    let steps: number
    if (this.lead === null) {
      const lag = this.snapTick + (performance.now() - this.snapAt + rt.rtt) / NET.tickMs + 4 - p.state.tick
      steps = lag > 2 ? 2 : lag < -4 ? 0 : 1
    } else {
      steps = this.lead < 2 ? 2 : this.lead > 7 ? 0 : 1
      this.lead += steps - 1
      this.stats.lag += this.lead
      this.stats.lagN++
    }
    if (steps === 2) this.stats.doubled++
    if (steps === 0) this.stats.skipped++
    for (let i = 0; i < steps; i++) this.stepOnce(p)
  }

  private stepOnce(p: Predictor): void {
    const inp = this.playerInput()
    if (inp.spirit) this.seq++
    const n = { x: r3(inp.tiltX), y: r3(inp.tiltY), seq: this.seq }
    if (!this.batch.length) this.batchFrom = p.state.tick + 1
    this.batch.push([n.x, n.y, n.seq])
    p.step(n, this.events)
    for (const e of this.events) if (e.k === 'clash' || e.k === 'wall') this.onEvent(this.side === 1 && e.k === 'wall' ? { ...e, side: (1 - e.side) as Side } : e)
    this.events.length = 0
    if (this.batch.length >= 2) {
      rt.send({ k: 'inputs', from: this.batchFrom, list: this.batch })
      this.batch = []
    }
    this.game.battle = view(p.state, this.side)
    this.transitions()
  }

  private onSnap(m: Extract<ServerMsg, { k: 'snap' }>): void {
    const p = this.pred
    if (!p) return
    const before = view(p.state, this.side).tops.map(t => ({ x: t.x, y: t.y }))
    if (!p.reconcile(m.tick, m.state, m.inputs)) return
    if (p.state.tick > m.tick) this.lead = m.leads[this.side]
    this.snapTick = m.tick
    this.snapAt = performance.now()
    const after = view(p.state, this.side)
    for (let i = 0; i < 2; i++) {
      const dx = before[i]!.x - after.tops[i]!.x, dy = before[i]!.y - after.tops[i]!.y
      const d = Math.hypot(dx, dy)
      this.stats.corr += d
      this.stats.maxCorr = Math.max(this.stats.maxCorr, d)
      this.game.correct(i as Side, dx, dy)
    }
    this.stats.snaps++
    if (import.meta.env.DEV) {
      const w = window as unknown as { __netStats?: { snaps: number; corr: number; maxCorr: number; lag: number; lagN: number } }
      const t = (w.__netStats ??= { snaps: 0, corr: 0, maxCorr: 0, lag: 0, lagN: 0 })
      t.snaps++
      t.corr += Math.hypot(before[0]!.x - after.tops[0]!.x, before[0]!.y - after.tops[0]!.y)
      t.maxCorr = Math.max(t.maxCorr, this.stats.maxCorr)
      t.lag = this.stats.lag
      t.lagN = this.stats.lagN
    }
    this.game.battle = after
    this.transitions()
    if (performance.now() - this.stats.at > 5000) {
      log('net.stats', { snaps: this.stats.snaps, avgCorr: +(this.stats.corr / Math.max(1, this.stats.snaps * 2)).toFixed(4), maxCorr: +this.stats.maxCorr.toFixed(3), doubled: this.stats.doubled, skipped: this.stats.skipped, lag: +(this.stats.lag / Math.max(1, this.stats.lagN)).toFixed(1), rtt: Math.round(rt.rtt), tick: p.state.tick, serverTick: m.tick })
      this.stats = { snaps: 0, corr: 0, maxCorr: 0, doubled: 0, skipped: 0, lag: 0, lagN: 0, at: performance.now() }
    }
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
