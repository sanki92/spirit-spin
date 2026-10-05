import { sql } from 'drizzle-orm'
import { openDb } from '../apps/server/src/db'

const keep = process.argv.slice(2).map(c => c.toUpperCase())
if (!keep.length) throw new Error('usage: prune-accounts <friendCode to keep> [...more]')
const apply = process.env.APPLY === '1'
const { db, close } = await openDb(process.env.DATABASE_URL ?? 'file://.data/pglite')
const list = (ids: string[]) => sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)
try {
  const rows = (await db.execute(sql`SELECT id::text AS id, friend_code, username FROM players`)) as unknown as { rows: { id: string; friend_code: string | null; username: string | null }[] }
  const all = rows.rows
  const kept = all.filter(r => r.friend_code && keep.includes(r.friend_code))
  if (kept.length !== keep.length) throw new Error(`could not find all kept accounts (${kept.map(k => k.friend_code).join(',')})`)
  const gone = all.filter(r => !kept.includes(r)).map(r => r.id)
  console.log(JSON.stringify({ total: all.length, keep: kept.map(k => `${k.username ?? '?'} ${k.friend_code}`), remove: gone.length, apply }))
  if (!apply || !gone.length) process.exit(0)
  const ids = list(gone)
  await db.execute(sql`DELETE FROM tournament_pairings WHERE a IN (${ids}) OR b IN (${ids}) OR tournament_id IN (SELECT id FROM tournaments WHERE owner_id IN (${ids}))`)
  await db.execute(sql`DELETE FROM tournament_entries WHERE player_id IN (${ids}) OR tournament_id IN (SELECT id FROM tournaments WHERE owner_id IN (${ids}))`)
  await db.execute(sql`DELETE FROM tournaments WHERE owner_id IN (${ids})`)
  await db.execute(sql`DELETE FROM ghost_matches WHERE player_id IN (${ids}) OR opponent_id IN (${ids})`)
  await db.execute(sql`DELETE FROM friendships WHERE player_id IN (${ids}) OR friend_id IN (${ids})`)
  for (const t of ['player_stats', 'orders', 'entitlements', 'player_ips', 'ai_calls']) await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE player_id IN (${ids})`)
  await db.execute(sql`DELETE FROM live_matches WHERE a_id IN (${ids}) OR b_id IN (${ids})`)
  await db.execute(sql`DELETE FROM players WHERE id IN (${ids})`)
  const left = (await db.execute(sql`SELECT count(*)::int AS n FROM players`)) as unknown as { rows: { n: number }[] }
  console.log(JSON.stringify({ removed: gone.length, playersLeft: left.rows[0]?.n }))
} finally {
  await close()
}
