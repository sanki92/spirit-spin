import {
  assembleTop, decodeInputs, deckValid, elo, ghostBrain, inputTicks, judgeRip, MAX_ROUND_INPUTS, replayMatch, STARTER_BUILDS,
  type BotBrain, type RipView, type TickInput, type TopBuild,
} from '@spirit/core'
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { ghostMatches, players, playerStats, type Db } from './db'

const num = z.number().finite()
export const Build = z.object({ bladeId: z.string().max(20), discId: z.string().max(20), tipId: z.string().max(20), beastId: z.enum(['voltfang', 'aegiron', 'nagara', 'agnyx']) })
const Sample = z.object({ t: num, ax: num, ay: num, az: num, gx: num, gy: num, gz: num, roll: num })
const RoundBody = z.object({
  motion: z.array(Sample).max(260).optional(),
  swipe: z.object({ points: z.array(z.object({ t: num, x: num, y: num })).max(200), h: num }).optional(),
  pull100: num,
  inputs: z.array(z.number().int().min(-100).max(100_000)).max(24_000),
})
export const SubmitBody = z.object({ rounds: z.array(RoundBody).min(1).max(20) })

export const ISSUE_TTL_MS = 30 * 60 * 1000
const HOUSE = { name: 'Spirit Echo', deck: [STARTER_BUILDS.agnyx, STARTER_BUILDS.aegiron, STARTER_BUILDS.nagara], rips: [] as RipView[], aggression: 0.5 }

export interface EloPlan { col: 'rating' | 'ratingSwipe'; lossDelta: number; winDelta: number; oppWin: number; oppLoss: number }
export interface GhostSpec { deck: TopBuild[]; ghostDeck: TopBuild[]; ghostRips: RipView[]; brain: BotBrain; ghostRating: number; ghostName: string; elo?: EloPlan }
type Auth = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
type Pool = 'motion' | 'swipe'

export async function ensureStats(db: Db, id: string) {
  await db.insert(playerStats).values({ playerId: id }).onConflictDoNothing()
  const [row] = await db.select().from(playerStats).where(eq(playerStats.playerId, id)).limit(1)
  return row!
}

export async function recordGhostHistory(db: Db, id: string, views: readonly RipView[], aggression: number | null): Promise<void> {
  const st = await ensureStats(db, id)
  const rips = [...views.filter(v => v.ok), ...(st.rips as RipView[])].slice(0, 12)
  const next = aggression === null || !Number.isFinite(aggression) ? st.aggression : st.aggression * 0.7 + Math.max(0, Math.min(1, aggression)) * 0.3
  await db.update(playerStats).set({ rips, aggression: next, updatedAt: new Date() }).where(eq(playerStats.playerId, id))
}

const meanTilt = (rounds: readonly { inputs: readonly TickInput[] }[]) => {
  let sum = 0, n = 0
  for (const r of rounds) for (const i of r.inputs) { sum += Math.min(1, Math.hypot(i.tiltX, i.tiltY)); n++ }
  return n ? sum / n : null
}

async function bump(db: Db, id: string, col: 'rating' | 'ratingSwipe', delta: number) {
  await ensureStats(db, id)
  const c = col === 'rating' ? playerStats.rating : playerStats.ratingSwipe
  await db.update(playerStats).set({ [col]: sql`${c} + ${delta}`, updatedAt: new Date() }).where(eq(playerStats.playerId, id))
}

export async function issueGhostMatch(db: Db, o: { playerId: string; opponentId: string | null; kind: 'ranked' | 'tournament'; pool: Pool; refId?: string; spec: GhostSpec }) {
  const seed = randomInt(2 ** 31 - 1)
  const [row] = await db.insert(ghostMatches).values({ playerId: o.playerId, opponentId: o.opponentId, kind: o.kind, pool: o.pool, refId: o.refId ?? null, seed, spec: o.spec as unknown as Record<string, unknown> }).returning({ id: ghostMatches.id })
  return { matchId: row!.id, seed, pool: o.pool, deck: o.spec.deck, opponent: { name: o.spec.ghostName, rating: o.spec.ghostRating, deck: o.spec.ghostDeck, rips: o.spec.ghostRips, brain: o.spec.brain } }
}

