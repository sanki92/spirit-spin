import { fileURLToPath } from 'node:url'
import * as grpc from '@grpc/grpc-js'
import * as loader from '@grpc/proto-loader'
import { encode, unpackFrames, WIRE, type BattleState, type Frame, type ServerMsg, type Side, type WireMsg } from '@spirit/core'
import { Verifier } from './verifier'

export interface RoundRunner { readonly t0: number; readonly ver: Verifier; onWire(side: Side, m: WireMsg): void; catchup(side: Side | null): Extract<ServerMsg, { k: 'catchup' }>; stop(): void }
export interface EdgeConfig { grpc: string; secret: string; wt: string; ws: string }
export interface EdgeBatch { round: number; first: number; frames: Frame[]; hashes: { side: Side; frame: number; hash: number }[] }

type RawBatch = { round: number; first: number; inputs: Buffer; hashes: { side: number; frame: number; hash: number }[] }
type Unary = (req: object, md: grpc.Metadata, opts: grpc.CallOptions, cb: (e: grpc.ServiceError | null, r: unknown) => void) => void
type Svc = grpc.Client & Record<string, Unary> & { StreamFrames(req: object, md: grpc.Metadata): grpc.ClientReadableStream<RawBatch> }

const def = loader.loadSync(fileURLToPath(new URL('../../../../proto/edge.proto', import.meta.url)), { longs: Number, defaults: true })
const Edge = (grpc.loadPackageDefinition(def) as unknown as { spirit: { edge: { v1: { Edge: new (addr: string, cred: grpc.ChannelCredentials) => Svc } } } }).spirit.edge.v1.Edge

export class EdgeClient {
  private c: Svc
  private md = new grpc.Metadata()

  constructor(readonly cfg: EdgeConfig) {
    this.c = new Edge(cfg.grpc, grpc.credentials.createInsecure())
    this.md.set('authorization', `Bearer ${cfg.secret}`)
  }

  private call<R>(name: string, req: object): Promise<R> {
    return new Promise((res, rej) => this.c[name]!.call(this.c, req, this.md, { deadline: Date.now() + 2000 }, (e, r) => (e ? rej(e) : res(r as R))))
  }

  createMatch(id: string): Promise<{ certHash: string }> { return this.call('CreateMatch', { matchId: id }) }
  async startRound(id: string, round: number, leadInMs: number): Promise<number> { return (await this.call<{ t0: number }>('StartRound', { matchId: id, round, leadInMs })).t0 }
  async endRound(id: string, round: number): Promise<Record<string, unknown>> { return (await this.call<{ stats: Record<string, unknown> }>('EndRound', { matchId: id, round })).stats }
  async endMatch(id: string): Promise<void> { await this.call('EndMatch', { matchId: id }) }

  stream(id: string, round: number, after: number, onBatch: (b: EdgeBatch) => void, onEnd: (err: unknown) => void): () => void {
    const s = this.c.StreamFrames({ matchId: id, round, after }, this.md)
    let done = false
    const finish = (err: unknown) => { if (!done) { done = true; onEnd(err) } }
    s.on('data', (b: RawBatch) => onBatch({ round: b.round, first: b.first, frames: unpackFrames(new Uint8Array(b.inputs)), hashes: b.hashes.map(h => ({ side: (h.side === 1 ? 1 : 0) as Side, frame: h.frame, hash: h.hash })) }))
    s.on('error', e => { if ((e as grpc.ServiceError).code !== grpc.status.CANCELLED) finish(e) })
    s.on('end', () => finish(null))
    return () => { done = true; s.cancel() }
  }

  close(): void { this.c.close() }
}

export type EdgeApi = Pick<EdgeClient, 'cfg' | 'createMatch' | 'startRound' | 'endRound' | 'endMatch' | 'stream'>

export interface RemoteDeps { watch(b: Uint8Array): void; resync(side: Side, m: ServerMsg): void; end(): void; lost(): void; log(o: Record<string, unknown>): void }

export const REMOTE = { retries: 20, retryMs: 200, resyncGapMs: 500 } as const

export class RemoteRound implements RoundRunner {
  readonly ver: Verifier
  private cancel: () => void = () => undefined
  private done = false
  private retries = 0
  private lastResync: [number, number] = [-Infinity, -Infinity]
  ended: Promise<void> = Promise.resolve()

  constructor(readonly round: number, state: BattleState, readonly t0: number, private edge: EdgeApi, private matchId: string, private d: RemoteDeps) {
    this.ver = new Verifier(state)
    this.subscribe()
  }

  private subscribe(): void {
    this.cancel = this.edge.stream(this.matchId, this.round, this.ver.frame, b => this.onBatch(b), err => {
      if (this.done) return
      this.d.log({ msg: 'edge.stream-end', round: this.round, err: String(err) })
      if (this.retries++ < REMOTE.retries) setTimeout(() => { if (!this.done) this.subscribe() }, REMOTE.retryMs)
      else {
        this.stop()
        this.d.lost()
      }
    })
  }

  private onBatch(b: EdgeBatch): void {
    if (this.done || b.round !== this.round) return
    this.retries = 0
    const before = this.ver.frame
    this.ver.apply(b.first, b.frames)
    const after = this.ver.frame
    for (let i = before; i < after; i += WIRE.maxReliableFrames) {
      const lo = i - (b.first - 1), hi = Math.min(after, i + WIRE.maxReliableFrames) - (b.first - 1)
      this.d.watch(encode({ op: 'frames', round: this.round & 255, first: i + 1, margin: 0, frames: b.frames.slice(lo, hi) }))
    }
    for (const h of b.hashes) {
      if (this.ver.check(h.frame, h.hash) !== 'mismatch') continue
      const now = Date.now()
      if (now - this.lastResync[h.side] < REMOTE.resyncGapMs) continue
      this.lastResync[h.side] = now
      this.d.log({ msg: 'net.desync', level: 'error', round: this.round, side: h.side, frame: h.frame, mode: 'edge' })
      this.d.resync(h.side, { k: 'resync', round: this.round, tl: this.ver.tl })
    }
    if (this.ver.outcome) {
      this.stop()
      this.ended = this.edge.endRound(this.matchId, this.round).then(
        s => this.d.log({ msg: 'net.round', mode: 'edge', round: this.round, desyncs: this.ver.desyncs, ...s }),
        e => this.d.log({ msg: 'net.round', mode: 'edge', round: this.round, desyncs: this.ver.desyncs, frames: this.ver.frame, statsError: String(e) }),
      )
      this.d.end()
    }
  }

  onWire(): void {}

  catchup(_side: Side | null): Extract<ServerMsg, { k: 'catchup' }> {
    return { k: 'catchup', round: this.round, tl: this.ver.tl }
  }

  stop(): void {
    this.done = true
    this.cancel()
  }
}
