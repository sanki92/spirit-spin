import { and, eq, isNotNull, like, sql } from 'drizzle-orm'
import geoip from 'fast-geoip'
import maxmind, { type Reader, type Response } from 'maxmind'
import { createRequire } from 'node:module'
import { isIPv6 } from 'node:net'
import { ipBans, playerIps, players, type Db } from './db'

const TOUCH_MS = 5 * 60_000
const LOCAL = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:127\.|fc|fd)/

export const plainIp = (ip: string) => ip.replace(/^::ffff:/, '')

type Place = Response & { country_code?: string; city?: string }
let v6: Promise<Reader<Place> | null> | null = null
const v6Reader = () => (v6 ??= maxmind.open<Place>(createRequire(import.meta.url).resolve('@ip-location-db/geolite2-city-mmdb/geolite2-city-ipv6.mmdb')).catch(() => null))

export async function locate(ip: string): Promise<{ country: string | null; city: string | null }> {
  const clean = plainIp(ip)
  if (LOCAL.test(clean)) return { country: 'LAN', city: null }
  if (isIPv6(clean)) {
    const r = (await v6Reader())?.get(clean)
    return { country: r?.country_code || null, city: r?.city || null }
  }
  const r = await geoip.lookup(clean).catch(() => null)
  return { country: r?.country || null, city: r?.city || null }
}

export class Moderation {
  private touched = new Map<string, { at: number; ip: string }>()
  private bannedPlayers = new Map<string, string>()
  private bannedIps = new Map<string, string>()

  constructor(private db: Db, private onError: (e: unknown) => void = () => undefined) {}

  async load(): Promise<void> {
    const ps = await this.db.select({ id: players.id, reason: players.banReason }).from(players).where(isNotNull(players.bannedAt))
    this.bannedPlayers = new Map(ps.map(p => [p.id, p.reason ?? '']))
    const ips = await this.db.select().from(ipBans)
    this.bannedIps = new Map(ips.map(b => [b.ip, b.reason ?? '']))
  }

  async relocateV6(): Promise<void> {
    const ps = await this.db.select({ id: players.id, ip: players.lastIp }).from(players).where(like(players.lastIp, '%:%'))
    for (const p of ps) {
      const { country, city } = await locate(p.ip!)
      await this.db.update(players).set({ lastCountry: country, lastCity: city }).where(eq(players.id, p.id))
    }
    const hs = await this.db.select({ playerId: playerIps.playerId, ip: playerIps.ip }).from(playerIps).where(like(playerIps.ip, '%:%'))
    for (const h of hs) {
      const { country, city } = await locate(h.ip)
      await this.db.update(playerIps).set({ country, city }).where(and(eq(playerIps.playerId, h.playerId), eq(playerIps.ip, h.ip)))
    }
  }

  playerBan(id: string): string | null {
    return this.bannedPlayers.has(id) ? this.bannedPlayers.get(id) || 'Banned' : null
  }

  ipBan(ip: string): string | null {
    const k = plainIp(ip)
    return this.bannedIps.has(k) ? this.bannedIps.get(k) || 'Banned' : null
  }

  ban(playerId: string, ip: string): string | null {
    return this.playerBan(playerId) ?? this.ipBan(ip)
  }

  touch(playerId: string, rawIp: string): void {
    const ip = plainIp(rawIp)
    const prev = this.touched.get(playerId)
    const now = Date.now()
    if (prev && prev.ip === ip && now - prev.at < TOUCH_MS) return
    this.touched.set(playerId, { at: now, ip })
    if (this.touched.size > 50_000) this.touched.clear()
    void this.record(playerId, ip).catch(this.onError)
  }

  private async record(playerId: string, ip: string): Promise<void> {
    const { country, city } = await locate(ip)
    await this.db.update(players).set({ lastIp: ip, lastCountry: country, lastCity: city, lastSeenAt: new Date() }).where(eq(players.id, playerId))
    await this.db
      .insert(playerIps)
      .values({ playerId, ip, country, city })
      .onConflictDoUpdate({ target: [playerIps.playerId, playerIps.ip], set: { lastSeen: sql`now()`, country, city } })
  }

  async setPlayerBan(playerId: string, reason: string | null): Promise<void> {
    await this.db.update(players).set(reason === null ? { bannedAt: null, banReason: null } : { bannedAt: new Date(), banReason: reason }).where(eq(players.id, playerId))
    if (reason === null) this.bannedPlayers.delete(playerId)
    else this.bannedPlayers.set(playerId, reason)
  }

  async setIpBan(rawIp: string, reason: string | null): Promise<void> {
    const ip = plainIp(rawIp)
    if (reason === null) {
      await this.db.delete(ipBans).where(eq(ipBans.ip, ip))
      this.bannedIps.delete(ip)
    } else {
      await this.db.insert(ipBans).values({ ip, reason }).onConflictDoUpdate({ target: ipBans.ip, set: { reason } })
      this.bannedIps.set(ip, reason)
    }
  }
}
