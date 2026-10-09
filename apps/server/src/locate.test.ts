import { describe, expect, it } from 'vitest'
import { openDb, playerIps, players } from './db'
import { locate, Moderation } from './moderation'

describe('locate', () => {
  it('places Indian mobile IPv6 addresses in India, not Australia', async () => {
    expect((await locate('2409:40c2::1')).country).toBe('IN')
    expect((await locate('2401:4900::1')).country).toBe('IN')
  })

  it('still places IPv4 addresses', async () => {
    expect((await locate('49.36.0.1')).country).toBe('IN')
    expect((await locate('::ffff:49.36.0.1')).country).toBe('IN')
  })

  it('marks private addresses as LAN and unknown input as unknown', async () => {
    expect(await locate('192.168.1.4')).toEqual({ country: 'LAN', city: null })
    expect(await locate('fd00::1')).toEqual({ country: 'LAN', city: null })
    expect(await locate('not-an-ip')).toEqual({ country: null, city: null })
  })
})

describe('relocating stored IPv6 rows', () => {
  it('fixes players and IP history that the IPv4-only lookup placed in Australia', async () => {
    const { db, close } = await openDb('memory://')
    const ip = '2409:40c2::1'
    const [p] = await db.insert(players).values({ recoveryHash: 'h1', lastIp: ip, lastCountry: 'AU', lastCity: null }).returning({ id: players.id })
    const [q] = await db.insert(players).values({ recoveryHash: 'h2', lastIp: '49.36.0.1', lastCountry: 'IN', lastCity: 'Mumbai' }).returning({ id: players.id })
    await db.insert(playerIps).values({ playerId: p!.id, ip, country: 'AU', city: null })
    await new Moderation(db).relocateV6()
    const rows = await db.select({ id: players.id, country: players.lastCountry, city: players.lastCity }).from(players)
    expect(rows.find(r => r.id === p!.id)).toMatchObject({ country: 'IN', city: 'Pune' })
    expect(rows.find(r => r.id === q!.id)).toMatchObject({ country: 'IN', city: 'Mumbai' })
    expect((await db.select().from(playerIps))[0]).toMatchObject({ country: 'IN', city: 'Pune' })
    await close()
  })
})
