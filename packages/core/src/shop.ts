import { BLADES, DISCS, ROOKIE_BUILDS, STARTER_BEASTS, TIPS, type Rarity } from './parts'
import { createRng, rngNext } from './rng'
import { dropFloor } from './tower'

export const PART_PRICE: Record<Rarity, number> = { common: 100, rare: 250, epic: 600, legendary: 1500 }

export interface ShopItem { id: string; kind: 'blade' | 'disc' | 'tip'; partId: string; rarity: Rarity; price: number }

const ROOKIE = new Set(STARTER_BEASTS.flatMap(b => [`blade:${ROOKIE_BUILDS[b].bladeId}`, `tip:${ROOKIE_BUILDS[b].tipId}`]))

const ALL: Omit<ShopItem, 'price'>[] = [
  ...Object.values(BLADES).map(b => ({ id: `blade:${b.id}`, kind: 'blade' as const, partId: b.id, rarity: b.rarity })),
  ...Object.values(DISCS).map(d => ({ id: `disc:${d.id}`, kind: 'disc' as const, partId: d.id, rarity: d.rarity })),
  ...Object.values(TIPS).map(t => ({ id: `tip:${t.id}`, kind: 'tip' as const, partId: t.id, rarity: t.rarity })),
].filter(it => !ROOKIE.has(it.id))

const daySeed = (dateKey: string): number => {
  let seed = 0x5f3759df
  for (let i = 0; i < dateKey.length; i++) seed = Math.imul(seed ^ dateKey.charCodeAt(i), 2654435761) >>> 0
  return seed
}

function draw(dateKey: string, pool: readonly Omit<ShopItem, 'price'>[], size: number): Omit<ShopItem, 'price'>[] {
  const rng = createRng(daySeed(dateKey))
  const left = [...pool]
  const out: Omit<ShopItem, 'price'>[] = []
  while (out.length < size && left.length) out.push(left.splice(Math.floor(rngNext(rng) * left.length), 1)[0]!)
  return out
}

const ANCHOR = Date.UTC(2026, 0, 1)
const DAY_MS = 86_400_000
const memo = new Map<string, Omit<ShopItem, 'price'>[]>()

const dayIndex = (dateKey: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? Math.round((Date.parse(`${dateKey}T00:00:00Z`) - ANCHOR) / DAY_MS) : null)

function stock(dateKey: string, eligible: readonly Omit<ShopItem, 'price'>[], size: number, tag: string): Omit<ShopItem, 'price'>[] {
  const key = `${tag}|${size}|${dateKey}`
  const hit = memo.get(key)
  if (hit) return hit
  const idx = dayIndex(dateKey)
  let yesterday = new Set<string>()
  if (idx !== null && idx > 0) {
    let prev: Omit<ShopItem, 'price'>[] = []
    for (let i = Math.max(1, idx - 400); i <= idx - 1; i++) prev = stock(new Date(ANCHOR + i * DAY_MS).toISOString().slice(0, 10), eligible, size, tag)
    yesterday = new Set(prev.map(it => it.id))
  }
  const picks = draw(dateKey, eligible.filter(it => !yesterday.has(it.id)), size)
  if (picks.length < size) picks.push(...draw(dateKey, eligible.filter(it => yesterday.has(it.id)), size - picks.length))
  if (memo.size > 4000) memo.clear()
  memo.set(key, picks)
  return picks
}

export function shopRotation(dateKey: string, size = 6, tower = Infinity, owned: ReadonlySet<string> = new Set()): ShopItem[] {
  const eligible = ALL.filter(it => (dropFloor(it.kind, it.partId) ?? 0) <= tower)
  const day = stock(dateKey, eligible, Math.min(size, eligible.length), eligible.map(it => it.id).join(','))
  const fill = draw(dateKey, eligible.filter(it => !owned.has(it.id) && !day.some(d => d.id === it.id)), size)
  const offer = [...day.filter(it => !owned.has(it.id)), ...fill].slice(0, size)
  return offer.map(it => ({ ...it, price: PART_PRICE[it.rarity] }))
}
