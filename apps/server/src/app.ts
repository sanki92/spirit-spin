import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import rateLimit from '@fastify/rate-limit'
import { and, eq } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { cleanName, hashRecoveryCode, newRecoveryCode, randomCode, Tokens } from './auth'
import type { Config } from './config'
import { openDb, players, aiCalls, entitlements, friendships, type Db } from './db'
import { PASS_TIERS, SKUS } from '@spirit/core'
import { directSpirit, moderate, type DirectorResult } from './spirit/director'
import type { MomentInput } from './spirit/prompt'
import { EdgeClient } from './rt/edge'
import { registerRealtime, type RealtimeOpts } from './rt/socket'
import { recordGhostHistory, registerLeague } from './league'
import { registerTournaments } from './tournaments'
import { registerStore, type Payments } from './store'
import { desc, gte, inArray, sql } from 'drizzle-orm'

const SaveBody = z.object({
  baseVersion: z.number().int().min(0),
  save: z
    .object({
      coins: z.number().int().min(0).max(10_000_000),
      xp: z.number().int().min(0).max(100_000_000),
      tower: z.number().int().min(0).max(50),
    })
    .passthrough(),
})

declare module 'fastify' {
  interface FastifyRequest { playerId: string }
}

export type App = Awaited<ReturnType<typeof buildApp>>

export interface Deps { director?: (m: MomentInput, model: string) => Promise<DirectorResult>; moderator?: (text: string) => Promise<boolean>; perPlayerDaily?: number; realtime?: RealtimeOpts; devShutdown?: () => void; guestPerMinute?: number; payments?: Payments }

const Trait = z.number().int().min(-10).max(10)
const MomentBody = z.object({
  kind: z.enum(['post', 'reply', 'greet', 'awaken']),
  beast: z.object({
    id: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']),
    trust: z.number().int().min(0).max(100), respect: z.number().int().min(0).max(100),
    courage: Trait, pride: Trait, curiosity: Trait, calm: Trait,
    battles: z.number().int().min(0).max(1_000_000), awakened: z.string().max(20).nullable(),
    memories: z.array(z.object({ text: z.string().max(120), importance: z.number().int().min(1).max(5) })).max(50),
  }),
  battle: z.object({
    won: z.boolean(), comeback: z.boolean(), finishes: z.array(z.enum(['spin', 'ringout', 'shatter', 'spirit', 'draw'])).max(20),
    perfectRips: z.number().int().min(0).max(20), overspins: z.number().int().min(0).max(20), spiritCalls: z.number().int().min(0).max(20),
    aggression: z.number().min(0).max(1), boss: z.enum(['kaze', 'mira', 'brick', 'vex', 'ren']).nullable(), opponent: z.string().min(1).max(40),
  }).nullable(),
  reply: z.enum(['celebrate', 'humble', 'push', 'comfort', 'analyze', 'fireup']).nullable(),
})

export const AI = { primary: 'gpt-4.1-nano', fallback: 'gpt-4o-mini', perPlayerDaily: 30, globalDailyUsd: 3 }

