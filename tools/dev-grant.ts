import { eq } from 'drizzle-orm'
import { entitlements, openDb, players } from '../apps/server/src/db'
import { awakenedForm, awakeningReady, BLADES, COSMETICS, DISCS, newBeast, SKUS, TIPS, type BeastId, type BeastState } from '../packages/core/src/index'

const [friendCode, leave] = process.argv.slice(2) as [string | undefined, BeastId | undefined]
const BEASTS: BeastId[] = ['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']
if (!friendCode || !leave || !BEASTS.includes(leave)) throw new Error('usage: dev-grant <friendCode> <beastLeftToAwaken>')

const { db, close } = await openDb(process.env.DATABASE_URL ?? 'file://.data/pglite')
try {
  const [row] = await db.select().from(players).where(eq(players.friendCode, friendCode.toUpperCase())).limit(1)
  if (!row) throw new Error(`no player with friend code ${friendCode}`)
  const save = structuredClone(row.save) as Record<string, unknown> & { beasts?: Partial<Record<BeastId, BeastState>> }
  const beasts: Partial<Record<BeastId, BeastState>> = { ...(save.beasts ?? {}) }
  for (const id of BEASTS) {
    const b = structuredClone(beasts[id] ?? newBeast(id, false))
    b.trust = Math.max(b.trust, 80)
    b.respect = Math.max(b.respect, 80)
    b.battles = Math.max(b.battles, 20)
    b.counters = { ...b.counters, spiritFinishes: Math.max(b.counters.spiritFinishes, 3), bossWins: Math.max(b.counters.bossWins, 2) }
    b.awakened = id === leave ? null : (b.awakened ?? awakenedForm(b))
    beasts[id] = b
  }
  if (!awakeningReady(beasts[leave]!)) throw new Error(`${leave} is not ready to awaken`)
  const unlocks = Array.isArray(save.unlocks) ? (save.unlocks as string[]) : []
  const next = {
    ...save,
    beasts,
    owned: { blades: Object.keys(BLADES), discs: Object.keys(DISCS), tips: Object.keys(TIPS) },
    unlocks: [...new Set([...unlocks, ...Object.keys(COSMETICS)])],
    traits: BEASTS,
    coins: Math.max(0, Number(save.coins ?? 0)) + 50000,
    shards: Math.max(0, Number(save.shards ?? 0)) + 500,
    xp: Number(save.xp ?? 0) + 1,
  }
  const grants = [...new Set(Object.values(SKUS).flatMap(s => s.grants))]
  const have = new Set((await db.select({ item: entitlements.item }).from(entitlements).where(eq(entitlements.playerId, row.id))).map(r => r.item))
  const missing = grants.filter(g => !have.has(g))
  if (missing.length) await db.insert(entitlements).values(missing.map(item => ({ playerId: row.id, item, source: 'dev-grant' })))
  await db.update(players).set({ save: next, saveVersion: row.saveVersion + 1, updatedAt: new Date() }).where(eq(players.id, row.id))
  console.log(JSON.stringify({
    player: row.name,
    version: row.saveVersion + 1,
    awakened: BEASTS.filter(id => beasts[id]!.awakened),
    readyToAwaken: leave,
    parts: { blades: next.owned.blades.length, discs: next.owned.discs.length, tips: next.owned.tips.length },
    cosmetics: next.unlocks.length,
    entitlementsAdded: missing,
    coins: next.coins,
    shards: next.shards,
  }))
} finally {
  await close()
}
