import { createBattle, NET, Predictor, type BattleEvent, type NetInput, type RipResult, type ServerMsg, type Side } from '@spirit/core'
import { rt } from '../net/rt'
import { useHud } from '../state/hud'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'

export class SpectatorController extends BattleController {
  private pred: Predictor | null = null
  private ripRound = 0
  private snapTick = 0
  private snapAt = 0
  private own: NetInput = { x: 0, y: 0, seq: 0 }
  private spiritSeen: [boolean, boolean] = [false, false]
  private unsub: () => void
  private done = false

  constructor(game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2], private names: [string, string]) {
    super(game, setup, deps)
    this.unsub = rt.on(m => this.onNet(m))
  }

  override start(): void {
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null, notice: null })
    this.announcer.say('intro', true)
    const r = rt.last('round')
    if (r) this.onNet(r)
  }

  override dispose(): void {
    this.unsub()
    super.dispose()
  }

  protected override beginRound(): void {}

  protected override resolveLaunch(): void {
    useHud.getState().set({ phase: 'launch', countdown: null })
  }

  private onNet(m: ServerMsg): void {
    if (this.disposed || this.done) return
    if (m.k === 'round' && m.round > this.ripRound) {
      this.ripRound = m.round
      this.pred = null
      this.countdown(Math.max(performance.now() + 600, rt.toLocalPerf(m.launchAt)))
    } else if (m.k === 'start' && m.round === this.ripRound) {
      const [a, b] = this.game.specs!
      const rips = m.rips.map(v => ({ ...v, startT: 0 }) as unknown as RipResult)
      const s = createBattle([a, b], [{ rip: rips[0]!, hesitate: false }, { rip: rips[1]!, hesitate: false }], m.seed)
      this.pred = new Predictor(s, 0)
      this.snapTick = m.tick
      this.snapAt = performance.now()
      this.spiritSeen = [false, false]
      const best = m.rips[0].rpm >= m.rips[1].rpm ? 0 : 1
      useHud.getState().set({ callout: { quality: m.rips[best].ok ? m.rips[best].quality : 'FAIL', rpm: m.rips[best].rpm, note: this.names[best] } })
      this.game.dropT = 0
      this.game.setBattle(s)
      this.enterBattlePhase()
    } else if (m.k === 'snap' && this.pred) {
      const before = this.pred.state.tops.map(t => ({ x: t.x, y: t.y }))
      this.own = m.inputs[0]
      if (!this.pred.reconcile(m.tick, m.state, m.inputs)) return
      this.snapTick = m.tick
      this.snapAt = performance.now()
      this.pred.state.tops.forEach((t, i) => this.game.correct(i as Side, before[i]!.x - t.x, before[i]!.y - t.y))
      this.game.battle = this.pred.state
      this.transitions()
    } else if (m.k === 'end' && m.round === this.ripRound) {
      if (!this.game.battle && this.pred) this.game.setBattle(this.pred.state)
      this.finishRound({ k: 'finish', tick: this.pred?.state.tick ?? 0, outcome: m.outcome })
      this.match = { ...this.match, scores: m.scores, winner: m.winner }
      useHud.getState().set({ scores: m.scores })
      if (m.winner !== null) this.done = true
    } else if (m.k === 'left') {
      this.done = true
      this.pred = null
      this.match = { ...this.match, winner: m.winner ?? this.match.winner ?? 0 }
      this.concludeMatch()
    } else if (m.k === 'seats') {
      const off = m.seats.findIndex(x => x && !x.online)
      useHud.getState().set({ notice: off >= 0 ? `${m.seats[off]!.name} is reconnecting…` : null })
    }
  }

  protected override concludeMatch(): void {
    const w = this.match.winner
    useHud.getState().set({ phase: 'matchEnd', banner: 'victory', notice: w === null ? null : `${this.names[w]} wins!` })
    this.announcer.say('victory', true)
    this.deps.sound.play('victory')
    this.later(4200, () => this.deps.onEnd({ winner: w ?? 0, match: this.match, bestRpm: 0, spiritCalls: 0, comeback: false, perfectRips: 0, overspins: 0, finishes: [], aggression: 0 }))
  }

  protected override tick(): void {
    const p = this.pred
    if (!p || p.state.outcome) return
    const lag = this.snapTick + (performance.now() - this.snapAt) / NET.tickMs - p.state.tick
    const steps = lag > 2 ? 2 : lag < -2 ? 0 : 1
    for (let i = 0; i < steps; i++) {
      p.step(this.own, this.events)
      for (const e of this.events) if (e.k === 'clash' || e.k === 'wall') this.onEvent(e)
      this.events.length = 0
    }
    this.game.battle = p.state
    this.transitions()
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
