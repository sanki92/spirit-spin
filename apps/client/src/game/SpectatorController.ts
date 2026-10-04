import { createBattle, PLAYOUT, playoutSteps, Replayer, startTimeline, type BattleEvent, type RipResult, type ServerMsg, type Side, type WireMsg } from '@spirit/core'
import { mainLink } from '../net/link'
import { rt } from '../net/rt'
import { useHud } from '../state/hud'
import { BattleController, type MatchSetup } from './BattleController'
import type { Game } from './Game'
import { tierOf } from './launchPlan'

export class SpectatorController extends BattleController {
  private rp: Replayer | null = null
  private primed = false
  private ripRound = 0
  private startedRound = 0
  private unwire: () => void
  private spiritSeen: [boolean, boolean] = [false, false]
  private unsub: () => void
  private done = false

  constructor(game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2], private names: [string, string]) {
    super(game, setup, deps)
    this.unsub = rt.on(m => this.onNet(m))
    this.unwire = mainLink.on(m => this.onWire(m))
  }

  override start(): void {
    useHud.getState().set({ phase: 'idle', scores: [0, 0], round: 1, banner: 'vs', callout: null, cutin: null, notice: null })
    this.announcer.say('intro', true)
    const r = rt.last('round')
    if (r) this.onNet(r)
  }

  override dispose(): void {
    this.unsub()
    this.unwire()
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
      this.rp = null
      this.countdown(Math.max(performance.now() + 600, rt.toLocalPerf(m.launchAt)))
    } else if (m.k === 'start' && m.round === this.ripRound && m.round !== this.startedRound) {
      this.startedRound = m.round
      const [a, b] = this.game.specs!
      const rips = m.rips.map(v => ({ ...v, startT: 0 }) as unknown as RipResult)
      const s = createBattle([a, b], [{ rip: rips[0]!, hesitate: false }, { rip: rips[1]!, hesitate: false }], m.seed)
      this.rp = new Replayer(startTimeline(s))
      this.primed = false
      this.spiritSeen = [false, false]
      const best = m.rips[0].rpm >= m.rips[1].rpm ? 0 : 1
      useHud.getState().set({ callout: { quality: m.rips[best].ok ? m.rips[best].quality : 'FAIL', rpm: m.rips[best].rpm, note: this.names[best] } })
      this.game.setBattle(s)
      this.game.launch([tierOf(m.rips[0]), tierOf(m.rips[1])])
      this.enterBattlePhase()
    } else if (m.k === 'catchup' && m.round === this.ripRound && this.rp) {
      this.rp = new Replayer(m.tl)
      this.primed = false
    } else if (m.k === 'end' && m.round === this.ripRound) {
      if (!this.game.battle && this.rp) this.game.setBattle(this.rp.tl.state)
      this.finishRound({ k: 'finish', tick: this.rp?.tl.state.tick ?? 0, outcome: m.outcome })
      this.match = { ...this.match, scores: m.scores, winner: m.winner }
      useHud.getState().set({ scores: m.scores })
      if (m.winner !== null) this.done = true
    } else if (m.k === 'left') {
      this.done = true
      this.rp = null
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

  private onWire(m: WireMsg): void {
    if (m.op === 'frames' && this.rp && m.round === (this.ripRound & 255)) this.rp.push(m.first, m.frames)
  }

  protected override tick(): void {
    const rp = this.rp
    if (!rp || this.done) return
    if (!this.primed) {
      if (rp.backlog < PLAYOUT.prime) return
      this.primed = true
    }
    for (let i = playoutSteps(rp.backlog); i > 0; i--) {
      rp.stepOne(this.events)
      for (const e of this.events) if (e.k === 'clash' || e.k === 'wall') this.onEvent(e)
      this.events.length = 0
    }
    this.game.battle = rp.tl.state
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
