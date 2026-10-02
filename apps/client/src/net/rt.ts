import type { ClientMsg, ServerMsg, Side, TopBuild } from '@spirit/core'
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
  side: Side | null = null
  peer: { name: string; build: TopBuild; online: boolean } | null = null

  on(fn: Handler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  last<K extends ServerMsg['k']>(k: K): Extract<ServerMsg, { k: K }> | undefined {
    return this.latest.get(k) as Extract<ServerMsg, { k: K }> | undefined
  }

  send(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
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
      let welcomed = false
      this.welcomed = false
      ws.onopen = () => ws.send(JSON.stringify({ k: 'hello', token, name: this.name } satisfies ClientMsg))
      ws.onmessage = e => {
        const m = JSON.parse(String(e.data)) as ServerMsg
        if (m.k === 'welcome') {
          welcomed = true
          this.welcomed = true
          this.retry = 0
          void this.sync().then(() => {
            if (this.code) this.send({ k: 'rejoin', code: this.code })
            resolve()
          })
        }
        if (m.k === 'pong') return this.onPong(m)
        if (m.k === 'room') { this.code = m.code; this.side = m.side }
        if (m.k === 'peer') this.peer = { name: m.name, build: m.build, online: m.online }
        if (m.k === 'error') log('net.error', { code: m.code })
        this.latest.set(m.k, m)
        for (const h of this.handlers) h(m)
      }
      ws.onclose = e => {
        if (this.ws === ws) this.welcomed = false
        log('net.close', { code: e.code, welcomed, inRoom: !!this.code })
        if (!welcomed) reject(new Error(`closed ${e.code}`))
        if (this.wantOpen && this.code && e.code !== 4000 && this.retry < 6) {
          const wait = 400 * 2 ** this.retry++
          setTimeout(() => void this.open().catch(() => undefined), wait)
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
    this.side = null
    this.peer = null
    this.latest.clear()
  }

  leave(): void {
    if (this.code) this.send({ k: 'leave' })
    this.reset()
  }

  close(): void {
    this.wantOpen = false
    this.reset()
    this.ws?.close()
    this.ws = null
  }
}

export const rt = new Realtime()
