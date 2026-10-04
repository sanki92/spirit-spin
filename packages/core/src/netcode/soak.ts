import type { Side } from '../battle'
import { createRng, rngNext, type RngState } from '../rng'
import { beginAt, chooseDelay, RttStats, targetMargin } from './clock'
import { NetDriver } from './driver'
import { Link, type NetProfile } from './netsim'
import { Replayer, startTimeline, timelineHash } from './replay'
import { SEQ, Sequencer } from './sequencer'
import { fresh } from './testkit'
import { decode, encode, WIRE, type WireMsg } from './wire'

export interface SoakResult { frames: number; finished: boolean; synced: boolean; desyncs: number; ownReplaced: number; stalls: number; maxDepth: number; rollbacks: number; jumps: number; late: [number, number]; lateAt: [number[], number[]] }

interface Client { side: Side; fps: number; rng: RngState; rtt: RttStats; driver: NetDriver | null; acc: number; lastRender: number; nextRender: number; nextPing: number }

export function runMatch(o: { seed: number; profile: NetProfile; profiles?: [NetProfile, NetProfile]; fps?: [number, number]; maxMs?: number; freeze?: { side: Side; from: number; to: number; recvLagMs?: number } }): SoakResult {
  const p = o.profile
  const ps: [NetProfile, NetProfile] = o.profiles ?? [p, p]
  const battle = fresh(o.seed)
  const t0 = SEQ.leadInMs
  const seq = new Sequencer(t0)
  const server = new Replayer(startTimeline(battle))
  const hashes = new Map<number, number>()
  const link = (side: Side, k: number) => new Link<Uint8Array>(ps[side], createRng(o.seed * 31 + k))
  const up = [link(0, 1), link(1, 2)], down = [link(0, 3), link(1, 4)]
  const acked: [number, number] = [0, 0]
  const sent: [number, number] = [0, 0]
  const clients: Client[] = ([0, 1] as Side[]).map(side => ({ side, fps: o.fps?.[side] ?? 60, rng: createRng(o.seed * 17 + side), rtt: new RttStats(), driver: null, acc: 0, lastRender: 0, nextRender: side * 7, nextPing: 0 }))
  const rtt0s = ps.map(q => 2 * q.latency + q.jitter)
  let desyncs = 0
  let endAt = Infinity
  const lateAt: [number[], number[]] = [[], []]
  const minEnd = o.freeze ? o.freeze.to + 3000 : 0
  const maxMs = o.maxMs ?? 60000
  const toServer = (side: Side, now: number) => ({ send: (m: WireMsg) => up[side]!.send(encode(m), now) })
  const stepClient = (c: Client, now: number) => {
    const d = c.driver!
    const v = d.view()
    const me = v.tops[c.side], foe = v.tops[(1 - c.side) as Side]
    const dx = foe.x - me.x, dy = foe.y - me.y, len = Math.hypot(dx, dy) || 1
    d.sink = toServer(c.side, now)
    d.step((dx / len) * 0.8 + (rngNext(c.rng) - 0.5) * 0.3, (dy / len) * 0.8, rngNext(c.rng) < 1 / 240, [])
  }
  const sendFrames = (side: Side, first: number, margin: number, max: number, now: number) => down[side]!.send(encode({ op: 'frames', round: 1, first, margin, frames: seq.confirmed.slice(first - 1, Math.min(seq.frame, first - 1 + max)) }), now)
  for (let now = 0; now < maxMs && now < endAt; now++) {
    let got = false
    for (const side of [0, 1] as Side[]) {
      for (const b of up[side]!.recv(now)) {
        const m = decode(b)
        if (!m) continue
        if (m.op === 'input') { const l = seq.late[side]; acked[side] = Math.max(acked[side], m.ack); seq.receive(side, m.first, m.inputs, now); if (seq.late[side] > l) lateAt[side].push(now); got = true }
        else if (m.op === 'hash') { const h = hashes.get(m.frame); if (h !== undefined && h !== m.hash) desyncs++ }
        else if (m.op === 'ping') down[side]!.send(encode({ op: 'pong', t: m.t, server: now }), now)
      }
    }
    if (!server.tl.state.outcome && (got || now % 4 === 0)) {
      const n = seq.due(now)
      if (n) {
        server.push(seq.frame - n + 1, seq.confirmed.slice(seq.frame - n))
        while (!server.tl.state.outcome && server.stepOne([])) if (server.frame % WIRE.hashEvery === 0) hashes.set(server.frame, timelineHash(server.tl))
        if (server.tl.state.outcome) endAt = Math.max(now + 3000, minEnd)
      }
      if (n || now % WIRE.keepAliveMs === 0) {
        for (const side of [0, 1] as Side[]) {
          if (p.ordered) {
            const from = sent[side]
            if (from === seq.frame) sendFrames(side, from + 1, seq.margin(side), 0, now)
            for (let i = from; i < seq.frame; i += WIRE.maxReliableFrames) sendFrames(side, i + 1, seq.margin(side), WIRE.maxReliableFrames, now)
            sent[side] = seq.frame
          } else sendFrames(side, acked[side] + 1, seq.margin(side), WIRE.maxFrames, now)
        }
      }
    } else if (server.tl.state.outcome && !p.ordered && now % 16 === 0) {
      for (const side of [0, 1] as Side[]) sendFrames(side, acked[side] + 1, 0, WIRE.maxFrames, now)
    }
    for (const c of clients) {
      const frozen = o.freeze && c.side === o.freeze.side && now >= o.freeze.from
      if (frozen && now < o.freeze!.to) continue
      for (const b of frozen && now < o.freeze!.to + (o.freeze!.recvLagMs ?? 0) ? [] : down[c.side]!.recv(now)) {
        const m = decode(b)
        if (!m) continue
        if (m.op === 'pong') { c.rtt.add(now - m.t); if (c.driver && c.rtt.count >= 5) { c.driver.clock.target = targetMargin(c.rtt.jitter); c.driver.rtt = c.rtt.rtt } continue }
        if (m.op !== 'frames' || !c.driver) continue
        c.driver.sink = toServer(c.side, now)
        c.driver.onFrames(m)
      }
      if (now >= c.nextPing) { up[c.side]!.send(encode({ op: 'ping', t: now }), now); c.nextPing = now + 500 }
      const q = ps[c.side], rtt0 = rtt0s[c.side]!
      if (!c.driver && now >= q.latency) { c.driver = new NetDriver(startTimeline(battle), c.side, 1, chooseDelay(rtt0, q.jitter), targetMargin(q.jitter), toServer(c.side, now), t0); c.driver.rtt = rtt0 }
      if (now < c.nextRender) continue
      const dt = now - c.lastRender
      c.lastRender = now
      c.nextRender = now + (1000 / c.fps) * (rngNext(c.rng) < 0.05 ? 3 : 1)
      const d = c.driver
      if (!d || d.done || now < beginAt(t0, rtt0, d.session.delay, d.clock.target)) continue
      c.acc += Math.min(dt, WIRE.tickMs * 6) * d.clock.scale
      let n = 0
      while (c.acc >= WIRE.tickMs && n < 5) { stepClient(c, now); c.acc -= WIRE.tickMs; n++ }
      if (n === 5) c.acc = Math.min(c.acc, WIRE.tickMs)
      for (let j = d.steer(now); j > 0; j--) stepClient(c, now)
    }
  }
  const ds = clients.map(c => c.driver!)
  return {
    frames: server.frame,
    finished: !!server.tl.state.outcome,
    synced: ds.every(d => d.session.confirmed.frame >= server.frame && timelineHash(d.session.confirmed) === timelineHash(server.tl)),
    desyncs,
    ownReplaced: ds.reduce((a, d) => a + d.session.stats.ownReplaced, 0),
    stalls: ds.reduce((a, d) => a + d.session.stats.stalls, 0),
    maxDepth: Math.max(...ds.map(d => d.session.stats.maxDepth)),
    rollbacks: ds.reduce((a, d) => a + d.session.stats.rollbacks, 0),
    jumps: ds.reduce((a, d) => a + d.session.stats.jumps, 0),
    late: [...seq.late],
    lateAt,
  }
}
