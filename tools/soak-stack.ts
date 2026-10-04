import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import { assembleTop, beginAt, chooseDelay, createBattle, decode, encode, NetDriver, startTimeline, targetMargin, type RipResult, type ServerMsg, type TopBuild, type WireMsg } from '../packages/core/src/index'

const API = process.env.API ?? 'http://127.0.0.1:8787'
const EDGE_WS = process.env.EDGE_WS ?? 'ws://127.0.0.1:4434/ws'
const MATCHES = Number(process.env.MATCHES ?? 20)
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 240000)
const BUILDS: TopBuild[] = [{ bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' }, { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' }]
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200, y: 100 + i * 50 })), h: 800 }

const POOL = '.local/soak-tokens.json'

async function tokens(n: number): Promise<string[]> {
  const have: string[] = existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')) : []
  while (have.length < n) {
    const r = await fetch(`${API}/v1/auth/guest`, { method: 'POST' })
    if (r.status === 429) { await new Promise(res => setTimeout(res, 5000)); continue }
    const j = (await r.json()) as { token?: string }
    if (!j.token) throw new Error(`guest sign-in failed: ${r.status}`)
    have.push(j.token)
    mkdirSync('.local', { recursive: true })
    writeFileSync(POOL, JSON.stringify(have))
  }
  return have.slice(0, n)
}

type Summary = { summary: { counts: { rounds: number; desyncs: number; fallbacks: number; lost: number; streamDrops: number }; byMode: Record<string, number> } }

class Bot {
  ws!: WebSocket
  edge: WebSocket | null = null
  side: 0 | 1 = 0
  offset = 0
  rtt = 20
  driver: NetDriver | null = null
  begin = Infinity
  acc = 0
  last = 0
  done: Promise<ServerMsg>
  private finish!: (m: ServerMsg) => void
  private waiters: [string, (m: ServerMsg) => void][] = []

  constructor(readonly name: string, readonly build: TopBuild) {
    this.done = new Promise(r => { this.finish = r })
  }

  async connect(token: string): Promise<void> {
    this.ws = new WebSocket(API.replace(/^http/, 'ws') + '/rt')
    this.ws.binaryType = 'arraybuffer'
    this.ws.on('message', (d, bin) => (bin ? this.onWire(decode(new Uint8Array(d as ArrayBuffer))) : this.onJson(JSON.parse(String(d)) as ServerMsg)))
    await new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej) })
    this.ws.on('error', () => undefined)
    this.send({ k: 'hello', token, name: this.name })
    await Promise.race([this.wait('welcome'), new Promise((_, rej) => setTimeout(() => rej(new Error(`${this.name}: no welcome`)), 10000))])
    const t = Date.now()
    this.send({ k: 'ping', t })
    const p = (await this.wait('pong')) as Extract<ServerMsg, { k: 'pong' }>
    this.rtt = Date.now() - t
    this.offset = p.server - (t + this.rtt / 2)
  }

  send(m: unknown): void { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)) }
  wait(k: string): Promise<ServerMsg> { return new Promise(r => this.waiters.push([k, r])) }
  now(): number { return Date.now() + this.offset }

  private onJson(m: ServerMsg): void {
    this.waiters = this.waiters.filter(([k, r]) => (k === m.k ? (r(m), false) : true))
    if (m.k === 'room') this.side = m.side
    if (m.k === 'round') setTimeout(() => this.send({ k: 'rip', round: m.round, swipe: SWIPE, pull100: 7 }), Math.max(0, m.launchAt - this.now()) + 30)
    if (m.k === 'start') this.onStart(m)
    if (m.k === 'resync' && this.driver) this.driver.resync(m.tl)
    if (m.k === 'end' && m.winner !== null) this.finish(m)
    if (m.k === 'left' || (m.k === 'error' && m.code === 'no-room')) this.finish(m)
  }

  private onStart(m: Extract<ServerMsg, { k: 'start' }>): void {
    const rips = m.rips.map(v => ({ ...v, startT: 0 }) as unknown as RipResult)
    const s = createBattle([assembleTop(BUILDS[0]!), assembleTop(BUILDS[1]!)], [{ rip: rips[0]!, hesitate: false }, { rip: rips[1]!, hesitate: false }], m.seed)
    if (m.edge && !this.edge) {
      this.edge = new WebSocket(`${EDGE_WS}?t=${encodeURIComponent(m.edge.ticket)}`)
      this.edge.binaryType = 'arraybuffer'
      this.edge.on('message', d => this.onWire(decode(new Uint8Array(d as ArrayBuffer))))
      this.edge.on('error', () => undefined)
    }
    const edged = !!m.edge
    const sink = { send: (w: WireMsg) => { const b = encode(w); if (edged) { if (this.edge?.readyState === WebSocket.OPEN) this.edge.send(b) } else if (this.ws.readyState === WebSocket.OPEN) this.ws.send(b) } }
    this.driver = new NetDriver(startTimeline(s), this.side, m.round, chooseDelay(this.rtt, 5), targetMargin(5), sink)
    this.driver.rtt = this.rtt
    this.begin = beginAt(m.t0, this.rtt, this.driver.session.delay, this.driver.clock.target)
  }

  private onWire(m: WireMsg | null): void {
    if (!m || m.op !== 'frames' || !this.driver) return
    const r = this.driver.onFrames(m, this.now())
    for (let i = 0; r && i < r.jump; i++) this.step()
  }

  step(): void {
    const d = this.driver!
    const v = d.view()
    const me = v.tops[this.side], foe = v.tops[1 - this.side]!
    const dx = foe.x - me.x, dy = foe.y - me.y, l = Math.hypot(dx, dy) || 1
    d.step(dx / l, dy / l, Math.random() < 1 / 300, [])
  }

  pump(): void {
    const t = performance.now()
    const dt = this.last ? t - this.last : 0
    this.last = t
    const d = this.driver
    if (!d || d.done || this.now() < this.begin) return
    this.acc += Math.min(dt, 100) * d.clock.scale
    while (this.acc >= 1000 / 60) { this.step(); this.acc -= 1000 / 60 }
  }

  close(): void {
    this.ws.close()
    this.edge?.close()
  }
}

