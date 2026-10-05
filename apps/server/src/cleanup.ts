import { sql } from 'drizzle-orm'
import type { Db } from './db'

export async function deleteIdleGuests(db: Db, olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString()
  const idle = sql`SELECT id FROM players p WHERE p.username IS NULL AND p.banned_at IS NULL AND p.created_at < ${cutoff}::timestamptz
    AND coalesce((p.save->>'xp')::numeric, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.player_id = p.id)`
  const found = (await db.execute(sql`SELECT count(*)::int AS n FROM (${idle}) x`)) as unknown as { rows: { n: number }[] }
  const n = found.rows[0]?.n ?? 0
  if (!n) return 0
  await db.execute(sql`CREATE TEMP TABLE IF NOT EXISTS idle_guests (id uuid PRIMARY KEY)`)
  await db.execute(sql`DELETE FROM idle_guests`)
  await db.execute(sql`INSERT INTO idle_guests ${idle}`)
  const ids = sql`SELECT id FROM idle_guests`
  await db.execute(sql`DELETE FROM friendships WHERE player_id IN (${ids}) OR friend_id IN (${ids})`)
  await db.execute(sql`DELETE FROM ghost_matches WHERE player_id IN (${ids}) OR opponent_id IN (${ids})`)
  for (const t of ['player_stats', 'orders', 'player_ips', 'ai_calls', 'tournament_entries']) await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE player_id IN (${ids})`)
  await db.execute(sql`DELETE FROM players WHERE id IN (${ids})`)
  await db.execute(sql`DELETE FROM idle_guests`)
  return n
}
