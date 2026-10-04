import { decode, encode, RttStats, type ClientMsg, type ServerMsg, type Side, type TopBuild, type WireMsg } from '@spirit/core'
import { authToken } from '../state/sync'
import { log } from '../telemetry'

type Handler = (m: ServerMsg) => void

class Realtime {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private latest = new Map<ServerMsg['k'], ServerMsg>()
  private wantOpen = false
  private retry = 0
  private opening: Promise<void> | null = null
  private welcomed = false
  private name = 'Spinner'
  offset = 0
  rtt = 150
  code: string | null = null
  watchCode: string | null = null
  side: Side | null = null
  peer: { name: string; build: TopBuild; online: boolean } | null = null
  net = new RttStats()
  private wireHandlers = new Set<(m: WireMsg) => void>()
  private pingTimer = 0

  on(fn: Handler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  last<K extends ServerMsg['k']>(k: K): Extract<ServerMsg, { k: K }> | undefined {
    return this.latest.get(k) as Extract<ServerMsg, { k: K }> | undefined
  }

  private emit(m: ServerMsg): void {
    for (const h of this.handlers) h(m)
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.welcomed
  }

  send(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  onWire(fn: (m: WireMsg) => void): () => void {
    this.wireHandlers.add(fn)
    return () => this.wireHandlers.delete(fn)
  }

  sendWire(m: WireMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(m))
  }

  battlePings(on: boolean): void {
    clearInterval(this.pingTimer)
    this.pingTimer = on ? window.setInterval(() => this.sendWire({ op: 'ping', t: performance.now() }), 500) : 0
  }

  private onWireMsg(m: WireMsg): void {
    if (m.op !== 'pong') {
      for (const h of this.wireHandlers) h(m)
      return
    }
    const rtt = performance.now() - m.t
    this.net.add(rtt)
    this.rtt = this.net.rtt
    if (rtt <= this.net.min + 5) this.offset += (m.server + rtt / 2 - Date.now() - this.offset) * 0.25
  }

  serverNow(): number {
    return Date.now() + this.offset
  }

  toLocalPerf(serverMs: number): number {
    return performance.now() + (serverMs - this.serverNow())
  }

  async connect(name: string): Promise<void> {
    this.name = name
    this.wantOpen = true
    if (this.ws?.readyState === WebSocket.OPEN && this.welcomed) return
    this.opening ??= this.open().finally(() => { this.opening = null })
    await this.opening
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = authToken()
      if (!token) return reject(new Error('no-auth'))
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rt`)
      this.ws = ws
      ws.binaryType = 'arraybuffer'
      let welcomed = false
      this.welcomed = false
      ws.onopen = () => ws.send(JSON.stringify({ k: 'hello', token, name: this.name } satisfies ClientMsg))
      ws.onmessage = e => {
        if (typeof e.data !== 'string') {
          const w = decode(e.data as ArrayBuffer)
          if (w) this.onWireMsg(w)
          return
        }
        const m = JSON.parse(e.data) as ServerMsg
        if (m.k === 'welcome') {
          welcomed = true
          this.welcomed = true
          this.net = new RttStats()
          this.retry = 0
          void this.sync().then(() => {
            if (this.code) this.send({ k: 'rejoin', code: this.code })
            else if (this.watchCode) this.send({ k: 'watch', code: this.watchCode })
            resolve()
          })
        }
        if (m.k === 'pong') return this.onPong(m)
        if (m.k === 'room') { this.code = m.code; this.side = m.side }
        if (m.k === 'watching') this.watchCode = m.code
        if (m.k === 'peer') this.peer = { name: m.name, build: m.build, online: m.online }
        if (m.k === 'error') log('net.error', { code: m.code })
        this.latest.set(m.k, m)
        this.emit(m)
      }
      ws.onclose = e => {
        if (this.ws === ws) this.welcomed = false
        log('net.close', { code: e.code, welcomed, inRoom: !!this.code })
        if (!welcomed) reject(new Error(`closed ${e.code}`))
        if (this.wantOpen && (this.code || this.watchCode) && e.code !== 4000 && e.code !== 4001) {
          if (this.retry < 6) {
            const wait = 400 * 2 ** this.retry++
            setTimeout(() => void this.open().catch(() => undefined), wait)
          } else this.emit({ k: 'error', code: 'no-room' })
        }
      }
    })
  }

  private pings = new Map<number, (v: { rtt: number; offset: number }) => void>()

  private onPong(m: Extract<ServerMsg, { k: 'pong' }>): void {
    const now = Date.now()
    const rtt = now - m.t
    this.pings.get(m.t)?.({ rtt, offset: m.server - (m.t + rtt / 2) })
    this.pings.delete(m.t)
  }

  private async sync(): Promise<void> {
    const samples: { rtt: number; offset: number }[] = []
    for (let i = 0; i < 5; i++) {
      const t = Date.now() + i * 0.001
      const p = new Promise<{ rtt: number; offset: number }>(r => this.pings.set(t, r))
      this.send({ k: 'ping', t })
      samples.push(await Promise.race([p, new Promise<{ rtt: number; offset: number }>(r => setTimeout(() => r({ rtt: 9999, offset: this.offset }), 1500))]))
    }
    const best = samples.sort((a, b) => a.rtt - b.rtt)[0]!
    if (best.rtt < 9999) { this.offset = best.offset; this.rtt = best.rtt }
    log('net.sync', { rtt: Math.round(best.rtt), offset: Math.round(this.offset), spread: Math.round(samples[samples.length - 1]!.rtt - best.rtt) })
  }

  reset(): void {
    this.code = null
    this.watchCode = null
    this.side = null
    this.peer = null
    this.latest.clear()
  }

  leave(): void {
    if (this.code || this.watchCode) this.send({ k: 'leave' })
    this.reset()
  }

  close(): void {
    this.battlePings(false)
    this.wantOpen = false
    this.reset()
    this.ws?.close()
    this.ws = null
  }
}

export const rt = new Realtime()
