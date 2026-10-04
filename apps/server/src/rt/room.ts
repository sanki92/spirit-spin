import {
  applyRound, assembleTop, composeRip, judgeRip, toView, createBattle, newMatch,
  type BattleState, type MatchState, type MotionSample, type RipResult, type RipView, type ServerMsg,
  type Side, type TopBuild, type TouchSample, type WireMsg,
} from '@spirit/core'
import { LiveMatch, type LiveDeps } from './live'

export const TIMING = { countdownMs: 3050, ripGraceMs: 2200, betweenRoundsMs: 3200, readyGapMs: 900, readyTimeoutMs: 25000 }

export interface Seat {
  playerId: string
  name: string
  build: TopBuild
  send: (m: ServerMsg) => void
  close: () => void
  online: boolean
  hold: ReturnType<typeof setTimeout> | null
  ready: boolean
  rip: RipResult | null
  bin: (b: Uint8Array) => void
  ripLog: RipView[]
  tiltSum: number
  tiltN: number
}

const FAIL = (): RipResult => composeRip(0.15, 0.3, 0.45, 0, 0)
const noop = () => undefined

export class Room {
  readonly seats: [Seat | null, Seat | null] = [null, null]
  match: MatchState = newMatch()
  round = 0
  phase: 'wait' | 'launch' | 'battle' | 'between' | 'done' = 'wait'
  live: LiveMatch | null = null
  launchAt = 0
  private views: [RipView | null, RipView | null] = [null, null]
  private seed = 0
  private timers: ReturnType<typeof setTimeout>[] = []
  readonly spectators = new Map<(m: ServerMsg) => void, (b: Uint8Array) => void>()

  constructor(readonly code: string, private opts: { seatHoldMs: number; now: () => number; onDone: (r: Room) => void; onResult?: (r: Room) => void; speed?: number; log?: (o: Record<string, unknown>) => void }) {}

