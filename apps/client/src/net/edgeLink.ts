import { decode, encode, RttStats, type EdgeInfo, type WireMsg } from '@spirit/core'
import { log } from '../telemetry'
import type { WireLink } from './link'

type Loc = { hostname: string; protocol: string; host: string }

export function edgeUrls(info: EdgeInfo, loc: Loc): { wt: string; ws: string } {
  const t = `?t=${encodeURIComponent(info.ticket)}`
  const ws = /^wss?:\/\//.test(info.ws) ? info.ws : `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${info.ws}`
  return { wt: info.wt.replace('{host}', loc.hostname) + t, ws: ws + t }
}

export function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const pairs = hex.match(/../g) ?? []
  const out = new Uint8Array(new ArrayBuffer(pairs.length))
  pairs.forEach((h, i) => { out[i] = parseInt(h, 16) })
  return out
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

export const EDGE = { wtTimeoutMs: 1500, wsTimeoutMs: 4000, maxBackoffMs: 3000, fastPingMs: 2000, maxRetries: 5 } as const

export class EdgeLink implements WireLink {
  kind: 'wt' | 'ws' | 'none' = 'none'
  readonly net = new RttStats()
  private handlers = new Set<(m: WireMsg) => void>()
  private offset: number
  private synced = false
  private wt: WebTransport | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private ws: WebSocket | null = null
  private closed = false
  private opening = false
  private wtBroken = false
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | 0 = 0
  private pingTimer: ReturnType<typeof setInterval> | 0 = 0
  private opened = 0
  private pings = 0

  constructor(private info: EdgeInfo, private deps: { WT?: typeof WebTransport | undefined; WS?: typeof WebSocket; location?: Loc; baseOffset?: number } = {}) {
    this.offset = deps.baseOffset ?? 0
  }

  start(): void {
    void this.open().catch(() => this.schedule())
  }

  refresh(info: EdgeInfo): void {
    this.info = info
    this.wtBroken = false
    if (this.closed || this.wt || this.ws || this.opening) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = 0
    this.retry = 0
    this.start()
  }

  async open(): Promise<void> {
    if (this.closed || this.opening) return
    this.opening = true
    try {
      const urls = edgeUrls(this.info, this.deps.location ?? location)
      const WT = 'WT' in this.deps ? this.deps.WT : (globalThis as { WebTransport?: typeof WebTransport }).WebTransport
      let wtFailed = false
      if (WT && !this.wtBroken) {
        try {
          await within(this.openWT(WT, urls.wt), EDGE.wtTimeoutMs)
          return this.up('wt')
        } catch (e) {
          wtFailed = true
          log('edge.wt-fail', { err: String(e).slice(0, 120) })
          const t = this.wt
          this.wt = null
          this.writer = null
          try { t?.close() } catch { }
        }
      }
      if (this.closed) return
      try {
        await within(this.openWS(urls.ws), EDGE.wsTimeoutMs)
      } catch (e) {
        const w = this.ws
        this.ws = null
        try { w?.close() } catch { }
        throw e
      }
      if (wtFailed) this.wtBroken = true
      this.up('ws')
    } finally {
      this.opening = false
    }
  }

  private up(kind: 'wt' | 'ws'): void {
    if (this.closed) return this.shut()
    this.kind = kind
    this.retry = 0
    this.opened = performance.now()
    this.pings = 0
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.send({ op: 'ping', t: performance.now() })
    this.pingTimer = setInterval(() => {
      if (performance.now() - this.opened > EDGE.fastPingMs && this.pings++ % 2) return
      this.send({ op: 'ping', t: performance.now() })
    }, 250)
    log('edge.open', { kind })
  }

  private async openWT(WT: typeof WebTransport, url: string): Promise<void> {
    const opts: WebTransportOptions = this.info.certHash ? { serverCertificateHashes: [{ algorithm: 'sha-256', value: hexBytes(this.info.certHash) }] } : {}
    const t = new WT(url, opts)
    this.wt = t
    await t.ready
    if (this.wt !== t) throw new Error('superseded')
    this.writer = t.datagrams.writable.getWriter()
    const reader = t.datagrams.readable.getReader()
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        this.onBytes(value)
      }
    })().catch(() => undefined).finally(() => this.drop(t))
    void t.closed.catch(() => undefined).finally(() => this.drop(t))
  }

  private openWS(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const WS = this.deps.WS ?? WebSocket
      const ws = new WS(url)
      ws.binaryType = 'arraybuffer'
      this.ws = ws
      let opened = false
      ws.onopen = () => { opened = true; resolve() }
      ws.onerror = () => { if (!opened) reject(new Error('ws error')) }
      ws.onmessage = e => { if (typeof e.data !== 'string') this.onBytes(new Uint8Array(e.data as ArrayBuffer)) }
      ws.onclose = () => {
        if (!opened) return reject(new Error('ws closed'))
        this.drop(ws)
      }
    })
  }

  private drop(which: WebTransport | WebSocket): void {
    if (this.closed || (which !== this.wt && which !== this.ws)) return
    this.wt = null
    this.writer = null
    this.ws = null
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = 0
    log('edge.drop', { kind: this.kind })
    this.schedule()
  }

  private schedule(): void {
    if (this.closed || this.timer || this.opening || this.wt || this.ws) return
    if (this.retry >= EDGE.maxRetries) {
      log('edge.gave-up', { kind: this.kind })
      return
    }
    const wait = Math.min(EDGE.maxBackoffMs, 300 * 2 ** this.retry++)
    this.timer = setTimeout(() => {
      this.timer = 0
      this.start()
    }, wait)
  }

  private onBytes(b: Uint8Array): void {
    const m = decode(b)
    if (!m) return
    if (m.op === 'pong') {
      const rtt = performance.now() - m.t
      this.net.add(rtt)
      const o = m.server + rtt / 2 - Date.now()
      if (!this.synced) { this.offset = o; this.synced = true }
      else if (rtt <= this.net.min + 5) this.offset += (o - this.offset) * 0.25
      return
    }
    for (const h of this.handlers) h(m)
  }

  send(m: WireMsg): void {
    const b = encode(m)
    if (this.writer) void this.writer.write(b).catch(() => undefined)
    else if (this.ws?.readyState === 1) this.ws.send(b)
  }

  on(fn: (m: WireMsg) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  serverNow(): number { return Date.now() + this.offset }

  private shut(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.timer) clearTimeout(this.timer)
    this.pingTimer = 0
    this.timer = 0
    try { this.wt?.close() } catch { }
    this.ws?.close()
    this.wt = null
    this.writer = null
    this.ws = null
  }

  close(): void {
    this.closed = true
    this.shut()
  }
}
