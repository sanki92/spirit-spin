import type { Texture } from 'three'
import { hasAsset } from '../../../assets/assets'
import { texture } from '../textures'
import type { PowerTextures } from './PowerFx'

const NAMES = {
  crystal: 'crystal-surface', rocks: 'rock-chunks', lightning: 'lightning-ribbon', bolt: 'sky-bolt', water: 'water-surface', whirlpool: 'whirlpool', splash: 'splash',
  fire: 'fire-ribbon', feather: 'feather', fireRing: 'fire-ring', wind: 'wind-ribbon', debris: 'debris', shadowPool: 'shadow-pool', claw: 'shadow-claw', slash: 'claw-slash',
} as const

export async function loadPowerTextures(crack: Texture): Promise<PowerTextures> {
  const keys = Object.keys(NAMES) as (keyof typeof NAMES)[]
  const list = await Promise.all(keys.map(k => texture(hasAsset(`vfx/power/${NAMES[k]}`) ? `vfx/power/${NAMES[k]}` : 'vfx/impact-flash')))
  return { ...Object.fromEntries(keys.map((k, i) => [k, list[i]!])), crack } as PowerTextures
}
