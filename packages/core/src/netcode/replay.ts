import { battleHash, stepBattle, type BattleEvent, type BattleState, type TickInput } from '../battle'
import { IDLE_INPUT, tiltOf, type Frame, type WireInput } from './wire'

export interface Timeline { state: BattleState; frame: number; sp: [number, number]; last: [WireInput, WireInput] }

export function cloneBattle(s: BattleState): BattleState {
  return { tick: s.tick, pausedTicks: s.pausedTicks, rng: { s: s.rng.s }, specs: s.specs, tops: [{ ...s.tops[0] }, { ...s.tops[1] }], outcome: s.outcome ? { ...s.outcome } : null }
}

export const sameInput = (a: WireInput, b: WireInput): boolean => a.x === b.x && a.y === b.y && a.sp === b.sp

export const toTick = (i: WireInput, prevSp: number): TickInput => ({ tiltX: tiltOf(i.x), tiltY: tiltOf(i.y), spirit: i.sp !== prevSp })

export const startTimeline = (state: BattleState): Timeline => ({ state: cloneBattle(state), frame: 0, sp: [0, 0], last: [IDLE_INPUT, IDLE_INPUT] })

export const cloneTimeline = (t: Timeline): Timeline => ({ state: cloneBattle(t.state), frame: t.frame, sp: [t.sp[0], t.sp[1]], last: [t.last[0], t.last[1]] })

export function stepTimeline(t: Timeline, f: Frame, out: BattleEvent[]): void {
  stepBattle(t.state, [toTick(f[0], t.sp[0]), toTick(f[1], t.sp[1])], out)
  t.sp = [f[0].sp, f[1].sp]
  t.last = [f[0], f[1]]
  t.frame++
}

export const timelineHash = (t: Timeline): number => parseInt(battleHash(t.state), 16) >>> 0

export class Replayer {
  private queue: Frame[] = []
  private head = 0

  constructor(readonly tl: Timeline) {}

  get frame(): number { return this.tl.frame }
  get backlog(): number { return this.queue.length - this.head }
  get received(): number { return this.tl.frame + this.backlog }

  push(first: number, frames: readonly Frame[]): number {
    const next = this.received + 1
    if (first > next) return 0
    let n = 0
    for (let i = next - first; i < frames.length; i++, n++) this.queue.push(frames[i]!)
    return n
  }

  stepOne(out: BattleEvent[]): boolean {
    if (this.head >= this.queue.length) return false
    stepTimeline(this.tl, this.queue[this.head++]!, out)
    if (this.head >= 256 && this.head * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.head)
      this.head = 0
    }
    return true
  }
}
