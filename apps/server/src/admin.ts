import { createHmac, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (p: string, s: string, n: number) => Promise<Buffer>
const FAILS_PER_MINUTE = 20
import { desc, eq, gte, ilike, isNotNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { adminLog, entitlements, ipBans, liveMatches, playerIps, players, type Db } from './db'
import type { Notifier } from './discord'
import { clientIp } from './clientip'
import { plainIp, type Moderation } from './moderation'
import type { NetLog } from './rt/netlog'
import type { Room } from './rt/room'

const TOKEN_MS = 12 * 3600_000

export function hashAdminPassword(password: string, salt: string): string {
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}

async function passwordOk(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hex] = stored.split(':')
  if (kind !== 'scrypt' || !salt || !hex) return false
  const want = Buffer.from(hex, 'hex')
  const got = await scryptAsync(password, salt, want.length)
  return got.length === want.length && timingSafeEqual(got, want)
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')

function sign(key: Buffer, user: string): string {
  const body = b64(JSON.stringify({ u: user, exp: Date.now() + TOKEN_MS }))
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}

function verify(key: Buffer, token: string): string | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const want = createHmac('sha256', key).update(body).digest()
  const got = Buffer.from(mac, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u?: string; exp?: number }
    return p.u && p.exp && p.exp > Date.now() ? p.u : null
  } catch {
    return null
  }
}

interface SaveLike { coins?: number; shards?: number; xp?: number; tower?: number; beasts?: Record<string, { awakened?: string | null; trust?: number; battles?: number }>; owned?: { blades?: string[]; discs?: string[]; tips?: string[] }; history?: unknown[] }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function summary(raw: unknown) {
  const save = obj(raw)
  const owned = obj(save.owned)
  return {
    coins: num(save.coins),
    shards: num(save.shards),
    xp: num(save.xp),
    tower: num(save.tower),
    beasts: Object.entries(obj(save.beasts)).map(([id, v]) => {
      const b = obj(v)
      return { id, awakened: typeof b.awakened === 'string' ? b.awakened : null, trust: num(b.trust), battles: num(b.battles) }
    }),
    parts: { blades: arr(owned.blades).length, discs: arr(owned.discs).length, tips: arr(owned.tips).length },
    history: arr(save.history).filter(h => h && typeof h === 'object').slice(0, 50),
  }
}

export interface AdminDeps { db: Db; mod: Moderation; notify: Notifier; rooms: Map<string, Room>; netlog: NetLog; admin: { user: string; passwordHash: string } | null; secret: string }

