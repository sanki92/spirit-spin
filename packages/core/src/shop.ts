import { BLADES, DISCS, TIPS, type Rarity } from './parts'
import { createRng, rngNext } from './rng'
import { dropFloor } from './tower'

export const PART_PRICE: Record<Rarity, number> = { common: 100, rare: 250, epic: 600, legendary: 1500 }

export interface ShopItem { id: string; kind: 'blade' | 'disc' | 'tip'; partId: string; rarity: Rarity; price: number }

const ALL: Omit<ShopItem, 'price'>[] = [
  ...Object.values(BLADES).map(b => ({ id: `blade:${b.id}`, kind: 'blade' as const, partId: b.id, rarity: b.rarity })),
  ...Object.values(DISCS).map(d => ({ id: `disc:${d.id}`, kind: 'disc' as const, partId: d.id, rarity: d.rarity })),
  ...Object.values(TIPS).map(t => ({ id: `tip:${t.id}`, kind: 'tip' as const, partId: t.id, rarity: t.rarity })),
]

export function shopRotation(dateKey: string, size = 6, tower = Infinity): ShopItem[] {
  let seed = 0x5f3759df
  for (let i = 0; i < dateKey.length; i++) seed = Math.imul(seed ^ dateKey.charCodeAt(i), 2654435761) >>> 0
  const rng = createRng(seed)
  const pool = ALL.filter(it => (dropFloor(it.kind, it.partId) ?? 0) <= tower)
  const out: ShopItem[] = []
  while (out.length < size && pool.length) {
    const it = pool.splice(Math.floor(rngNext(rng) * pool.length), 1)[0] as Omit<ShopItem, 'price'>
    out.push({ ...it, price: PART_PRICE[it.rarity] })
  }
  return out
}
