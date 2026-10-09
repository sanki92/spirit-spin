import { heightUnder, parseRelief, type Relief } from './reliefGeometry'

const store = new Map<string, Relief | null>()

export const reliefFor = (key: string): Relief | null => store.get(key) ?? null

export async function loadRelief(key: string, fetchJson: () => Promise<unknown>): Promise<Relief | null> {
  let r: Relief | null = null
  try {
    r = parseRelief(await fetchJson())
  } catch {
    r = null
  }
  store.set(key, r)
  return r
}

const heightWithin = (r: Relief, to: number): number => Math.max(0, ...r.profile.filter((_, i) => i / r.profile.length < to))

export interface StackOptions { discScaleXZ: number; discScaleY: number; emblemR: number; gap: number; flat: { blade: number; disc: number } }

export function stackHeights(blade: Relief | null, disc: Relief | null, o: StackOptions): { bladeLift: number; bladeTop: number; emblemLift: number } {
  const discUnder = disc ? heightUnder(disc, (blade?.inner ?? 0) / o.discScaleXZ) * o.discScaleY : o.flat.disc
  const bladeLift = discUnder + o.gap
  const bladeTop = blade ? Math.max(...blade.tiers.map(t => t.h)) : o.flat.blade
  const hub = disc ? heightWithin(disc, o.emblemR / o.discScaleXZ) * o.discScaleY : o.flat.disc
  const bladeInner = blade && blade.inner < o.emblemR ? bladeLift + heightWithin(blade, o.emblemR) : 0
  return { bladeLift, bladeTop, emblemLift: Math.max(hub, bladeInner) + o.gap }
}