export function registerAdmin(appBase: FastifyInstance, d: AdminDeps): void {
  const app = appBase.withTypeProvider<ZodTypeProvider>()
  const key = createHmac('sha256', d.secret).update(`spirit-admin:${d.admin?.passwordHash ?? ''}`).digest()
  let fails = { at: Date.now(), n: 0 }
  const { db } = d

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization
    const user = d.admin && h?.startsWith('Admin ') ? verify(key, h.slice(6)) : null
    if (!user || user !== d.admin?.user) return reply.code(401).send({ error: 'unauthorized' })
    ;(req as FastifyRequest & { admin?: string }).admin = user
  }
  const who = (req: FastifyRequest) => (req as FastifyRequest & { admin?: string }).admin ?? '?'
  const audit = async (req: FastifyRequest, action: string, target: string | null, detail: Record<string, unknown> | null, text: string) => {
    await db.insert(adminLog).values({ action, target, detail: { ...detail, by: who(req) } })
    d.notify.say(`🛡️ ${text} (by ${who(req)})`)
  }
  const playerLabel = async (id: string) => {
    const [p] = await db.select({ username: players.username, name: players.name, code: players.friendCode }).from(players).where(eq(players.id, id)).limit(1)
    return p ? `${p.username ? `@${p.username}` : p.name} (${p.code ?? id.slice(0, 8)})` : id
  }

  app.post('/v1/admin/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, schema: { body: z.object({ user: z.string().max(80), password: z.string().max(200) }) } }, async (req, reply) => {
    if (!d.admin) return reply.code(404).send({ error: 'admin disabled' })
    if (Date.now() - fails.at > 60_000) fails = { at: Date.now(), n: 0 }
    if (fails.n >= FAILS_PER_MINUTE) return reply.code(429).send({ error: 'too many attempts, wait a minute' })
    const userOk = req.body.user.length === d.admin.user.length && timingSafeEqual(Buffer.from(req.body.user), Buffer.from(d.admin.user))
    if (!((await passwordOk(req.body.password, d.admin.passwordHash)) && userOk)) {
      fails.n++
      req.log.warn({ ip: clientIp(req) }, 'admin.login-failed')
      return reply.code(401).send({ error: 'wrong username or password' })
    }
    return { token: sign(key, d.admin.user), expiresIn: TOKEN_MS }
  })

  app.get('/v1/admin/stats', { preHandler: requireAdmin }, async () => {
    const day = new Date(Date.now() - 86400_000), week = new Date(Date.now() - 7 * 86400_000)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const count = async (where?: ReturnType<typeof sql>) => Number((await db.select({ n: sql<number>`count(*)` }).from(players).where(where)).at(0)?.n ?? 0)
    const [total, named, newDay, activeDay, activeWeek, banned] = await Promise.all([
      count(), count(sql`${players.username} IS NOT NULL`), count(gte(players.createdAt, day)), count(gte(players.lastSeenAt, day)), count(gte(players.lastSeenAt, week)), count(isNotNull(players.bannedAt)),
    ])
    const matchesToday = Number((await db.select({ n: sql<number>`count(*)` }).from(liveMatches).where(gte(liveMatches.endedAt, today))).at(0)?.n ?? 0)
    const matchesTotal = Number((await db.select({ n: sql<number>`count(*)` }).from(liveMatches)).at(0)?.n ?? 0)
    const countries = await db.select({ country: players.lastCountry, n: sql<number>`count(*)` }).from(players).where(isNotNull(players.lastCountry)).groupBy(players.lastCountry).orderBy(desc(sql`count(*)`)).limit(8)
    const rooms = [...d.rooms.values()]
    return {
      players: { total, named, newDay, activeDay, activeWeek, banned },
      live: { rooms: rooms.length, playing: rooms.filter(r => r.round > 0 && r.phase !== 'done').length, seated: rooms.reduce((n, r) => n + r.seats.filter(Boolean).length, 0) },
      matches: { today: matchesToday, total: matchesTotal },
      countries: countries.map(c => ({ country: c.country, n: Number(c.n) })),
      net: d.netlog.summary().counts,
      ipBans: Number((await db.select({ n: sql<number>`count(*)` }).from(ipBans)).at(0)?.n ?? 0),
    }
  })

  app.get('/v1/admin/players', { preHandler: requireAdmin, schema: { querystring: z.object({ q: z.string().max(80).optional(), filter: z.enum(['all', 'banned', 'named']).optional() }) } }, async req => {
    const q = (req.query.q ?? '').trim().replace(/^@/, '')
    const isUuid = /^[0-9a-f-]{36}$/i.test(q)
    const where = q
      ? or(ilike(players.username, `%${q}%`), ilike(players.name, `%${q}%`), eq(players.friendCode, q.toUpperCase()), eq(players.lastIp, q), ...(isUuid ? [eq(players.id, q)] : []))
      : req.query.filter === 'banned' ? isNotNull(players.bannedAt) : req.query.filter === 'named' ? sql`${players.username} IS NOT NULL` : undefined
    const rows = await db
      .select({ id: players.id, name: players.name, username: players.username, friendCode: players.friendCode, lastIp: players.lastIp, country: players.lastCountry, city: players.lastCity, lastSeenAt: players.lastSeenAt, createdAt: players.createdAt, bannedAt: players.bannedAt, banReason: players.banReason })
      .from(players)
      .where(where)
      .orderBy(desc(sql`coalesce(${players.lastSeenAt}, ${players.createdAt})`))
      .limit(100)
    return { players: rows }
  })

  app.get('/v1/admin/players/:id', { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req, reply) => {
    const [p] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1)
    if (!p) return reply.code(404).send({ error: 'no such player' })
    const [ips, matches, ents] = await Promise.all([
      db.select().from(playerIps).where(eq(playerIps.playerId, p.id)).orderBy(desc(playerIps.lastSeen)).limit(20),
      db.select().from(liveMatches).where(sql`${liveMatches.aId} = ${p.id} OR ${liveMatches.bId} = ${p.id}`).orderBy(desc(liveMatches.endedAt)).limit(50),
      db.select({ item: entitlements.item, source: entitlements.source, at: entitlements.createdAt }).from(entitlements).where(eq(entitlements.playerId, p.id)),
    ])
    const sharedIp = p.lastIp ? Number((await db.select({ n: sql<number>`count(distinct ${playerIps.playerId})` }).from(playerIps).where(eq(playerIps.ip, p.lastIp))).at(0)?.n ?? 0) : 0
    return {
      player: { id: p.id, name: p.name, username: p.username, friendCode: p.friendCode, createdAt: p.createdAt, lastSeenAt: p.lastSeenAt, lastIp: p.lastIp, country: p.lastCountry, city: p.lastCity, bannedAt: p.bannedAt, banReason: p.banReason, saveVersion: p.saveVersion, ipBanned: p.lastIp ? !!d.mod.ipBan(p.lastIp) : false, playersOnLastIp: sharedIp },
      save: summary(p.save),
      ips,
      matches: matches.map(m => ({ id: m.id, at: m.endedAt, code: m.code, a: m.aName, b: m.bName, aBeast: m.aBeast, bBeast: m.bBeast, scores: m.scores, winner: m.winner, side: m.aId === p.id ? 0 : 1 })),
      entitlements: ents,
    }
  })

  const Reason = z.object({ reason: z.string().trim().min(1).max(200) })
  app.post('/v1/admin/players/:id/ban', { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }), body: Reason } }, async req => {
    await d.mod.setPlayerBan(req.params.id, req.body.reason)
    await audit(req, 'ban', req.params.id, { reason: req.body.reason }, `Banned ${await playerLabel(req.params.id)}: ${req.body.reason}`)
    return { ok: true }
  })
  app.post('/v1/admin/players/:id/unban', { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }) } }, async req => {
    await d.mod.setPlayerBan(req.params.id, null)
    await audit(req, 'unban', req.params.id, null, `Unbanned ${await playerLabel(req.params.id)}`)
    return { ok: true }
  })
  app.post('/v1/admin/players/:id/grant', { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ coins: z.number().int().min(0).max(1_000_000).default(0), shards: z.number().int().min(0).max(100_000).default(0) }) } }, async (req, reply) => {
    const { coins, shards } = req.body
    if (!coins && !shards) return reply.code(400).send({ error: 'nothing to grant' })
    const [p] = await db.select({ save: players.save, v: players.saveVersion }).from(players).where(eq(players.id, req.params.id)).limit(1)
    if (!p) return reply.code(404).send({ error: 'no such player' })
    const s = p.save as SaveLike & Record<string, unknown>
    const next = { ...s, coins: (s.coins ?? 0) + coins, shards: (s.shards ?? 0) + shards, xp: (s.xp ?? 0) + 1 }
    await db.update(players).set({ save: next, saveVersion: p.v + 1, updatedAt: new Date() }).where(eq(players.id, req.params.id))
    await audit(req, 'grant', req.params.id, { coins, shards }, `Granted ${coins ? `${coins} coins ` : ''}${shards ? `${shards} shards ` : ''}to ${await playerLabel(req.params.id)}`)
    return { ok: true, coins: next.coins, shards: next.shards }
  })
  app.post('/v1/admin/players/:id/reset-username', { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }) } }, async req => {
    const label = await playerLabel(req.params.id)
    await db.update(players).set({ username: null, name: 'Spinner', updatedAt: new Date() }).where(eq(players.id, req.params.id))
    await audit(req, 'reset-username', req.params.id, null, `Reset username of ${label}`)
    return { ok: true }
  })

  app.get('/v1/admin/bans', { preHandler: requireAdmin }, async () => {
    const [ps, ips] = await Promise.all([
      db.select({ id: players.id, username: players.username, name: players.name, friendCode: players.friendCode, bannedAt: players.bannedAt, banReason: players.banReason, lastIp: players.lastIp }).from(players).where(isNotNull(players.bannedAt)).orderBy(desc(players.bannedAt)),
      db.select().from(ipBans).orderBy(desc(ipBans.createdAt)),
    ])
    return { players: ps, ips }
  })
  app.post('/v1/admin/ip-bans', { preHandler: requireAdmin, schema: { body: z.object({ ip: z.string().trim().min(3).max(64), reason: z.string().trim().min(1).max(200) }) } }, async (req, reply) => {
    const ip = plainIp(req.body.ip)
    if (!/^[0-9a-f.:]+$/i.test(ip)) return reply.code(400).send({ error: 'not an IP address' })
    await d.mod.setIpBan(ip, req.body.reason)
    const affected = Number((await db.select({ n: sql<number>`count(distinct ${playerIps.playerId})` }).from(playerIps).where(eq(playerIps.ip, ip))).at(0)?.n ?? 0)
    await audit(req, 'ip-ban', ip, { reason: req.body.reason, affected }, `Banned IP ${ip} (${affected} player${affected === 1 ? '' : 's'} seen on it): ${req.body.reason}`)
    return { ok: true, affected }
  })
  app.delete('/v1/admin/ip-bans/:ip', { preHandler: requireAdmin, schema: { params: z.object({ ip: z.string().max(64) }) } }, async req => {
    await d.mod.setIpBan(req.params.ip, null)
    await audit(req, 'ip-unban', req.params.ip, null, `Unbanned IP ${req.params.ip}`)
    return { ok: true }
  })

  app.get('/v1/admin/live', { preHandler: requireAdmin }, async () => {
    const rooms = [...d.rooms.values()].map(r => ({ code: r.code, phase: r.phase, round: r.round, scores: r.match.scores, startedAt: r.startedAt, seats: r.seats.map(s => (s ? { name: s.name, beast: s.build.beastId ?? null, online: s.online } : null)) }))
    const recent = await db.select().from(liveMatches).orderBy(desc(liveMatches.endedAt)).limit(50)
    return { rooms, recent: recent.map(m => ({ id: m.id, at: m.endedAt, startedAt: m.startedAt, code: m.code, a: m.aName, b: m.bName, aId: m.aId, bId: m.bId, aBeast: m.aBeast, bBeast: m.bBeast, scores: m.scores, winner: m.winner })) }
  })

  app.get('/v1/admin/log', { preHandler: requireAdmin }, async () => ({ log: await db.select().from(adminLog).orderBy(desc(adminLog.at)).limit(100) }))
}
