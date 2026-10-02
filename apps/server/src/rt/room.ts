import {
  applyRound, assembleTop, composeRip, createBattle, InputTrack, NET, newMatch, scoreRip, scoreSwipe, stepBattle, tracePlausible,
  type BattleEvent, type BattleState, type MatchState, type MotionSample, type NetInput, type RipResult, type RipView, type ServerMsg,
  type Side, type TopBuild, type TouchSample,
} from '@spirit/core'

export const TIMING = { countdownMs: 3050, ripGraceMs: 2200, betweenRoundsMs: 3200, firstRoundDelayMs: 2500 }

export interface Seat {
  playerId: string
  name: string
  build: TopBuild
  send: (m: ServerMsg) => void
  online: boolean
  hold: ReturnType<typeof setTimeout> | null
  rip: RipResult | null
  inputs: Map<number, NetInput>
  last: NetInput
  maxSeq: number
  track: InputTrack
}

const FAIL = (): RipResult => composeRip(0.15, 0.3, 0.45, 0, 0)
const view = (r: RipResult, ok: boolean, reason: string | null): RipView => ({
  ok, reason, rpm: r.rpm, quality: r.quality, overspin: r.overspin, style: r.style, bankDir: r.bankDir, timing: r.timing, straightness: r.straightness, pullRatio: r.pullRatio,
})
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0)

export function judgeRip(msg: { motion?: MotionSample[] | undefined; swipe?: { points: TouchSample[]; h: number } | undefined; pull100: number }): { rip: RipResult; view: RipView } {
  const motion = msg.motion?.length ? (tracePlausible(msg.motion).ok ? scoreRip(msg.motion, 0, { pull100: clamp(msg.pull100, 5, 12) }) : { ok: false as const, reason: 'no-pull' as const }) : null
  const swipe = msg.swipe?.points.length ? scoreSwipe(msg.swipe.points, 0, clamp(msg.swipe.h, 400, 1400)) : null
  const best = [motion, swipe].filter((r): r is RipResult => !!r?.ok).sort((a, b) => b.rpm - a.rpm)[0]
  if (best) return { rip: best, view: view(best, true, null) }
  const fail = FAIL()
  const reason = motion && !motion.ok ? motion.reason : swipe && !swipe.ok ? swipe.reason : 'no-pull'
  return { rip: fail, view: view(fail, false, reason) }
}

export class Room {
  readonly seats: [Seat | null, Seat | null] = [null, null]
  match: MatchState = newMatch()
  round = 0
  phase: 'wait' | 'launch' | 'battle' | 'between' | 'done' = 'wait'
  battle: BattleState | null = null
  launchAt = 0
  private views: [RipView | null, RipView | null] = [null, null]
  private seed = 0
  private timers: ReturnType<typeof setTimeout>[] = []
  private loop: ReturnType<typeof setInterval> | null = null
  private acc = 0
  private lastAt = 0
  private events: BattleEvent[] = []