export async function buildApp(cfg: Config, deps: Deps = {}) {
  const app = Fastify({ logger: cfg.logLevel === 'silent' ? false : { level: cfg.logLevel }, bodyLimit: 256 * 1024, trustProxy: cfg.trustProxy ?? 'loopback' }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  const { db, close } = await openDb(cfg.databaseUrl)
  const tokens = new Tokens(cfg.jwtSecret)
  const pepper = cfg.recoveryPepper ?? cfg.jwtSecret
  app.setErrorHandler((err: { statusCode?: number; message?: string; validation?: unknown }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    if (status >= 500) {
      req.log.error({ err: String(err.message ?? err) }, 'request failed')
      return reply.code(status).send({ error: 'internal error' })
    }
    return reply.code(status).send({ error: err.validation ? 'invalid request' : err.message ?? 'bad request' })
  })
  app.addHook('onClose', close)
  await app.register(cors, { origin: cfg.corsOrigins.includes('*') ? true : cfg.corsOrigins })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  const edge = deps.realtime?.edge ?? (cfg.edge ? new EdgeClient(cfg.edge) : null)
  if (edge instanceof EdgeClient && !deps.realtime?.edge) app.addHook('onClose', async () => edge.close())
  const rooms = await registerRealtime(app, tokens, {
    ...deps.realtime,
    edge,
    onResult: room => {
      const [a, b] = room.seats
      if (!a || !b || a.playerId === b.playerId) return
      const work = [a, b].map(s => recordGhostHistory(db, s.playerId, s.ripLog, s.tiltN ? s.tiltSum / s.tiltN : null))
      void Promise.all(work).catch(e => app.log.warn({ err: String(e) }, 'live result bookkeeping failed'))
    },
  })

  const lastSeen = new Map<string, number>()
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization
    const id = h?.startsWith('Bearer ') ? await tokens.verify(h.slice(7)) : null
    if (!id) return reply.code(401).send({ error: 'unauthorized' })
    req.playerId = id
    lastSeen.set(id, Date.now())
  }

  if (cfg.staticDir && existsSync(cfg.staticDir)) {
    const root = resolve(cfg.staticDir)
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      setHeaders: (res, path) => {
        if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(path)) res.header('cache-control', 'public, max-age=31536000, immutable')
        else if (/\.webp$/.test(path)) res.header('cache-control', 'public, max-age=31536000, immutable')
        else if (/\.(png|mp3|woff2?)$/.test(path)) res.header('cache-control', 'public, max-age=604800')
        else res.header('cache-control', 'no-cache')
      },
    })
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/v1') && !req.url.startsWith('/rt') && !req.url.includes('.')) return reply.header('cache-control', 'no-cache').sendFile('index.html', root)
      return reply.code(404).send({ error: 'not found' })
    })
  }

  app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString(), rooms: rooms.size }))
  const devShutdown = deps.devShutdown
  if (devShutdown) {
    app.post('/__dev/shutdown', async (req, reply) => {
      if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return reply.code(404).send()
      devShutdown()
      return { ok: true }
    })
  }

  app.post('/v1/auth/guest', { config: { rateLimit: { max: deps.guestPerMinute ?? 60, timeWindow: '1 minute' } } }, async () => {
    const code = newRecoveryCode()
    const [row] = await db.insert(players).values({ recoveryHash: hashRecoveryCode(code, pepper), friendCode: randomCode(6) }).returning({ id: players.id })
    return { playerId: row!.id, token: await tokens.sign(row!.id), recoveryCode: code }
  })

  app.post(
    '/v1/auth/recover',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: z.object({ code: z.string().min(12).max(20) }) } },
    async (req, reply) => {
      const [row] = await db.select({ id: players.id }).from(players).where(eq(players.recoveryHash, hashRecoveryCode(req.body.code, pepper))).limit(1)
      if (!row) return reply.code(404).send({ error: 'unknown recovery code' })
      return { playerId: row.id, token: await tokens.sign(row.id) }
    },
  )

  app.get('/v1/me', { preHandler: requireAuth }, async (req, reply) => {
    const [row] = await db.select().from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!row) return reply.code(401).send({ error: 'unknown player' })
    return { playerId: row.id, name: row.name, friendCode: row.friendCode ?? (await assignFriendCode(db, row.id)), version: row.saveVersion, save: await sanitizeSave(db, row.id, row.save), token: await tokens.sign(row.id) }
  })

  const cups = registerTournaments(app, db, requireAuth)
  registerStore(app, db, requireAuth, deps.payments ?? cfg.payments ?? { provider: 'none' })
  registerLeague(app, db, requireAuth, cups.onVerified)

  const CHALLENGE_MS = 120_000
  const challenges = new Map<string, Map<string, { code: string; at: number }>>()
  const mutual = async (a: string, b: string) => {
    const rows = await db.select({ p: friendships.playerId }).from(friendships).where(sql`(${friendships.playerId} = ${a} AND ${friendships.friendId} = ${b}) OR (${friendships.playerId} = ${b} AND ${friendships.friendId} = ${a})`)
    return rows.length === 2
  }

  app.get('/v1/friends', { preHandler: requireAuth }, async req => {
    const mine = await db.select({ id: friendships.friendId, at: friendships.createdAt }).from(friendships).where(eq(friendships.playerId, req.playerId)).limit(300)
    const theirs = await db.select({ id: friendships.playerId }).from(friendships).where(eq(friendships.friendId, req.playerId)).limit(300)
    const back = new Set(theirs.map(t => t.id))
    const ids = [...new Set([...mine.map(m => m.id), ...theirs.map(t => t.id)])]
    const rows = ids.length ? await db.select({ playerId: players.id, name: players.name, friendCode: players.friendCode, beast: sql<string | null>`coalesce(${players.save}->'loadout'->>'beastId', ${players.save}->>'starter')` }).from(players).where(inArray(players.id, ids)) : []
    const at = Date.now()
    const people = rows.map(p => ({ ...p, seen: lastSeen.has(p.playerId) ? at - lastSeen.get(p.playerId)! : null }))
    const byId = new Map(people.map(p => [p.playerId, p]))
    const mineIds = new Set(mine.map(m => m.id))
    const now = Date.now(), inbox = challenges.get(req.playerId)
    for (const [from, c] of inbox ?? []) if (now - c.at > CHALLENGE_MS || !mineIds.has(from) || !back.has(from)) inbox!.delete(from)
    return {
      challenges: [...(inbox ?? [])].map(([from, c]) => ({ from: { playerId: from, name: byId.get(from)?.name ?? 'A friend' }, code: c.code, at: c.at })),
      friends: mine.filter(m => back.has(m.id)).map(m => byId.get(m.id)).filter(Boolean),
      outgoing: mine.filter(m => !back.has(m.id)).map(m => byId.get(m.id)).filter(Boolean),
      incoming: theirs.filter(t => !mineIds.has(t.id)).map(t => byId.get(t.id)).filter(Boolean),
    }
  })

  app.post('/v1/friends', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { body: z.object({ code: z.string().regex(/^[A-Za-z0-9]{6}$/) }) } }, async (req, reply) => {
    const [friend] = await db.select({ id: players.id }).from(players).where(eq(players.friendCode, req.body.code.toUpperCase())).limit(1)
    if (!friend) return reply.code(404).send({ error: 'unknown code' })
    if (friend.id === req.playerId) return reply.code(400).send({ error: 'own code' })
    await db.insert(friendships).values({ playerId: req.playerId, friendId: friend.id }).onConflictDoNothing()
    return { ok: true }
  })

  app.post('/v1/challenges', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { body: z.object({ to: z.string().uuid(), code: z.string().regex(/^[A-Za-z0-9]{4}$/) }) } }, async (req, reply) => {
    if (!(await mutual(req.playerId, req.body.to))) return reply.code(403).send({ error: 'not friends' })
    const inbox = challenges.get(req.body.to) ?? new Map<string, { code: string; at: number }>()
    inbox.set(req.playerId, { code: req.body.code.toUpperCase(), at: Date.now() })
    challenges.set(req.body.to, inbox)
    return { ok: true }
  })

  app.post('/v1/challenges/decline', { preHandler: requireAuth, schema: { body: z.object({ from: z.string().uuid() }) } }, async req => {
    challenges.get(req.playerId)?.delete(req.body.from)
    return { ok: true }
  })

  app.delete('/v1/friends/:id', { preHandler: requireAuth, schema: { params: z.object({ id: z.string().uuid() }) } }, async req => {
    const other = req.params.id
    await db.delete(friendships).where(sql`(${friendships.playerId} = ${req.playerId} AND ${friendships.friendId} = ${other}) OR (${friendships.playerId} = ${other} AND ${friendships.friendId} = ${req.playerId})`)
    challenges.get(req.playerId)?.delete(other)
    challenges.get(other)?.delete(req.playerId)
    return { ok: true }
  })

  app.put('/v1/save', { preHandler: requireAuth, schema: { body: SaveBody } }, async (req, reply) => {
    const { baseVersion } = req.body
    const save = await sanitizeSave(db, req.playerId, req.body.save)
    const updated = await db
      .update(players)
      .set({ save, name: cleanName(save.name), saveVersion: baseVersion + 1, updatedAt: new Date() })
      .where(and(eq(players.id, req.playerId), eq(players.saveVersion, baseVersion)))
      .returning({ version: players.saveVersion })
    if (updated.length) return { version: updated[0]!.version }
    const [row] = await db.select().from(players).where(eq(players.id, req.playerId)).limit(1)
    if (!row) return reply.code(401).send({ error: 'unknown player' })
    return reply.code(409).send({ error: 'stale save', version: row.saveVersion, save: await sanitizeSave(db, row.id, row.save) })
  })

  const key = cfg.openaiKey
  const director = deps.director ?? (key ? (m: MomentInput, model: string) => directSpirit(key, model, m) : null)
  const moderator = deps.moderator ?? (key ? (t: string) => moderate(key, t) : async () => true)
  const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

  app.post('/v1/spirit/moment', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: MomentBody } }, async req => {
    if (!director) return { line: null, reason: 'ai-disabled' }
    const since = dayStart()
    const [mine] = await db.select({ n: sql<number>`count(*)::int` }).from(aiCalls).where(and(eq(aiCalls.playerId, req.playerId), gte(aiCalls.createdAt, since)))
    if ((mine?.n ?? 0) >= (deps.perPlayerDaily ?? AI.perPlayerDaily)) return { line: null, reason: 'player-cap' }
    const [all] = await db.select({ micros: sql<number>`coalesce(sum(usd_micros),0)::int` }).from(aiCalls).where(gte(aiCalls.createdAt, since))
    if ((all?.micros ?? 0) / 1e6 >= AI.globalDailyUsd) return { line: null, reason: 'budget' }
    const input = req.body as MomentInput
    const record = (x: DirectorResult, ok: boolean) => db.insert(aiCalls).values({ playerId: req.playerId, kind: input.kind, model: x.model, inputTokens: x.inputTokens, outputTokens: x.outputTokens, usdMicros: Math.round(x.usd * 1e6), ok: ok ? 1 : 0 })
    let r = await director(input, AI.primary)
    if (!r.line && !r.failure?.startsWith('network')) {
      await record(r, false)
      r = await director(input, AI.fallback)
    }
    const safe = r.line ? await moderator(r.line.line) : false
    await record(r, !!r.line && safe)
    req.log.info({ ai: { kind: input.kind, model: r.model, ms: Math.round(r.ms), usd: r.usd, failure: r.failure, safe } }, 'spirit moment')
    if (!r.line || !safe) return { line: null, reason: !r.line ? (r.failure?.startsWith('network') ? 'network' : r.failure === 'schema' ? 'schema' : 'ai-error') : 'moderation' }
    return { line: r.line.line, mood: r.line.mood, nudge: r.line.nudge, memory: r.line.memory }
  })

  await app.ready()
  return app
}

