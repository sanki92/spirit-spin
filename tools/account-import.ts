import { readFileSync } from 'node:fs'
import { eq, or } from 'drizzle-orm'
import { hashRecoveryCode } from '../apps/server/src/auth'
import { entitlements, openDb, players } from '../apps/server/src/db'

const file = process.argv[2]
const code = process.env.ACCOUNT_CODE
const pepper = process.env.RECOVERY_PEPPER
if (!file || !code || !pepper) throw new Error('usage: ACCOUNT_CODE=... RECOVERY_PEPPER=... account-import <in.json>')
const data = JSON.parse(readFileSync(file, 'utf8')) as { player: { id: string; name: string; friendCode: string; username: string | null; save: Record<string, unknown>; saveVersion: number }; entitlements: { item: string; source: string }[] }
const p = data.player
const { db, close } = await openDb(process.env.DATABASE_URL ?? 'file://.data/pglite')
try {
  const clash = await db.select({ id: players.id }).from(players).where(or(eq(players.id, p.id), eq(players.friendCode, p.friendCode))).limit(1)
  if (clash.length) throw new Error('player already exists here')
  await db.insert(players).values({ id: p.id, recoveryHash: hashRecoveryCode(code, pepper), name: p.name, friendCode: p.friendCode, username: p.username, save: p.save, saveVersion: p.saveVersion })
  if (data.entitlements.length) await db.insert(entitlements).values(data.entitlements.map(e => ({ playerId: p.id, item: e.item, source: e.source })))
  console.log(JSON.stringify({ imported: p.friendCode, username: p.username, entitlements: data.entitlements.length }))
} finally {
  await close()
}
