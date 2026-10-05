import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { entitlements, openDb, players } from '../apps/server/src/db'

const [friendCode, out] = process.argv.slice(2)
if (!friendCode || !out) throw new Error('usage: account-export <friendCode> <out.json>')
const { db, close } = await openDb(process.env.DATABASE_URL ?? 'file://.data/pglite')
try {
  const [p] = await db.select().from(players).where(eq(players.friendCode, friendCode.toUpperCase())).limit(1)
  if (!p) throw new Error(`no player ${friendCode}`)
  const ents = await db.select({ item: entitlements.item, source: entitlements.source }).from(entitlements).where(eq(entitlements.playerId, p.id))
  writeFileSync(out, JSON.stringify({ player: { id: p.id, name: p.name, friendCode: p.friendCode, username: p.username, save: p.save, saveVersion: p.saveVersion }, entitlements: ents }))
  console.log(JSON.stringify({ name: p.name, friendCode: p.friendCode, username: p.username, saveVersion: p.saveVersion, entitlements: ents.length }))
} finally {
  await close()
}