async function assignFriendCode(db: Db, id: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const code = randomCode(6)
    try {
      await db.update(players).set({ friendCode: code }).where(eq(players.id, id))
      return code
    } catch (e) {
      const pgCode = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code
      if (pgCode !== '23505' || attempt >= 4) throw e
    }
  }
}

export async function befriend(db: Db, a: string, b: string): Promise<void> {
  await db.insert(friendships).values([{ playerId: a, friendId: b }, { playerId: b, friendId: a }]).onConflictDoNothing()
}

export async function sanitizeSave(db: Db, playerId: string, raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rows = await db.select({ item: entitlements.item }).from(entitlements).where(eq(entitlements.playerId, playerId))
  const owned = rows.map(r => r.item).sort()
  const premium = owned.includes('pass-s1')
  const pass = (raw.pass ?? null) as { season?: string; baseXp?: number; free?: number[]; premium?: number[] } | null
  const freeClaims = new Set(Array.isArray(pass?.free) ? pass!.free : [])
  const premiumClaims = new Set(premium && Array.isArray(pass?.premium) ? pass!.premium : [])
  const allowed = new Set<string>([...owned])
  for (const t of PASS_TIERS) {
    if (freeClaims.has(t.tier) && 'cosmetic' in t.free) allowed.add(t.free.cosmetic)
    if (premiumClaims.has(t.tier) && 'cosmetic' in t.premium) allowed.add(t.premium.cosmetic)
  }
  const unlocks = Array.isArray(raw.unlocks) ? (raw.unlocks as unknown[]).filter((u): u is string => typeof u === 'string' && (allowed.has(u) || !SELLABLE.has(u) && !PREMIUM_ONLY.has(u))) : []
  return { ...raw, entitlements: owned, unlocks, ...(pass ? { pass: { ...pass, premium: [...premiumClaims] } } : {}) }
}

const SELLABLE = new Set(Object.values(SKUS).flatMap(k => k.grants))
const PREMIUM_ONLY = new Set(PASS_TIERS.flatMap(t => ('cosmetic' in t.premium ? [t.premium.cosmetic] : [])))
