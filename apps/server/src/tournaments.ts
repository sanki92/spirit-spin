import { assembleTop, ghostBrain, roundRobin, simulateGhosts, STARTER_BUILDS, swissRound, type Standing, type TopBuild } from '@spirit/core'
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { randomCode } from './auth'
import { players, tournamentEntries, tournamentPairings, tournaments, type Db } from './db'
import { ghostOf, issueGhostMatch, type GhostSpec } from './league'

type Auth = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
const WEBHOOK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/
const MAX_PLAYERS = 16
const MIN_PLAYERS = 4
const FALLBACK_DECK: TopBuild[] = [STARTER_BUILDS.voltfang]

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

async function standings(db: Db, tid: string) {
  return db
    .select({ playerId: tournamentEntries.playerId, name: players.name, points: tournamentEntries.points, wins: tournamentEntries.wins, losses: tournamentEntries.losses, scoreFor: tournamentEntries.scoreFor, scoreAgainst: tournamentEntries.scoreAgainst, bye: tournamentEntries.bye })
    .from(tournamentEntries)
    .innerJoin(players, eq(players.id, tournamentEntries.playerId))
    .where(eq(tournamentEntries.tournamentId, tid))
    .orderBy(sql`${tournamentEntries.points} DESC, (${tournamentEntries.scoreFor} - ${tournamentEntries.scoreAgainst}) DESC, ${tournamentEntries.wins} DESC, ${players.name} ASC`)
}

async function credit(db: Db, tid: string, playerId: string, d: { points: number; win: boolean; scoreFor: number; scoreAgainst: number; bye?: boolean }) {
  await db
    .update(tournamentEntries)
    .set({
      points: sql`${tournamentEntries.points} + ${d.points}`,
      wins: sql`${tournamentEntries.wins} + ${d.win ? 1 : 0}`,
      losses: sql`${tournamentEntries.losses} + ${d.win ? 0 : 1}`,
      scoreFor: sql`${tournamentEntries.scoreFor} + ${d.scoreFor}`,
      scoreAgainst: sql`${tournamentEntries.scoreAgainst} + ${d.scoreAgainst}`,
      ...(d.bye ? { bye: true } : {}),
    })
    .where(and(eq(tournamentEntries.tournamentId, tid), eq(tournamentEntries.playerId, playerId)))
}

async function postWebhook(url: string | null, content: string) {
  if (!url || !WEBHOOK.test(url)) return
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(5000) }).catch(() => undefined)
}