export async function ghostOf(db: Db, id: string, fallbackDeck: TopBuild[]) {
  const st = await ensureStats(db, id)
  const [p] = await db.select({ name: players.name, save: players.save }).from(players).where(eq(players.id, id)).limit(1)
  const loadout = (p?.save as { loadout?: TopBuild } | undefined)?.loadout
  const valid = (d: unknown): d is TopBuild[] => {
    if (!Array.isArray(d) || !d.length) return false
    try { d.forEach(b => assembleTop(b as TopBuild)); return true } catch { return false }
  }
  const deck = valid(st.deck) ? st.deck : valid(loadout ? [loadout] : null) ? [loadout!] : fallbackDeck
  return { name: p?.name ?? 'Spinner', deck, rips: st.rips as RipView[], aggression: st.aggression, rating: st.rating }
}

export function registerLeague(app: FastifyInstance, db: Db, requireAuth: Auth, onVerified?: (gm: typeof ghostMatches.$inferSelect, result: { winner: 0 | 1; scores: [number, number] }) => Promise<void>) {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/v1/ranked', { preHandler: requireAuth }, async req => {
    const st = await ensureStats(db, req.playerId)
    return { rating: st.rating, ratingSwipe: st.ratingSwipe, played: st.rankedPlayed, won: st.rankedWon, deck: st.deck, ghostRips: (st.rips as unknown[]).length }
  })

  r.post('/v1/ranked/start', { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { body: z.object({ deck: z.array(Build).length(3), pool: z.enum(['motion', 'swipe']) }) } }, async (req, reply) => {
    const { deck, pool } = req.body
    if (!deckValid(deck)) return reply.code(400).send({ error: 'deck parts must not repeat' })
    try { deck.forEach(assembleTop) } catch { return reply.code(400).send({ error: 'unknown part' }) }
    const st = await ensureStats(db, req.playerId)
    await db.update(playerStats).set({ deck, updatedAt: new Date() }).where(eq(playerStats.playerId, req.playerId))
    const col = pool === 'motion' ? playerStats.rating : playerStats.ratingSwipe
    const mine = pool === 'motion' ? st.rating : st.ratingSwipe
    let opp: { id: string; name: string; deck: unknown; rips: unknown; aggression: number; rating: number } | undefined
    for (const w of [200, 500]) {
      ;[opp] = await db
        .select({ id: playerStats.playerId, name: players.name, deck: playerStats.deck, rips: playerStats.rips, aggression: playerStats.aggression, rating: col })
        .from(playerStats)
        .innerJoin(players, eq(players.id, playerStats.playerId))
        .where(and(ne(playerStats.playerId, req.playerId), sql`${playerStats.deck} IS NOT NULL`, gte(col, mine - w), lte(col, mine + w)))
        .orderBy(sql`random()`)
        .limit(1)
      if (opp) break
    }
    const ghost = opp ? { name: opp.name, deck: opp.deck as TopBuild[], rips: opp.rips as RipView[], aggression: opp.aggression, rating: opp.rating } : { ...HOUSE, rating: mine }
    const key = pool === 'motion' ? 'rating' : 'ratingSwipe'
    const plan: EloPlan = { col: key, lossDelta: elo(mine, ghost.rating, 0)[0] - mine, winDelta: elo(mine, ghost.rating, 1)[0] - mine, oppWin: elo(ghost.rating, mine, 1)[0] - ghost.rating, oppLoss: elo(ghost.rating, mine, 0)[0] - ghost.rating }
    const abandoned = await db.update(ghostMatches).set({ status: 'abandoned' }).where(and(eq(ghostMatches.playerId, req.playerId), eq(ghostMatches.kind, 'ranked'), eq(ghostMatches.status, 'issued'))).returning()
    for (const a of abandoned) {
      const ap = (a.spec as unknown as GhostSpec).elo
      if (ap && a.opponentId) await bump(db, a.opponentId, ap.col, ap.oppWin)
    }
    await db.update(playerStats).set({ [key]: sql`${col} + ${plan.lossDelta}`, rankedPlayed: sql`${playerStats.rankedPlayed} + 1`, updatedAt: new Date() }).where(eq(playerStats.playerId, req.playerId))
    const spec: GhostSpec = { deck, ghostDeck: ghost.deck, ghostRips: ghost.rips, brain: ghostBrain({ rips: ghost.rips, aggression: ghost.aggression }), ghostRating: ghost.rating, ghostName: ghost.name, elo: plan }
    return issueGhostMatch(db, { playerId: req.playerId, opponentId: opp?.id ?? null, kind: 'ranked', pool, spec })
  })

  r.post('/v1/matches/:id/submit', { preHandler: requireAuth, bodyLimit: 1024 * 1024, schema: { params: z.object({ id: z.string().uuid() }), body: SubmitBody } }, async (req, reply) => {
    if (req.body.rounds.some(rd => inputTicks(rd.inputs) > MAX_ROUND_INPUTS)) return reply.code(400).send({ error: 'round too long' })
    const [gm] = await db.update(ghostMatches).set({ status: 'verifying' }).where(and(eq(ghostMatches.id, req.params.id), eq(ghostMatches.playerId, req.playerId), eq(ghostMatches.status, 'issued'))).returning()
    if (!gm) {
      const [exists] = await db.select({ id: ghostMatches.id }).from(ghostMatches).where(and(eq(ghostMatches.id, req.params.id), eq(ghostMatches.playerId, req.playerId))).limit(1)
      return reply.code(exists ? 409 : 404).send({ error: exists ? 'already submitted' : 'unknown match' })
    }
    const reject = async (reason: string) => {
      await db.update(ghostMatches).set({ status: 'rejected', result: { reason } }).where(eq(ghostMatches.id, gm.id))
      return reply.code(409).send({ error: reason })
    }
    if (Date.now() - gm.createdAt.getTime() > ISSUE_TTL_MS) return reject('expired')
    const spec = gm.spec as unknown as GhostSpec
    const pool = gm.pool as Pool
    const judged = req.body.rounds.map(rd => judgeRip(pool === 'motion' ? { motion: rd.motion, pull100: rd.pull100 } : { swipe: rd.swipe, pull100: rd.pull100 }))
    const rounds = req.body.rounds.map((rd, i) => ({ rip: judged[i]!.rip, inputs: decodeInputs(rd.inputs).slice(0, 20_000) }))
    const rep = replayMatch({ player: spec.deck.map(assembleTop), ghost: spec.ghostDeck.map(assembleTop), brain: spec.brain, ghostRips: spec.ghostRips, seed: gm.seed, rounds })
    if (!rep.consistent) return reject('replay mismatch')
    if (!rep.complete) return reject('incomplete')
    const winner = rep.match.winner as 0 | 1
    const scores = rep.match.scores
    const result: Record<string, unknown> = { winner, scores }
    const plan = spec.elo
    await db.transaction(async tx => {
      const t = tx as unknown as Db
      if (gm.kind === 'ranked' && plan) {
        if (winner === 0) {
          await t.update(playerStats).set({ [plan.col]: sql`${plan.col === 'rating' ? playerStats.rating : playerStats.ratingSwipe} + ${plan.winDelta - plan.lossDelta}`, rankedWon: sql`${playerStats.rankedWon} + 1`, updatedAt: new Date() }).where(eq(playerStats.playerId, req.playerId))
          if (gm.opponentId) await bump(t, gm.opponentId, plan.col, plan.oppLoss)
        } else if (gm.opponentId) await bump(t, gm.opponentId, plan.col, plan.oppWin)
      }
      await t.update(ghostMatches).set({ status: 'verified', result }).where(eq(ghostMatches.id, gm.id))
    })
    if (gm.kind === 'ranked' && plan) {
      const st = await ensureStats(db, req.playerId)
      result.rating = st[plan.col]
      result.delta = winner === 0 ? plan.winDelta : plan.lossDelta
    }
    try {
      await recordGhostHistory(db, req.playerId, judged.map(j => j.view), meanTilt(rounds))
      await onVerified?.(gm, { winner, scores })
    } catch (e) {
      req.log.error({ err: String(e), match: gm.id }, 'post-verification bookkeeping failed')
    }
    return result
  })
}
