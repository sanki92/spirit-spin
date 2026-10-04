import type { BattleEvent, BattleState, Side } from '../battle'
import { cloneTimeline, sameInput, stepTimeline, timelineHash, type Frame, type Timeline } from './replay'
import { WIRE, type WireInput } from './wire'

export const ROLL = { maxPredict: 32 } as const
export type ConfirmResult = 'same' | 'rollback' | 'jump'
export interface RollStats { rollbacks: number; resimFrames: number; maxDepth: number; ownReplaced: number; stalls: number; jumps: number }

export class RollbackSession {
  confirmed: Timeline
  predicted: Timeline
  readonly stats: RollStats = { rollbacks: 0, resimFrames: 0, maxDepth: 0, ownReplaced: 0, stalls: 0, jumps: 0 }
  private local = new Map<number, WireInput>()
  private used = new Map<number, Frame>()
  private checkpoints: { frame: number; hash: number }[] = []
  private scratch: BattleEvent[] = []
  private readonly foe: Side

  constructor(start: Timeline, readonly side: Side, readonly delay: number) {
    this.foe = (1 - side) as Side
    this.confirmed = cloneTimeline(start)
    this.predicted = cloneTimeline(start)
    for (let f = start.frame + 1; f <= start.frame + delay; f++) this.local.set(f, start.last[side])
  }

  get frame(): number { return this.predicted.frame }
  get depth(): number { return this.predicted.frame - this.confirmed.frame }
  canAdvance(): boolean { return this.depth < ROLL.maxPredict }

  private frameFor(f: number, t: Timeline): Frame {
    const mine = this.local.get(f) ?? t.last[this.side]
    const theirs = this.confirmed.last[this.foe]
    return this.side === 0 ? [mine, theirs] : [theirs, mine]
  }

  advance(own: WireInput, out: BattleEvent[]): boolean {
    if (!this.canAdvance()) { this.stats.stalls++; return false }
    const f = this.predicted.frame + 1
    this.local.set(f + this.delay, own)
    const fr = this.frameFor(f, this.predicted)
    this.used.set(f, fr)
    stepTimeline(this.predicted, fr, out)
    if (this.depth > this.stats.maxDepth) this.stats.maxDepth = this.depth
    return true
  }

  unsent(): { first: number; inputs: WireInput[] } {
    const hi = this.predicted.frame + this.delay
    const first = Math.max(this.confirmed.frame + 1, hi - WIRE.maxInputs + 1)
    const inputs: WireInput[] = []
    for (let f = first; f <= hi; f++) inputs.push(this.local.get(f) ?? this.confirmed.last[this.side])
    return { first, inputs }
  }

  confirm(first: number, frames: readonly Frame[]): ConfirmResult {
    let f = this.confirmed.frame + 1
    if (first > f || first + frames.length <= f) return 'same'
    let mismatch = false
    for (let i = f - first; i < frames.length; i++, f++) {
      const fr = frames[i]!
      const own = this.local.get(f)
      if (own && !sameInput(own, fr[this.side])) this.stats.ownReplaced++
      const u = this.used.get(f)
      if (!u || !sameInput(u[0], fr[0]) || !sameInput(u[1], fr[1])) mismatch = true
      stepTimeline(this.confirmed, fr, this.scratch)
      if (this.confirmed.frame % WIRE.hashEvery === 0) this.checkpoints.push({ frame: this.confirmed.frame, hash: timelineHash(this.confirmed) })
      this.used.delete(f)
      this.local.delete(f)
    }
    this.scratch.length = 0
    if (this.confirmed.frame >= this.predicted.frame) {
      const jumped = this.confirmed.frame > this.predicted.frame
      this.predicted = cloneTimeline(this.confirmed)
      this.used.clear()
      if (jumped) { this.stats.jumps++; return 'jump' }
      if (mismatch) this.stats.rollbacks++
      return mismatch ? 'rollback' : 'same'
    }
    const next = this.used.get(this.confirmed.frame + 1)
    if (next && !sameInput(next[this.foe], this.confirmed.last[this.foe])) mismatch = true
    if (!mismatch) return 'same'
    this.resim(this.predicted.frame)
    return 'rollback'
  }

  private resim(target: number): void {
    const p = cloneTimeline(this.confirmed)
    this.used.clear()
    while (p.frame < target) {
      const fr = this.frameFor(p.frame + 1, p)
      this.used.set(p.frame + 1, fr)
      stepTimeline(p, fr, this.scratch)
    }
    this.scratch.length = 0
    this.stats.rollbacks++
    this.stats.resimFrames += target - this.confirmed.frame
    this.predicted = p
  }

  takeCheckpoints(): { frame: number; hash: number }[] {
    const c = this.checkpoints
    this.checkpoints = []
    return c
  }

  resync(tl: Timeline): void {
    const target = Math.max(this.predicted.frame, tl.frame)
    this.confirmed = cloneTimeline(tl)
    for (const f of [...this.local.keys()]) if (f <= tl.frame) this.local.delete(f)
    this.resim(target)
  }

  view(): BattleState {
    const p = this.predicted.state
    return p.outcome && !this.confirmed.state.outcome ? { ...p, outcome: null } : p
  }
}
