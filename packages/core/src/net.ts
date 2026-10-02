import { stepBattle, type BattleEvent, type BattleState, type RoundOutcome, type Side, type TickInput } from './battle'
import type { TopBuild } from './parts'
import type { MotionSample, RipResult } from './rip'
import type { TouchSample } from './rip-swipe'

export const NET = { snapEvery: 3, maxLead: 30, lateCarry: 6, swipeRpmCap: 13500, maxRooms: 5000, heartbeatMs: 10000, seatHoldMs: 15000, tickMs: 1000 / 60, maxMessageBytes: 16384, maxMsgsPerSec: 120 } as const

export interface NetInput { x: number; y: number; seq: number }
export type RipView = Pick<RipResult, 'rpm' | 'quality' | 'overspin' | 'style' | 'bankDir' | 'timing' | 'straightness' | 'pullRatio'> & { ok: boolean; reason: string | null }

export type ClientMsg =
  | { k: 'hello'; token: string; name: string }
  | { k: 'create'; build: TopBuild }
  | { k: 'join'; code: string; build: TopBuild }
  | { k: 'rejoin'; code: string }
  | { k: 'rip'; round: number; motion?: MotionSample[]; swipe?: { points: TouchSample[]; h: number }; pull100: number }
  | { k: 'inputs'; from: number; list: [number, number, number][] }
  | { k: 'ping'; t: number }
  | { k: 'leave' }
  | { k: 'stadium' }

export type ServerMsg =
  | { k: 'welcome'; playerId: string }
  | { k: 'room'; code: string; side: Side }
  | { k: 'peer'; name: string; build: TopBuild; online: boolean }
  | { k: 'round'; round: number; launchAt: number }
  | { k: 'start'; round: number; seed: number; rips: [RipView, RipView]; tick: number }
  | { k: 'snap'; tick: number; state: BattleState; inputs: [NetInput, NetInput]; leads: [number, number] }
  | { k: 'end'; round: number; outcome: RoundOutcome; scores: [number, number]; winner: Side | null }
  | { k: 'pong'; t: number; server: number }
  | { k: 'left'; reason: 'forfeit' | 'quit' }
  | { k: 'error'; code: 'auth' | 'bad-message' | 'no-room' | 'full' | 'rate' }
  | { k: 'watching'; code: string }
  | { k: 'seats'; seats: ({ name: string; build: TopBuild; online: boolean } | null)[] }

const IDLE: NetInput = { x: 0, y: 0, seq: 0 }

export class InputTrack {
  constructor(public seq = 0) {}

  at(inp: NetInput): TickInput {
    const spirit = inp.seq > this.seq
    if (spirit) this.seq = inp.seq
    return { tiltX: inp.x, tiltY: inp.y, spirit }
  }
}

export class Predictor {
  state: BattleState
  private authTick: number
  private mine = new Map<number, NetInput>()
  private foe: NetInput
  private tracks: [InputTrack, InputTrack]
  private scratch: BattleEvent[] = []

  constructor(state: BattleState, readonly side: Side, inputs: [NetInput, NetInput] = [IDLE, IDLE]) {
    this.state = structuredClone(state)
    this.authTick = state.tick
    this.foe = inputs[(1 - side) as Side]
    this.tracks = [new InputTrack(inputs[0].seq), new InputTrack(inputs[1].seq)]
  }

  private pair(own: NetInput): [TickInput, TickInput] {
    const me = this.tracks[this.side].at(own), them = this.tracks[(1 - this.side) as Side].at(this.foe)
    return this.side === 0 ? [me, them] : [them, me]
  }

  step(own: NetInput, events: BattleEvent[]): void {
    if (this.state.outcome) return
    this.mine.set(this.state.tick + 1, own)
    stepBattle(this.state, this.pair(own), events)
  }

  reconcile(tick: number, state: BattleState, inputs: [NetInput, NetInput]): boolean {
    if (tick <= this.authTick) return false
    this.authTick = tick
    this.foe = inputs[(1 - this.side) as Side]
    this.tracks = [new InputTrack(inputs[0].seq), new InputTrack(inputs[1].seq)]
    const target = this.state.tick
    const s = structuredClone(state)
    for (const t of this.mine.keys()) if (t <= tick) this.mine.delete(t)
    let last = inputs[this.side]
    this.state = s
    for (let t = tick + 1; t <= target && !s.outcome; t++) {
      last = this.mine.get(t) ?? last
      this.scratch.length = 0
      stepBattle(s, this.pair(last), this.scratch)
    }
    return true
  }
}
