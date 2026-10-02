import {
  assembleTop, botInput, createBattle, deckTop, encodeInputs, ghostRip, ghostSeeds, judgeRip, quantize, stepBattle,
  type BattleEvent, type BotBrain, type MotionSample, type RipPayload, type RipResult, type RipView, type RngState, type TickInput, type TopBuild, type TouchSample,
} from '@spirit/core'
import { useHud } from '../state/hud'
import { authHeader } from '../state/sync'
import { log } from '../telemetry'
import { BattleController, type MatchResult, type MatchSetup } from './BattleController'
import type { Game } from './Game'

export interface IssuedGhost { matchId: string; seed: number; pool: 'motion' | 'swipe'; deck: TopBuild[]; opponent: { name: string; rating: number; deck: TopBuild[]; rips: RipView[]; brain: BotBrain } }
export interface GhostVerdict { winner: 0 | 1; scores: [number, number]; rating?: number; delta?: number }

const r2 = (v: number) => Math.round(v * 100) / 100

export class GhostController extends BattleController {
  private ghostRng: RngState
  private payload: RipPayload | null = null
  private roundInputs: TickInput[] = []
  private rounds: (RipPayload & { inputs: number[] })[] = []
  verdict: GhostVerdict | null = null

  constructor(game: Game, setup: MatchSetup, deps: ConstructorParameters<typeof BattleController>[2], private issued: IssuedGhost, private art: (b: TopBuild) => string) {
    super(game, setup, deps)
    this.ghostRng = ghostSeeds(issued.seed).bot
  }

  protected override beginRound(): void {
    const r = this.match.round
    if (r === 1 || (this.issued.deck.length < 2 && this.issued.opponent.deck.length < 2)) return super.beginRound()
    const mine = deckTop(this.issued.deck, r), theirs = deckTop(this.issued.opponent.deck, r)
    void this.game.setTops([mine, theirs], [this.art(mine), `beasts/${theirs.beastId}`]).then(() => { if (!this.disposed) super.beginRound() })
  }

  protected override launch(_rip: RipResult, _opp: RipResult, motion: MotionSample[] | null, swipe: TouchSample[] | null): void {
    const t0 = this.launchAt
    const round = this.match.round
    const m = motion?.filter(s => s.t >= t0 - 400 && s.t <= t0 + 700).map(s => ({ t: r2(s.t - t0), ax: r2(s.ax), ay: r2(s.ay), az: r2(s.az), gx: r2(s.gx), gy: r2(s.gy), gz: r2(s.gz), roll: r2(s.roll) }))
    const sw = swipe?.length ? { points: swipe.map(p => ({ t: r2(p.t - t0), x: r2(p.x), y: r2(p.y) })), h: Math.round(innerHeight) } : undefined
    this.payload = this.issued.pool === 'motion' ? { motion: m ?? [], pull100: this.deps.calibration.pull100 } : { swipe: sw, pull100: this.deps.calibration.pull100 }
    const judged = judgeRip(this.payload)
    const rip = judged.rip
    useHud.getState().set({ callout: judged.view.ok ? { quality: judged.view.overspin ? 'OVERSPIN' : judged.view.quality, rpm: judged.view.rpm } : { quality: 'FAIL', rpm: judged.view.rpm, note: 'TOO SOFT' } })
    const mine = assembleTop(deckTop(this.issued.deck, round)), theirs = assembleTop(deckTop(this.issued.opponent.deck, round))
    const battle = createBattle([mine, theirs], [{ rip, hesitate: false }, { rip: ghostRip(this.issued.opponent.rips, round), hesitate: false }], ghostSeeds(this.issued.seed).battle(round))
    this.roundInputs = []
    this.game.dropT = 0
    this.game.setBattle(battle)
    this.enterBattlePhase()
  }

  protected override tick(): void {
    const b = this.game.battle
    if (!b || b.outcome) return
    const q = quantize(this.playerInput())
    this.roundInputs.push(q)
    stepBattle(b, [q, botInput(b, 1, this.issued.opponent.brain, this.ghostRng)], this.events)
    for (const e of this.events) this.onEvent(e as BattleEvent)
    this.events.length = 0
  }

  protected override finishRound(e: Extract<BattleEvent, { k: 'finish' }>): void {
    this.rounds.push({ ...(this.payload ?? { pull100: this.deps.calibration.pull100 }), inputs: encodeInputs(this.roundInputs) })
    super.finishRound(e)
  }

  protected override concludeMatch(): void {
    useHud.getState().set({ notice: 'Verifying with the referee…' })
    void this.submit().then(v => {
      this.verdict = v
      useHud.getState().set({ notice: v ? null : 'The referee could not verify this match. It will not count.' })
      if (v) this.match = { ...this.match, winner: v.winner, scores: v.scores }
      super.concludeMatch()
    })
  }

  private async submit(): Promise<GhostVerdict | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/v1/matches/${this.issued.matchId}/submit`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ rounds: this.rounds }), signal: AbortSignal.timeout(10000) })
        const data = (await res.json().catch(() => ({}))) as GhostVerdict & { error?: string }
        log('ghost.submit', { status: res.status, error: data.error ?? null, rounds: this.rounds.length, winner: data.winner ?? null, delta: data.delta ?? null })
        if (res.ok) return data
        if (res.status === 409 || res.status === 404) return null
      } catch (e) {
        log('ghost.submit', { error: String(e).slice(0, 80), attempt })
      }
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
    }
    return null
  }

  protected override extra(): Partial<MatchResult> {
    return { verdict: this.verdict }
  }
}
