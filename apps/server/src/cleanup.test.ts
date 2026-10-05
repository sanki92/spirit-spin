import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteIdleGuests } from './cleanup'
import { entitlements, openDb, players, type Db } from './db'

let db: Db, close: () => Promise<void>
beforeAll(async () => { ({ db, close } = await openDb('memory://')) })
afterAll(async () => { await close() })

const old = new Date(Date.now() - 10 * 86400_000)
let n = 0
const add = async (v: Partial<typeof players.$inferInsert>) => (await db.insert(players).values({ recoveryHash: `h${n++}`, ...v }).returning({ id: players.id }))[0]!.id

describe('idle guest cleanup', () => {
  it('removes only old, nameless, progress-free, unbanned guests without purchases', async () => {
    const idle = await add({ createdAt: old, save: { coins: 150, xp: 0 } })
    const empty = await add({ createdAt: old })
    const fresh = await add({ save: { xp: 0 } })
    const named = await add({ createdAt: old, username: 'keepme', save: { xp: 0 } })
    const played = await add({ createdAt: old, save: { xp: 40 } })
    const banned = await add({ createdAt: old, bannedAt: new Date(), banReason: 'x' })
    const bought = await add({ createdAt: old })
    await db.insert(entitlements).values({ playerId: bought, item: 'pass-s1', source: 'test' })
    expect(await deleteIdleGuests(db)).toBe(2)
    const left = ((await db.execute(sql`SELECT id::text AS id FROM players`)) as unknown as { rows: { id: string }[] }).rows.map(r => r.id)
    expect(left).not.toContain(idle)
    expect(left).not.toContain(empty)
    for (const keep of [fresh, named, played, banned, bought]) expect(left).toContain(keep)
    expect(await deleteIdleGuests(db)).toBe(0)
  })
})