async function match(i: number, pool: string[]): Promise<string> {
  const a = new Bot(`A${i}`, BUILDS[0]!), b = new Bot(`B${i}`, BUILDS[1]!)
  await a.connect(pool[2 * i]!)
  await b.connect(pool[2 * i + 1]!)
  a.send({ k: 'create', build: a.build })
  const room = (await a.wait('room')) as Extract<ServerMsg, { k: 'room' }>
  b.send({ k: 'join', code: room.code, build: b.build })
  await b.wait('room')
  a.send({ k: 'ready' })
  b.send({ k: 'ready' })
  const timer = setInterval(() => { a.pump(); b.pump() }, 4)
  const timeout = new Promise<ServerMsg>(r => setTimeout(() => r({ k: 'error', code: 'no-room' }), TIMEOUT_MS))
  const [ea, eb] = await Promise.all([Promise.race([a.done, timeout]), Promise.race([b.done, timeout])])
  clearInterval(timer)
  a.close()
  b.close()
  return `${i}: ${ea.k}/${eb.k} ${ea.k === 'end' ? (ea as Extract<ServerMsg, { k: 'end' }>).scores.join('-') : ''}`
}

const dash = async () => (await (await fetch(`${API}/__dev/net.json`)).json()) as Summary
const pool = await tokens(MATCHES * 2)
const before = await dash()
const results = await Promise.all(Array.from({ length: MATCHES }, (_, i) => new Promise<string>(r => setTimeout(r, i * 150)).then(() => match(i, pool))))
for (const r of results) console.log(r)
await new Promise(r => setTimeout(r, 1500))
const after = await dash()
const c0 = before.summary.counts, c1 = after.summary.counts
const out = { matches: MATCHES, finished: results.filter(r => r.includes('end/end')).length, rounds: c1.rounds - c0.rounds, desyncs: c1.desyncs - c0.desyncs, fallbacks: c1.fallbacks - c0.fallbacks, lost: c1.lost - c0.lost, streamDrops: c1.streamDrops - c0.streamDrops, byMode: after.summary.byMode }
console.log(JSON.stringify(out))
process.exit(out.desyncs === 0 && out.finished === MATCHES && out.lost === 0 ? 0 : 1)