  get battle(): BattleState | null {
    return this.live?.ver.tl.state ?? null
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms / (this.opts.speed ?? 1)))
  }

  broadcast(m: ServerMsg): void {
    for (const s of this.seats) if (s?.online) s.send(m)
    for (const w of this.spectators.keys()) w(m)
  }

  private seatsMsg(): ServerMsg {
    return { k: 'seats', seats: this.seats.map(s => (s ? { name: s.name, build: s.build, online: s.online } : null)) }
  }

  watch(send: (m: ServerMsg) => void, bin: (b: Uint8Array) => void = noop): boolean {
    if (this.spectators.size >= 4) return false
    this.spectators.set(send, bin)
    send({ k: 'watching', code: this.code })
    send(this.seatsMsg())
    if (this.phase === 'launch') send({ k: 'round', round: this.round, launchAt: this.launchAt })
    if (this.phase === 'battle' && this.live) {
      send(this.startMsg())
      send(this.live.catchup(null))
    }
    return true
  }

  unwatch(send: (m: ServerMsg) => void): void {
    this.spectators.delete(send)
    if (!this.spectators.size && this.seats.every(s => !s)) this.finish()
  }

  private seatsChanged(): void {
    const m = this.seatsMsg()
    for (const w of this.spectators.keys()) w(m)
  }

  seat(playerId: string, name: string, build: TopBuild, send: (m: ServerMsg) => void, close: () => void = noop, bin: (b: Uint8Array) => void = noop): Side | null {
    const existing = this.seats.findIndex(s => s?.playerId === playerId)
    if (existing >= 0) return this.reconnect(existing as Side, send, close, bin)
    const free = this.seats.findIndex(s => !s)
    if (free < 0 || this.phase !== 'wait') return null
    const side = free as Side
    assembleTop(build)
    this.seats[side] = { playerId, name, build, send, close, online: true, hold: null, ready: false, rip: null, bin, ripLog: [], tiltSum: 0, tiltN: 0 }
    send({ k: 'room', code: this.code, side })
    this.seatsChanged()
    const other = this.seats[(1 - side) as Side]
    if (other) {
      send({ k: 'peer', name: other.name, build: other.build, online: other.online })
      other.send({ k: 'peer', name, build, online: true })
      this.later(TIMING.readyTimeoutMs, () => this.kickoff())
    }
    return side
  }

  onReady(side: Side): void {
    const s = this.seats[side]
    if (!s || s.ready) return
    s.ready = true
    if (this.seats.every(x => x?.ready)) this.later(TIMING.readyGapMs, () => this.kickoff())
  }

  private kickoff(): void {
    if (this.round === 0 && this.phase === 'wait' && this.seats.every(Boolean)) this.nextRound()
  }

  private reconnect(side: Side, send: (m: ServerMsg) => void, close: () => void, bin: (b: Uint8Array) => void): Side {
    const s = this.seats[side]!
    if (s.hold) clearTimeout(s.hold)
    s.hold = null
    s.online = true
    const previous = s.close
    s.send = send
    s.close = close
    s.bin = bin
    if (previous !== close) previous()
    this.seatsChanged()
    send({ k: 'room', code: this.code, side })
    const other = this.seats[(1 - side) as Side]
    if (other) {
      send({ k: 'peer', name: other.name, build: other.build, online: other.online })
      if (other.online) other.send({ k: 'peer', name: s.name, build: s.build, online: true })
    }
    if (this.phase === 'launch') send({ k: 'round', round: this.round, launchAt: this.launchAt })
    if (this.phase === 'battle' && this.live) {
      send(this.startMsg())
      send(this.live.catchup(side))
    }
    return side
  }

  disconnect(side: Side, send?: (m: ServerMsg) => void): void {
    const s = this.seats[side]
    if (!s || this.phase === 'done' || (send && s.send !== send)) return
    if (s.hold) clearTimeout(s.hold)
    s.online = false
    this.seatsChanged()
    const other = this.seats[(1 - side) as Side]
    if (!other) {
      if (this.spectators.size && this.phase === 'wait') {
        this.seats[side] = null
        return this.seatsChanged()
      }
      return this.finish()
    }
    other.send({ k: 'peer', name: s.name, build: s.build, online: false })
    s.hold = setTimeout(() => this.forfeit(side, 'forfeit'), this.opts.seatHoldMs)
  }

  forfeit(side: Side, reason: 'forfeit' | 'quit'): void {
    if (this.phase === 'done') return
    const winner = (1 - side) as Side
    this.match = { ...this.match, winner }
    this.seats[winner]?.send({ k: 'left', reason })
    for (const w of this.spectators.keys()) w({ k: 'left', reason, winner })
    this.finish()
  }

  private nextRound(): void {
    if (this.phase === 'done') return
    this.round++
    this.phase = 'launch'
    this.live?.stop()
    this.live = null
    this.views = [null, null]
    for (const s of this.seats) if (s) s.rip = null
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
    for (const [i, s] of [a, b].entries()) if (!s.rip) { s.rip = FAIL(); this.views[i] = toView(s.rip, false, 'no-pull') }
    a.ripLog.push(this.views[0]!)
    b.ripLog.push(this.views[1]!)
    this.seed = Math.floor(Math.random() * 2 ** 31)
    const state = createBattle([assembleTop(a.build), assembleTop(b.build)], [{ rip: a.rip!, hesitate: false }, { rip: b.rip!, hesitate: false }], this.seed)
    this.live = new LiveMatch(this.round, state, this.liveDeps())
    this.phase = 'battle'
    this.broadcast(this.startMsg())
  }

  private liveDeps(): LiveDeps {
    const base = this.opts.now(), speed = this.opts.speed ?? 1
    return {
      now: () => base + (this.opts.now() - base) * speed,
      every: (ms, fn) => { const h = setInterval(fn, ms); return () => clearInterval(h) },
      send: (side, bytes) => { const s = this.seats[side]; if (s?.online) s.bin(bytes) },
      watch: bytes => { for (const w of this.spectators.values()) w(bytes) },
      resync: (side, m) => { const s = this.seats[side]; if (s?.online) s.send(m) },
      end: () => this.endRound(),
      log: o => this.opts.log?.({ code: this.code, ...o }),
    }
  }

  private startMsg(): ServerMsg {
    return { k: 'start', round: this.round, seed: this.seed, rips: this.views as [RipView, RipView], tick: 0, t0: this.live!.t0 }
  }

  onWire(side: Side, m: WireMsg): void {
    if (this.phase === 'battle') this.live?.onWire(side, m)
  }

  private endRound(): void {
    const live = this.live!
    for (const i of [0, 1] as const) {
      const s = this.seats[i]
      if (s) { s.tiltSum += live.ver.tilt.sum[i]; s.tiltN += live.ver.tilt.n[i] }
    }
    const outcome = live.ver.outcome!
    this.match = applyRound(this.match, outcome)
    this.phase = 'between'
    this.broadcast({ k: 'end', round: this.round, outcome, scores: this.match.scores, winner: this.match.winner })
    if (this.match.winner !== null) return this.finish()
    this.later(TIMING.betweenRoundsMs, () => this.nextRound())
  }

  private finish(): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    this.live?.stop()
    for (const t of this.timers) clearTimeout(t)
    for (const s of this.seats) if (s?.hold) clearTimeout(s.hold)
    if (this.match.winner !== null && this.seats[0] && this.seats[1]) this.opts.onResult?.(this)
    this.opts.onDone(this)
  }

  close(): void {
    this.phase = 'done'
    this.live?.stop()
    for (const t of this.timers) clearTimeout(t)
    for (const s of this.seats) if (s?.hold) clearTimeout(s.hold)
  }
}
