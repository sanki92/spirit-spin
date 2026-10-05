import websocket from '@fastify/websocket'
import { assembleTop, COSMETICS, decode, encode, NET, type ServerMsg, type Side } from '@spirit/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { cleanName, randomCode, type Tokens } from '../auth'
import { clientIp } from '../clientip'
import type { EdgeApi } from './edge'
import type { NetLog } from './netlog'
import { Room } from './room'

const num = z.number().finite()
const LAUNCHERS = new Set(Object.values(COSMETICS).filter(c => c.kind === 'launcher').map(c => c.id))
const Build = z.object({ bladeId: z.string().max(20), discId: z.string().max(20), tipId: z.string().max(20), beastId: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']), launcher: z.string().max(40).optional() })
  .transform(({ launcher, ...b }) => (launcher && LAUNCHERS.has(launcher) ? { ...b, launcher } : b))
const Code = z.string().regex(/^[A-Za-z0-9]{4}$/).transform(s => s.toUpperCase())
const Sample = z.object({ t: num, ax: num, ay: num, az: num, gx: num, gy: num, gz: num, roll: num })
const Msg = z.discriminatedUnion('k', [
  z.object({ k: z.literal('hello'), token: z.string().max(2000), name: z.string().max(40) }),
  z.object({ k: z.literal('create'), build: Build }),
  z.object({ k: z.literal('join'), code: Code, build: Build }),
  z.object({ k: z.literal('rejoin'), code: Code }),
  z.object({ k: z.literal('rip'), round: z.number().int().min(1).max(100), motion: z.array(Sample).max(260).optional(), swipe: z.object({ points: z.array(z.object({ t: num, x: num, y: num })).max(200), h: num }).optional(), pull100: num, rtt: z.number().min(0).max(10_000).optional() }),
  z.object({ k: z.literal('ping'), t: num }),
  z.object({ k: z.literal('leave') }),
  z.object({ k: z.literal('ready') }),
  z.object({ k: z.literal('stadium') }),
  z.object({ k: z.literal('watch'), code: Code }),
])


const MAX_SOCKETS_PER_PLAYER = 4
const MAX_SOCKETS_PER_IP = 200
const IDLE_ROOM_MS = 10 * 60_000

export interface RealtimeOpts { seatHoldMs?: number; onResult?: (room: Room) => void; onStart?: (room: Room) => void; banned?: (playerId: string, ip: string) => string | null; session?: (token: string) => Promise<{ id: string; check: 'ok' | 'signed-out' | 'expired' | 'unknown' } | null>; onKick?: (fn: (playerId: string) => void) => void; nameOf?: (playerId: string) => Promise<string | null>; speed?: number; edge?: EdgeApi | null; netlog?: NetLog; closeEdge?: () => void }

export async function registerRealtime(app: FastifyInstance, tokens: Tokens, opts: RealtimeOpts = {}) {
  await app.register(websocket, { options: { maxPayload: NET.maxMessageBytes } })
  const rooms = new Map<string, Room>()
  const newCode = () => {
    for (let i = 0; i < 100; i++) {
      const c = randomCode(4)
      if (!rooms.has(c)) return c
    }
    return null
  }
  const make = () => {
    const code = rooms.size < NET.maxRooms ? newCode() : null
    return code ? new Room(code, { seatHoldMs: opts.seatHoldMs ?? NET.seatHoldMs, now: Date.now, onDone: r => { rooms.delete(r.code); for (const [k, v] of owned) if (v === r) owned.delete(k) }, speed: opts.speed ?? 1, log: o => { app.log.info(o); opts.netlog?.add(o) }, edge: opts.edge ?? null, ...(opts.onResult ? { onResult: opts.onResult } : {}), ...(opts.onStart ? { onStart: opts.onStart } : {}) }) : null
  }
  app.addHook('onClose', async () => {
    await Promise.all([...rooms.values()].map(r => r.close()))
    opts.closeEdge?.()
  })
  const owned = new Map<string, Room>()
  const sockets = new Map<string, Set<() => void>>()
  const perIp = new Map<string, number>()
  const stadiums = new Map<string, Room>()
  const born = new Map<Room, number>()
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const r of rooms.values()) {
      if (!born.has(r)) born.set(r, now)
      if (r.seats.every(s => !s) && now - born.get(r)! > IDLE_ROOM_MS) void r.close()
    }
    for (const r of born.keys()) if (![...rooms.values()].includes(r)) born.delete(r)
  }, 60_000)
  sweep.unref?.()
  app.addHook('onClose', async () => clearInterval(sweep))
  opts.onKick?.(pid => {
    for (const k of sockets.get(pid) ?? []) k()
    sockets.delete(pid)
  })

  app.get('/rt', { websocket: true }, (socket, req) => {
    let playerId: string | null = null
    let name = 'Spinner'
    let room: Room | null = null
    let side: Side | null = null
    let watching: Room | null = null
    let misses = 0

    const ip = clientIp(req)
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1)
    if (perIp.get(ip)! > MAX_SOCKETS_PER_IP) {
      socket.close(4002, 'rate')
    }
    let windowStart = Date.now(), count = 0
    const send = (m: ServerMsg) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m)) }
    const replaced = () => socket.close(4001, 'replaced')
    let alive = true
    socket.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate()
      alive = false
      socket.ping()
    }, NET.heartbeatMs)
    const fail = (code: Extract<ServerMsg, { k: 'error' }>['code'], close = true) => {
      send({ k: 'error', code })
      if (close) socket.close(4000, code)
    }
    const kick = () => fail('signed-out')
    const enter = (r: Room, build: Parameters<Room['seat']>[2]) => {
      const s = r.seat(playerId!, name, build, send, replaced, bin)
      if (s === null) return fail('full', false)
      if (!rooms.has(r.code)) rooms.set(r.code, r)
      room = r
      side = s
    }

    const bin = (b: Uint8Array) => { if (socket.readyState === socket.OPEN) socket.send(b) }
    let binStart = Date.now(), binCount = 0
    const onBinary = (raw: Buffer) => {
      const now = Date.now()
      if (now - binStart > 1000) { binStart = now; binCount = 0 }
      if (++binCount > NET.maxBinPerSec) {
        if (binCount > NET.maxBinPerSec * 4) fail('rate')
        return
      }
      if (!playerId) return
      const m = decode(raw)
      if (!m) return
      if (m.op === 'ping') return bin(encode({ op: 'pong', t: m.t, server: Date.now() }))
      if (room && side !== null) room.onWire(side, m)
    }

    socket.on('message', async (raw: Buffer, isBinary: boolean) => {
      if (isBinary) return onBinary(raw)
      const now = Date.now()
      if (now - windowStart > 1000) { windowStart = now; count = 0 }
      if (++count > NET.maxMsgsPerSec) {
        if (count > NET.maxMsgsPerSec * 4) return fail('rate')
        return
      }
      let parsed: z.infer<typeof Msg>
      try {
        const r = Msg.safeParse(JSON.parse(String(raw)))
        if (!r.success) return fail('bad-message')
        parsed = r.data
      } catch {
        return fail('bad-message')
      }
      const m = parsed
      if (m.k === 'ping') return send({ k: 'pong', t: m.t, server: Date.now() })
      if (m.k === 'hello') {
        let id: string | null
        if (opts.session) {
          const s = await opts.session(m.token)
          if (s?.check === 'signed-out') return fail('signed-out')
          id = s?.check === 'ok' ? s.id : null
        } else id = await tokens.verify(m.token)
        if (!id) return fail('auth')
        if (opts.banned?.(id, ip)) return fail('banned')
        if ((sockets.get(id)?.size ?? 0) >= MAX_SOCKETS_PER_PLAYER) return fail('rate')
        playerId = id
        if (!sockets.has(id)) sockets.set(id, new Set())
        sockets.get(id)!.add(kick)
        name = (await opts.nameOf?.(id).catch(() => null)) || cleanName(m.name)
        return send({ k: 'welcome', playerId: id })
      }
      if (!playerId) return fail('auth')
      if (room?.phase === 'done') { room = null; side = null }
      try {
        if (m.k === 'stadium') {
          if (watching) watching.unwatch(send)
          const prev = stadiums.get(playerId)
          if (prev && prev !== watching) void prev.close()
          const r = make()
          if (!r) return fail('rate', false)
          rooms.set(r.code, r)
          stadiums.set(playerId, r)
          r.watch(send, bin)
          watching = r
          return
        }
        if (m.k === 'watch') {
          const r = rooms.get(m.code)
          if (!r) return fail('no-room', ++misses >= 5)
          if (watching && watching !== r) watching.unwatch(send)
          if (!r.watch(send, bin)) return fail('full', false)
          watching = r
          return
        }
        if (m.k === 'create' || m.k === 'join') assembleTop(m.build)
        if ((m.k === 'create' || m.k === 'join') && room && side !== null && room.code !== (m.k === 'join' ? m.code : '')) {
          room.forfeit(side, 'quit')
          room = null
          side = null
        }
        if (m.k === 'create') {
          const prev = owned.get(playerId)
          if (prev && prev !== room && prev.phase !== 'done') {
            const ps = prev.seats.findIndex(x => x?.playerId === playerId)
            if (ps >= 0) prev.forfeit(ps as Side, 'quit')
          }
          const r = make()
          if (!r) return fail('rate', false)
          enter(r, m.build)
          owned.set(playerId, r)
        } else if (m.k === 'join' || m.k === 'rejoin') {
          const r = rooms.get(m.code)
          if (!r) return fail('no-room', ++misses >= 5)
          const build = m.k === 'join' ? m.build : r.seats.find(s => s?.playerId === playerId)?.build
          if (!build) return fail('no-room', false)
          enter(r, build)
        } else if (room && side !== null) {
          if (m.k === 'rip') room.onRip(side, m)
          else if (m.k === 'ready') room.onReady(side)
          else if (m.k === 'leave') { room.forfeit(side, 'quit'); room = null; side = null }
        } else if (m.k === 'leave' && watching) {
          watching.unwatch(send)
          watching = null
        }
      } catch (e) {
        req.log.warn({ err: String(e) }, 'rt message rejected')
        fail('bad-message', false)
      }
    })
    socket.on('close', () => {
      clearInterval(heartbeat)
      const left = (perIp.get(ip) ?? 1) - 1
      if (left > 0) perIp.set(ip, left)
      else perIp.delete(ip)
      if (playerId) sockets.get(playerId)?.delete(kick)

      if (room && side !== null) room.disconnect(side, send)
      watching?.unwatch(send)
    })
  })

  return rooms
}
