import { decode, encode, type ServerMsg, type WireMsg } from '@spirit/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../app'

let app: App
let url = ''
beforeAll(async () => {
  app = await buildApp({ databaseUrl: 'memory://', jwtSecret: 'test-secret-test-secret-test-secret-32', corsOrigins: ['*'], logLevel: 'silent', openaiKey: null }, { realtime: { seatHoldMs: 1500, speed: 8 }, guestPerMinute: 1000 })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/rt`
})
afterAll(async () => { await app.close() })

const BUILD_A = { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' } as const
const BUILD_B = { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' } as const
const SWIPE = { points: Array.from({ length: 11 }, (_, i) => ({ t: 10 + i * 16, x: 200, y: 100 + i * 50 })), h: 800 }

async function client() {
  const token = ((await app.inject({ method: 'POST', url: '/v1/auth/guest' })).json() as { token: string }).token
  const ws = new WebSocket(url)
  const msgs: ServerMsg[] = []
  const cursor: Record<string, number> = {}
  let wake: (() => void) | null = null
  let closed: number | null = null
  ws.binaryType = 'arraybuffer'
  const bins: WireMsg[] = []
  ws.onmessage = e => {
    if (typeof e.data === 'string') msgs.push(JSON.parse(e.data) as ServerMsg)
    else { const m = decode(e.data as ArrayBuffer); if (m) bins.push(m) }
    wake?.()
  }
  const sendBin = (m: WireMsg) => ws.send(encode(m))
  const binCursor: Record<string, number> = {}
  const waitBin = async <O extends WireMsg['op']>(op: O, ms = 8000, pred: (m: Extract<WireMsg, { op: O }>) => boolean = () => true): Promise<Extract<WireMsg, { op: O }>> => {
    const end = Date.now() + ms
    for (;;) {
      const from = binCursor[op] ?? 0
      const i = bins.findIndex((m, j) => j >= from && m.op === op && pred(m as Extract<WireMsg, { op: O }>))
      if (i >= 0) { binCursor[op] = i + 1; return bins[i] as Extract<WireMsg, { op: O }> }
      if (Date.now() > end) throw new Error(`timeout waiting for binary ${op}`)
      await new Promise<void>(r => { wake = r; setTimeout(r, 50) })
    }
  }
  ws.onclose = e => { closed = e.code; wake?.() }
  await new Promise(r => { ws.onopen = r })
  const send = (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m))
  const wait = async <K extends ServerMsg['k']>(k: K, ms = 8000): Promise<Extract<ServerMsg, { k: K }>> => {
    const end = Date.now() + ms
    for (;;) {
      const from = cursor[k] ?? 0
      const i = msgs.findIndex((m, j) => j >= from && m.k === k)
      if (i >= 0) { cursor[k] = i + 1; return msgs[i] as Extract<ServerMsg, { k: K }> }
      if (Date.now() > end) throw new Error(`timeout waiting for ${k}; got ${msgs.map(m => m.k).join(',')}`)
      await new Promise<void>(r => { wake = r; setTimeout(r, 50) })
    }
  }
  return { ws, token, msgs, send, wait, closed: () => closed, bins, sendBin, waitBin }
}

async function pair(ready = true) {
  const a = await client(), b = await client()
  a.send({ k: 'hello', token: a.token, name: 'Aki' })
  b.send({ k: 'hello', token: b.token, name: 'Bo<script>' })
  await a.wait('welcome'); await b.wait('welcome')
  a.send({ k: 'create', build: BUILD_A })
  const room = await a.wait('room')
  b.send({ k: 'join', code: room.code.toLowerCase(), build: BUILD_B })
  if (ready) { a.send({ k: 'ready' }); b.send({ k: 'ready' }) }
  return { a, b, room }
}

describe('realtime', () => {
  it('round 1 waits until both phones have loaded the battle (ready)', async () => {
    const { a, b } = await pair(false)
    await a.wait('peer'); await b.wait('peer')
    await new Promise(r => setTimeout(r, 1400))
    expect(a.msgs.some(m => m.k === 'round')).toBe(false)
    a.send({ k: 'ready' })
    await new Promise(r => setTimeout(r, 500))
    expect(a.msgs.some(m => m.k === 'round')).toBe(false)
    b.send({ k: 'ready' })
    expect((await a.wait('round', 1000)).round).toBe(1)
    a.ws.close(); b.ws.close()
  })

  it('pairs two players, judges rips server-side, streams snapshots and finishes a match', async () => {
    const { a, b, room } = await pair()
    expect(room.side).toBe(0)
    expect((await b.wait('room')).side).toBe(1)
    expect((await a.wait('peer')).name).toBe('Boscript')
    let rounds = 0
    for (;;) {
      const ra = await a.wait('round'), rb = await b.wait('round')
      expect(ra).toEqual(rb)
      a.send({ k: 'rip', round: ra.round, swipe: SWIPE, pull100: 7 })
      b.send({ k: 'rip', round: ra.round, pull100: 7 })
      const sa = await a.wait('start'), sb = await b.wait('start')
      expect(sa).toEqual(sb)
      expect(sa.rips[0]).toMatchObject({ ok: true })
      expect(sa.rips[1]).toMatchObject({ ok: false, reason: 'no-pull' })
      expect(sa.t0).toBeGreaterThan(0)
      a.sendBin({ op: 'input', round: sa.round, first: 1, ack: 0, inputs: [{ x: 64, y: 0, sp: 0 }, { x: 64, y: 0, sp: 0 }, { x: 64, y: 0, sp: 1 }] })
      const fr = await a.waitBin('frames', 8000, m => m.round === (sa.round & 255) && m.frames.length > 0)
      expect(fr.frames[0]![0]).toEqual({ x: 64, y: 0, sp: 0 })
      const end = await a.wait('end', 20000)
      expect(await b.wait('end', 20000)).toEqual(end)
      rounds++
      if (end.winner !== null) { expect(end.scores[end.winner]).toBeGreaterThanOrEqual(4); break }
    }
    expect(rounds).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, 100))
    const fa = (await app.inject({ method: 'GET', url: '/v1/friends', headers: { authorization: `Bearer ${a.token}` } })).json() as { friends: unknown[]; incoming: unknown[] }
    expect(fa.friends).toHaveLength(0)
    expect(fa.incoming).toHaveLength(0)
    const ra = (await app.inject({ method: 'GET', url: '/v1/ranked', headers: { authorization: `Bearer ${a.token}` } })).json() as { ghostRips: number }
    expect(ra.ghostRips).toBeGreaterThan(0)
    a.ws.close(); b.ws.close()
  }, 120000)

  it('the same socket can host a new battle after a match ends', async () => {
    const { a, b, room } = await pair()
    b.send({ k: 'leave' })
    expect((await a.wait('left')).reason).toBe('quit')
    a.send({ k: 'create', build: BUILD_A })
    const next = await a.wait('room')
    expect(next.code).not.toBe(room.code)
    a.ws.close(); b.ws.close()
  })

  it('hosting again mid-match forfeits the old room instead of hanging', async () => {
    const { a, b } = await pair()
    await b.wait('room')
    a.send({ k: 'create', build: BUILD_A })
    expect((await b.wait('left')).reason).toBe('quit')
    expect((await a.wait('room')).side).toBe(0)
    a.ws.close(); b.ws.close()
  })

  it('each player sees the launcher the other equipped; unknown launcher ids are dropped', async () => {
    const a = await client(), b = await client()
    a.send({ k: 'hello', token: a.token, name: 'Aki' })
    b.send({ k: 'hello', token: b.token, name: 'Bo' })
    await a.wait('welcome'); await b.wait('welcome')
    a.send({ k: 'create', build: { ...BUILD_A, launcher: 'launcher-voltfang' } })
    const room = await a.wait('room')
    b.send({ k: 'join', code: room.code, build: { ...BUILD_B, launcher: 'launcher-<b>' } })
    expect((await b.wait('peer')).build.launcher).toBe('launcher-voltfang')
    expect((await a.wait('peer')).build.launcher).toBeUndefined()
    a.ws.close(); b.ws.close()
  })

  it('a burst of messages is dropped, not kicked; only a flood closes the socket', async () => {
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    for (let i = 0; i < 200; i++) c.send({ k: 'ping', t: i })
    await new Promise(r => setTimeout(r, 300))
    expect(c.msgs.some(m => m.k === 'error')).toBe(false)
    expect(c.closed()).toBeFalsy()
    for (let i = 0; i < 600; i++) c.send({ k: 'ping', t: i })
    expect((await c.wait('error')).code).toBe('rate')
    c.ws.close()
  })

  it('guessing room codes to watch closes the socket after five misses', async () => {
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    for (let i = 0; i < 5; i++) c.send({ k: 'watch', code: `ZZZZ${i}`.slice(-4) })
    for (let i = 0; i < 40 && c.closed() === null; i++) await new Promise(r => setTimeout(r, 25))
    expect(c.closed()).toBe(4000)
  })

  it('a create with unknown parts leaves no room behind', async () => {
    const before = ((await app.inject({ method: 'GET', url: '/healthz' })).json() as { rooms: number }).rooms
    expect(typeof before).toBe('number')
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    for (let i = 0; i < 5; i++) c.send({ k: 'create', build: { bladeId: 'x', discId: 'x', tipId: 'x', beastId: 'voltfang' } })
    expect((await c.wait('error')).code).toBe('bad-message')
    await new Promise(r => setTimeout(r, 100))
    expect(((await app.inject({ method: 'GET', url: '/healthz' })).json() as { rooms: number }).rooms).toBeLessThanOrEqual(before)
    c.ws.close()
  })

  it('a stale socket closing after a rejoin does not drop the player', async () => {
    const { a, b, room } = await pair()
    await b.wait('room')
    const b2 = await client()
    b2.send({ k: 'hello', token: b.token, name: 'Bo' })
    await b2.wait('welcome')
    b2.send({ k: 'rejoin', code: room.code })
    expect((await b2.wait('room')).side).toBe(1)
    await new Promise(r => setTimeout(r, 200))
    expect(b.closed()).not.toBeNull()
    await new Promise(r => setTimeout(r, 1800))
    expect(a.msgs.some(m => m.k === 'left')).toBe(false)
    expect(a.msgs.filter(m => m.k === 'peer').at(-1)).toMatchObject({ online: true })
    a.ws.close(); b2.ws.close()
  })

  it('forged swipes are refused and motion data wins over a swipe', async () => {
    const { a, b } = await pair()
    await a.wait('round'); await b.wait('round')
    a.send({ k: 'rip', round: 1, swipe: { points: [{ t: 0, x: 0, y: 0 }, { t: 120, x: 0, y: 900 }], h: 900 }, pull100: 7 })
    b.send({ k: 'rip', round: 1, swipe: SWIPE, pull100: 7 })
    const st = await a.wait('start')
    expect(st.rips[0]).toMatchObject({ ok: false })
    expect(st.rips[1].ok).toBe(true)
    expect(st.rips[1].rpm).toBeLessThanOrEqual(13500)
    a.ws.close(); b.ws.close()
  })

  it('stadium mode: a spectator screen hosts, two phones join, the screen sees the whole match', async () => {
    const tv = await client()
    tv.send({ k: 'hello', token: tv.token, name: 'Living Room' })
    await tv.wait('welcome')
    tv.send({ k: 'stadium' })
    const { code } = await tv.wait('watching')
    const a = await client(), b = await client()
    for (const [c, n] of [[a, 'Aki'], [b, 'Bo']] as const) { c.send({ k: 'hello', token: c.token, name: n }); await c.wait('welcome') }
    a.send({ k: 'join', code, build: BUILD_A })
    expect((await a.wait('room')).side).toBe(0)
    b.send({ k: 'join', code, build: BUILD_B })
    expect((await b.wait('room')).side).toBe(1)
    let seats = await tv.wait('seats')
    while (seats.seats.filter(Boolean).length < 2) seats = await tv.wait('seats')
    expect(seats.seats.map(x => x?.name)).toEqual(['Aki', 'Bo'])
    const r = await tv.wait('round')
    a.send({ k: 'rip', round: r.round, swipe: SWIPE, pull100: 7 })
    b.send({ k: 'rip', round: r.round, swipe: SWIPE, pull100: 7 })
    expect((await tv.wait('start')).round).toBe(1)
    expect((await tv.waitBin('frames', 8000, m => m.frames.length > 0)).op).toBe('frames')
    expect((await tv.wait('end', 20000)).round).toBe(1)
    a.ws.close(); b.ws.close(); tv.ws.close()
  })

  it('stadium: a phone dropping in the lobby frees its seat; a forfeit tells the screen; the screen can re-watch', async () => {
    const tv = await client()
    tv.send({ k: 'hello', token: tv.token, name: 'TV' })
    await tv.wait('welcome')
    tv.send({ k: 'stadium' })
    const { code } = await tv.wait('watching')
    const a = await client()
    a.send({ k: 'hello', token: a.token, name: 'Aki' }); await a.wait('welcome')
    a.send({ k: 'join', code, build: BUILD_A }); await a.wait('room')
    a.ws.close()
    let seats = await tv.wait('seats')
    for (let i = 0; i < 5 && seats.seats.some(Boolean); i++) seats = await tv.wait('seats', 4000)
    expect(seats.seats.every(x => x === null)).toBe(true)
    const b = await client(), c = await client()
    for (const [x, n] of [[b, 'Bo'], [c, 'Cy']] as const) { x.send({ k: 'hello', token: x.token, name: n }); await x.wait('welcome'); x.send({ k: 'join', code, build: BUILD_B }); await x.wait('room') }
    const tv2 = await client()
    tv2.send({ k: 'hello', token: tv.token, name: 'TV' }); await tv2.wait('welcome')
    tv2.send({ k: 'watch', code })
    expect((await tv2.wait('watching')).code).toBe(code)
    c.send({ k: 'leave' })
    expect((await tv.wait('left', 5000)).reason).toBe('quit')
    expect((await tv2.wait('left', 5000)).winner).toBe(0)
    b.ws.close(); c.ws.close(); tv.ws.close(); tv2.ws.close()
  })

  it('rejects bad tokens and malformed messages', async () => {
    const c = await client()
    c.send({ k: 'hello', token: 'a.b.c', name: 'x' })
    expect((await c.wait('error')).code).toBe('auth')
    const d = await client()
    d.send('{nope')
    expect((await d.wait('error')).code).toBe('bad-message')
    const e = await client()
    e.send({ k: 'create', build: BUILD_A })
    expect((await e.wait('error')).code).toBe('auth')
  })

  it('unknown room code and full rooms are refused without closing', async () => {
    const { a, b, room } = await pair()
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'C' })
    await c.wait('welcome')
    c.send({ k: 'join', code: 'ZZZZ', build: BUILD_A })
    expect((await c.wait('error')).code).toBe('no-room')
    c.send({ k: 'join', code: room.code, build: BUILD_A })
    expect((await c.wait('error')).code).toBe('full')
    expect(c.closed()).toBeNull()
    a.ws.close(); b.ws.close(); c.ws.close()
  })

  it('a dropped player forfeits after the seat hold; rejoining in time keeps the seat', async () => {
    const { a, b, room } = await pair()
    await b.wait('room')
    b.ws.close()
    expect((await a.wait('peer')).online).toBe(true)
    expect((await a.wait('peer')).online).toBe(false)
    const b2 = await client()
    b2.send({ k: 'hello', token: b.token, name: 'Bo' })
    await b2.wait('welcome')
    b2.send({ k: 'rejoin', code: room.code })
    expect((await b2.wait('room')).side).toBe(1)
    b2.ws.close()
    expect((await a.wait('left', 5000)).reason).toBe('forfeit')
    a.ws.close()
  })

  it('binary ping is answered with server time', async () => {
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'P' })
    await c.wait('welcome')
    c.sendBin({ op: 'ping', t: 42.5 })
    const p = await c.waitBin('pong')
    expect(p.t).toBe(42.5)
    expect(Math.abs(p.server - Date.now())).toBeLessThan(2000)
    c.ws.close()
  })

  it('a binary burst is tolerated; a flood beyond 4x the limit closes the socket', async () => {
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'F' })
    await c.wait('welcome')
    for (let i = 0; i < 150; i++) c.sendBin({ op: 'ping', t: i })
    await c.waitBin('pong', 4000, m => m.t === 149)
    expect(c.closed()).toBeNull()
    await new Promise(r => setTimeout(r, 1100))
    for (let i = 0; i < 1000; i++) c.sendBin({ op: 'ping', t: i })
    for (let i = 0; i < 40 && c.closed() === null; i++) await new Promise(r => setTimeout(r, 50))
    expect(c.closed()).toBe(4000)
  })

  it('garbage binary is ignored without closing', async () => {
    const c = await client()
    c.send({ k: 'hello', token: c.token, name: 'G' })
    await c.wait('welcome')
    c.ws.send(new Uint8Array([9, 9, 9]))
    c.ws.send(new Uint8Array([1, 0]))
    c.sendBin({ op: 'ping', t: 1 })
    expect((await c.waitBin('pong')).t).toBe(1)
    expect(c.closed()).toBeNull()
    c.ws.close()
  })

  it('rejoin mid-battle gets start + catchup, and frames continue right after the catchup frame', async () => {
    const { a, b, room } = await pair()
    const r = await a.wait('round')
    a.send({ k: 'rip', round: r.round, swipe: SWIPE, pull100: 7 })
    b.send({ k: 'rip', round: r.round, swipe: SWIPE, pull100: 7 })
    await a.wait('start')
    await a.waitBin('frames', 8000, m => m.frames.length > 0)
    a.ws.close()
    const a2 = await client()
    a2.send({ k: 'hello', token: a.token, name: 'Aki' })
    await a2.wait('welcome')
    a2.send({ k: 'rejoin', code: room.code })
    await a2.wait('start')
    const c = await a2.wait('catchup')
    const f = await a2.waitBin('frames', 8000)
    expect(f.first).toBe(c.tl.frame + 1)
    a2.ws.close(); b.ws.close()
  })
})