export function registerTournaments(app: FastifyInstance, db: Db, requireAuth: Auth) {
  const r = app.withTypeProvider<ZodTypeProvider>()

  const openRound = async (tid: string, round: number) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tid)).limit(1)
    if (!t) return
    const table = await standings(db, tid)
    const ids = table.map(e => e.playerId).sort()
    let pairs: [string, string | null][]
    if (t.format === 'rr') pairs = roundRobin(ids)[round - 1] ?? []
    else {
      const prior = await db.select({ a: tournamentPairings.a, b: tournamentPairings.b }).from(tournamentPairings).where(eq(tournamentPairings.tournamentId, tid))
      const played = new Set(prior.filter(p => p.b).map(p => pairKey(p.a, p.b!)))
      pairs = swissRound(table.map<Standing>(e => ({ id: e.playerId, points: e.points, bye: e.bye })), played)
    }
    const deadline = new Date(Date.now() + t.roundHours * 3600 * 1000)
    await db.update(tournaments).set({ currentRound: round, roundDeadline: deadline }).where(eq(tournaments.id, tid))
    for (const [a, b] of pairs) {
      await db.insert(tournamentPairings).values({ tournamentId: tid, round, a, b, winner: b === null ? a : null, resolvedBy: b === null ? 'bye' : null, resolvedAt: b === null ? new Date() : null })
      if (b === null) await credit(db, tid, a, { points: 3, win: true, scoreFor: 0, scoreAgainst: 0, bye: true })
    }
    await maybeAdvance(tid)
  }

  const maybeAdvance = async (tid: string) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tid)).limit(1)
    if (!t || t.status !== 'running') return
    const open = await db.select({ id: tournamentPairings.id }).from(tournamentPairings).where(and(eq(tournamentPairings.tournamentId, tid), eq(tournamentPairings.round, t.currentRound), isNull(tournamentPairings.winner))).limit(1)
    if (open.length) return
    if (t.currentRound >= t.roundsTotal) {
      const [done] = await db.update(tournaments).set({ status: 'done', roundDeadline: null }).where(and(eq(tournaments.id, tid), eq(tournaments.status, 'running'))).returning({ id: tournaments.id })
      if (done) {
        const table = await standings(db, tid)
        void postWebhook(t.webhook, `Spirit Spin: ${t.name} is over!\n${table.slice(0, 8).map((e, i) => `${i + 1}. ${e.name} (${e.points} pts)`).join('\n')}`)
      }
      return
    }
    const [moved] = await db.update(tournaments).set({ currentRound: t.currentRound + 1 }).where(and(eq(tournaments.id, tid), eq(tournaments.currentRound, t.currentRound))).returning({ id: tournaments.id })
    if (moved) await openRound(tid, t.currentRound + 1)
  }

  const resolve = async (pairingId: string, winner: string, scores: [number, number], by: string) => {
    const [p] = await db.update(tournamentPairings).set({ winner, scores, resolvedBy: by, resolvedAt: new Date() }).where(and(eq(tournamentPairings.id, pairingId), isNull(tournamentPairings.winner))).returning()
    if (!p || !p.b) return
    const loser = winner === p.a ? p.b : p.a
    const [ws, ls] = winner === p.a ? scores : [scores[1], scores[0]]
    await credit(db, p.tournamentId, winner, { points: 3, win: true, scoreFor: ws, scoreAgainst: ls })
    await credit(db, p.tournamentId, loser, { points: 0, win: false, scoreFor: ls, scoreAgainst: ws })
    await maybeAdvance(p.tournamentId)
  }

  const sweep = async (now = Date.now()) => {
    const due = await db.select().from(tournaments).where(and(eq(tournaments.status, 'running'), lt(tournaments.roundDeadline, new Date(now))))
    for (const t of due) {
      const open = await db.select().from(tournamentPairings).where(and(eq(tournamentPairings.tournamentId, t.id), eq(tournamentPairings.round, t.currentRound), isNull(tournamentPairings.winner)))
      for (const p of open) {
        const [ga, gb] = await Promise.all([ghostOf(db, p.a, FALLBACK_DECK), ghostOf(db, p.b!, FALLBACK_DECK)])
        const side = (g: typeof ga) => ({ deck: g.deck.map(assembleTop), rips: g.rips, brain: ghostBrain({ rips: g.rips, aggression: g.aggression }) })
        const m = simulateGhosts(side(ga), side(gb), randomInt(2 ** 31 - 1))
        await resolve(p.id, m.winner === 0 ? p.a : p.b!, m.scores, 'sweep')
      }
    }
  }
  app.decorate('sweepTournaments', sweep)
  const timer = setInterval(() => void sweep().catch(e => app.log.warn({ err: String(e) }, 'tournament sweep failed')), 60_000)
  app.addHook('onClose', async () => clearInterval(timer))

  const detailOf = async (tid: string, me: string) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tid)).limit(1)
    if (!t) return null
    const entries = await standings(db, tid)
    if (!entries.some(e => e.playerId === me)) return null
    const pairings = await db.select().from(tournamentPairings).where(eq(tournamentPairings.tournamentId, tid)).orderBy(asc(tournamentPairings.round))
    return {
      id: t.id, code: t.code, name: t.name, status: t.status, format: t.format, ownerId: t.ownerId, round: t.currentRound, roundsTotal: t.roundsTotal,
      roundDeadline: t.roundDeadline, roundHours: t.roundHours, entries,
      pairings: pairings.map(p => ({ id: p.id, round: p.round, a: p.a, b: p.b, winner: p.winner, scores: p.scores, resolvedBy: p.resolvedBy })),
    }
  }

  r.post('/v1/tournaments', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: z.object({ name: z.string().min(1).max(40), roundHours: z.number().int().min(1).max(48).optional(), webhook: z.string().max(300).optional() }) } }, async (req, reply) => {
    const { name, roundHours, webhook } = req.body
    if (webhook && !WEBHOOK.test(webhook)) return reply.code(400).send({ error: 'webhook must be a Discord webhook URL' })
    const clean = name.replace(/[^\p{L}\p{N} '!?&._-]/gu, '').trim().slice(0, 40) || 'Spirit Cup'
    for (let i = 0; i < 5; i++) {
      try {
        const [t] = await db.insert(tournaments).values({ code: randomCode(6), name: clean, ownerId: req.playerId, roundHours: roundHours ?? 24, webhook: webhook ?? null }).returning({ id: tournaments.id })
        await db.insert(tournamentEntries).values({ tournamentId: t!.id, playerId: req.playerId })
        return detailOf(t!.id, req.playerId)
      } catch (e) {
        if (i === 4) throw e
      }
    }
  })

  r.post('/v1/tournaments/join', { preHandler: requireAuth, schema: { body: z.object({ code: z.string().regex(/^[A-Za-z0-9]{6}$/) }) } }, async (req, reply) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.code, req.body.code.toUpperCase())).limit(1)
    if (!t) return reply.code(404).send({ error: 'unknown tournament' })
    if (t.status !== 'lobby') return reply.code(409).send({ error: 'already started' })
    const count = await db.select({ n: sql<number>`count(*)::int` }).from(tournamentEntries).where(eq(tournamentEntries.tournamentId, t.id))
    if ((count[0]?.n ?? 0) >= MAX_PLAYERS) return reply.code(409).send({ error: 'full' })
    await db.insert(tournamentEntries).values({ tournamentId: t.id, playerId: req.playerId }).onConflictDoNothing()
    return detailOf(t.id, req.playerId)
  })

  r.get('/v1/tournaments', { preHandler: requireAuth }, async req => {
    const mine = await db.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, round: tournaments.currentRound, roundsTotal: tournaments.roundsTotal, code: tournaments.code })
      .from(tournamentEntries).innerJoin(tournaments, eq(tournaments.id, tournamentEntries.tournamentId))
      .where(eq(tournamentEntries.playerId, req.playerId)).orderBy(sql`${tournaments.createdAt} DESC`).limit(50)
    return { tournaments: mine }
  })

  r.get('/v1/tournaments/:id', { preHandler: requireAuth, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req, reply) => {
    await sweep()
    return (await detailOf(req.params.id, req.playerId)) ?? reply.code(404).send({ error: 'not found' })
  })

  r.post('/v1/tournaments/:id/start', { preHandler: requireAuth, schema: { params: z.object({ id: z.string().uuid() }) } }, async (req, reply) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, req.params.id)).limit(1)
    if (!t) return reply.code(404).send({ error: 'not found' })
    if (t.ownerId !== req.playerId) return reply.code(403).send({ error: 'only the host can start' })
    if (t.status !== 'lobby') return reply.code(409).send({ error: 'already started' })
    const n = (await db.select({ n: sql<number>`count(*)::int` }).from(tournamentEntries).where(eq(tournamentEntries.tournamentId, t.id)))[0]?.n ?? 0
    if (n < MIN_PLAYERS) return reply.code(400).send({ error: `needs at least ${MIN_PLAYERS} players` })
    const format = n <= 6 ? 'rr' : 'swiss'
    const roundsTotal = format === 'rr' ? (n % 2 ? n : n - 1) : n <= 8 ? 3 : 4
    const [started] = await db.update(tournaments).set({ status: 'running', format, roundsTotal }).where(and(eq(tournaments.id, t.id), eq(tournaments.status, 'lobby'))).returning({ id: tournaments.id })
    if (!started) return reply.code(409).send({ error: 'already started' })
    await openRound(t.id, 1)
    return detailOf(t.id, req.playerId)
  })

  r.post('/v1/tournaments/:id/pairings/:pid/play', { preHandler: requireAuth, schema: { params: z.object({ id: z.string().uuid(), pid: z.string().uuid() }), body: z.object({ pool: z.enum(['motion', 'swipe']) }) } }, async (req, reply) => {
    const [p] = await db.select().from(tournamentPairings).where(and(eq(tournamentPairings.id, req.params.pid), eq(tournamentPairings.tournamentId, req.params.id))).limit(1)
    if (!p || (p.a !== req.playerId && p.b !== req.playerId) || !p.b) return reply.code(404).send({ error: 'not your pairing' })
    if (p.winner) return reply.code(409).send({ error: 'already decided' })
    const opponent = p.a === req.playerId ? p.b : p.a
    const [me, them] = await Promise.all([ghostOf(db, req.playerId, FALLBACK_DECK), ghostOf(db, opponent, FALLBACK_DECK)])
    const spec: GhostSpec = { deck: me.deck, ghostDeck: them.deck, ghostRips: them.rips, brain: ghostBrain({ rips: them.rips, aggression: them.aggression }), ghostRating: them.rating, ghostName: them.name }
    return issueGhostMatch(db, { playerId: req.playerId, opponentId: opponent, kind: 'tournament', pool: req.body.pool, refId: p.id, spec })
  })

  return {
    onVerified: async (gm: { kind: string; refId: string | null; playerId: string; opponentId: string | null }, result: { winner: 0 | 1; scores: [number, number] }) => {
      if (gm.kind !== 'tournament' || !gm.refId || !gm.opponentId) return
      const [p] = await db.select().from(tournamentPairings).where(eq(tournamentPairings.id, gm.refId)).limit(1)
      if (!p) return
      const winner = result.winner === 0 ? gm.playerId : gm.opponentId
      const scores: [number, number] = p.a === gm.playerId ? result.scores : [result.scores[1], result.scores[0]]
      await resolve(p.id, winner, scores, 'ghost')
    },
  }
}

declare module 'fastify' {
  interface FastifyInstance { sweepTournaments: (now?: number) => Promise<void> }
}