  constructor(readonly code: string, private opts: { seatHoldMs: number; now: () => number; onDone: (r: Room) => void; onResult?: (r: Room) => void; speed?: number }) {}

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms / (this.opts.speed ?? 1)))
  }

  broadcast(m: ServerMsg): void {
    for (const s of this.seats) if (s?.online) s.send(m)
  }

  seat(playerId: string, name: string, build: TopBuild, send: (m: ServerMsg) => void): Side | null {
    const existing = this.seats.findIndex(s => s?.playerId === playerId)
    if (existing >= 0) return this.reconnect(existing as Side, send)
    const free = this.seats.findIndex(s => !s)
    if (free < 0 || this.phase !== 'wait') return null
    const side = free as Side
    assembleTop(build)
    this.seats[side] = { playerId, name, build, send, online: true, hold: null, rip: null, inputs: new Map(), last: { x: 0, y: 0, seq: 0 }, maxSeq: 0, track: new InputTrack() }
    send({ k: 'room', code: this.code, side })
    const other = this.seats[(1 - side) as Side]
    if (other) {
      send({ k: 'peer', name: other.name, build: other.build, online: other.online })
      other.send({ k: 'peer', name, build, online: true })
      this.later(TIMING.firstRoundDelayMs, () => this.nextRound())
    }
    return side
  }

  private reconnect(side: Side, send: (m: ServerMsg) => void): Side {
    const s = this.seats[side]!
    if (s.hold) clearTimeout(s.hold)
    s.hold = null
    s.online = true
    s.send = send
    send({ k: 'room', code: this.code, side })
    const other = this.seats[(1 - side) as Side]
    if (other) {
      send({ k: 'peer', name: other.name, build: other.build, online: other.online })
      if (other.online) other.send({ k: 'peer', name: s.name, build: s.build, online: true })
    }
    if (this.phase === 'launch') send({ k: 'round', round: this.round, launchAt: this.launchAt })
    if (this.phase === 'battle' && this.battle) {
      send({ k: 'start', round: this.round, seed: this.seed, rips: this.views as [RipView, RipView], tick: this.battle.tick })
      send(this.snap())
    }
    return side
  }

  disconnect(side: Side): void {
    const s = this.seats[side]
    if (!s || this.phase === 'done') return
    s.online = false
    const other = this.seats[(1 - side) as Side]
    if (!other) return this.finish()
    other.send({ k: 'peer', name: s.name, build: s.build, online: false })
    s.hold = setTimeout(() => this.forfeit(side, 'forfeit'), this.opts.seatHoldMs)
  }

  forfeit(side: Side, reason: 'forfeit' | 'quit'): void {
    if (this.phase === 'done') return
    const winner = (1 - side) as Side
    this.match = { ...this.match, winner }
    this.seats[winner]?.send({ k: 'left', reason })
    this.finish()
  }

  private nextRound(): void {
    if (this.phase === 'done') return
    this.round++
    this.phase = 'launch'
    this.battle = null
    this.views = [null, null]
    for (const s of this.seats) if (s) { s.rip = null; s.inputs.clear(); s.last = { x: 0, y: 0, seq: s.maxSeq }; s.track = new InputTrack(s.maxSeq) }
    this.launchAt = this.opts.now() + TIMING.countdownMs
    this.broadcast({ k: 'round', round: this.round, launchAt: this.launchAt })
    const round = this.round
    this.later(TIMING.countdownMs + TIMING.ripGraceMs, () => { if (this.round === round && this.phase === 'launch') this.startBattle() })
  }

  onRip(side: Side, msg: { round: number; motion?: MotionSample[] | undefined; swipe?: { points: TouchSample[]; h: number } | undefined; pull100: number }): void {
    const s = this.seats[side]
    if (!s || this.phase !== 'launch' || msg.round !== this.round || s.rip) return
    const j = judgeRip(msg)
    s.rip = j.rip
    this.views[side] = j.view
    if (this.seats.every(x => x?.rip)) this.startBattle()
  }

  private startBattle(): void {
    const [a, b] = this.seats
    if (!a || !b) return
    for (const [i, s] of [a, b].entries()) if (!s.rip) { s.rip = FAIL(); this.views[i] = view(s.rip, false, 'no-pull') }
    this.seed = Math.floor(Math.random() * 2 ** 31)
    this.battle = createBattle([assembleTop(a.build), assembleTop(b.build)], [{ rip: a.rip!, hesitate: false }, { rip: b.rip!, hesitate: false }], this.seed)
    this.phase = 'battle'
    this.broadcast({ k: 'start', round: this.round, seed: this.seed, rips: this.views as [RipView, RipView], tick: 0 })
    this.acc = 0
    this.lastAt = this.opts.now()
    this.loop = setInterval(() => this.pump(), 8)
  }

  onInputs(side: Side, from: number, list: [number, number, number][]): void {
    const s = this.seats[side], b = this.battle
    if (!s || !b || this.phase !== 'battle') return
    for (let i = 0; i < list.length; i++) {
      const [x, y, seq] = list[i]!
      const sq = Number.isInteger(seq) ? Math.max(0, seq) : 0
      s.maxSeq = Math.max(s.maxSeq, sq)
      const tick = from + i
      if (tick > b.tick && tick <= b.tick + NET.maxLead) s.inputs.set(tick, { x: clamp(x, -1, 1), y: clamp(y, -1, 1), seq: sq })
    }
  }

  private pump(): void {
    const now = this.opts.now()
    this.acc += Math.min(250, now - this.lastAt) * (this.opts.speed ?? 1)
    this.lastAt = now
    while (this.acc >= NET.tickMs && this.battle && this.phase === 'battle') {
      this.acc -= NET.tickMs
      this.step()
    }
  }

  step(): void {
    const b = this.battle!
    const t = b.tick + 1
    const ins = this.seats.map(s => {
      const got = s!.inputs.get(t)
      s!.inputs.delete(t)
      const inp = got ?? { ...s!.last, seq: s!.maxSeq }
      s!.last = inp
      return s!.track.at(inp)
    }) as [ReturnType<InputTrack['at']>, ReturnType<InputTrack['at']>]
    this.events.length = 0
    stepBattle(b, ins, this.events)
    if (b.tick % NET.snapEvery === 0 || b.outcome) this.broadcast(this.snap())
    if (b.outcome) this.endRound()
  }

  snap(): ServerMsg {
    const s = this.seats as [Seat, Seat]
    return { k: 'snap', tick: this.battle!.tick, state: this.battle!, inputs: [{ ...s[0].last, seq: s[0].track.seq }, { ...s[1].last, seq: s[1].track.seq }] }
  }

  private endRound(): void {
    if (this.loop) clearInterval(this.loop)
    this.loop = null
    const outcome = this.battle!.outcome!
    this.match = applyRound(this.match, outcome)
    this.phase = 'between'
    this.broadcast({ k: 'end', round: this.round, outcome, scores: this.match.scores, winner: this.match.winner })
    if (this.match.winner !== null) return this.finish()
    this.later(TIMING.betweenRoundsMs, () => this.nextRound())
  }

  private finish(): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    if (this.loop) clearInterval(this.loop)
    for (const t of this.timers) clearTimeout(t)
    for (const s of this.seats) if (s?.hold) clearTimeout(s.hold)
    if (this.match.winner !== null && this.seats[0] && this.seats[1]) this.opts.onResult?.(this)
    this.opts.onDone(this)
  }

  close(): void {
    this.phase = 'done'
    if (this.loop) clearInterval(this.loop)
    for (const t of this.timers) clearTimeout(t)
    for (const s of this.seats) if (s?.hold) clearTimeout(s.hold)
  }
}
