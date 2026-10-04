/**
 * Parts catalog and top assembly. A top = Blade + Disc + Tip, with a spirit beast mounted on the disc's chip.
 * Rarity marks how hard a part is to earn, never raw power: every blade spends the same stat budget (spec §9).
 */
export type TipKind = 'flat' | 'ball' | 'needle' | 'semi'
export type TopType = 'attack' | 'defense' | 'stamina' | 'balance'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BeastId = 'voltfang' | 'aegiron' | 'nagara' | 'agnyx' | 'zephyra' | 'umbrax'
export const BEAST_IDS: readonly BeastId[] = ['voltfang', 'aegiron', 'nagara', 'agnyx', 'zephyra', 'umbrax']
export const STARTER_BEASTS: readonly BeastId[] = ['voltfang', 'aegiron', 'nagara', 'agnyx']

export interface Blade { id: string; name: string; attack: number; defense: number; shatterRes: number; rarity: Rarity }
export interface Disc { id: string; name: string; mass: number; rim: number; rarity: Rarity }
export interface Tip { id: string; name: string; kind: TipKind; driveMod: number; decayMod: number; rarity: Rarity }
export interface PartLevels { blade?: number; disc?: number; tip?: number }
export interface BeastKit { trait?: boolean; ultimate?: boolean }
export interface TopBuild { bladeId: string; discId: string; tipId: string; beastId: BeastId; levels?: PartLevels; kit?: BeastKit; launcher?: string }

export interface TopStats { attack: number; defense: number; stamina: number; speed: number }
export interface TopSpec extends TopBuild {
  type: TopType
  stats: TopStats
  mass: number
  radius: number
  shatterRes: number
  tip: TipKind
  driveMod: number
  decayMod: number
  trait: boolean
  ultimate: boolean
}

const blade = (id: string, name: string, attack: number, defense: number, shatterRes: number, rarity: Rarity): Blade =>
  ({ id, name, attack, defense, shatterRes, rarity })
const disc = (id: string, name: string, mass: number, rim: number, rarity: Rarity): Disc => ({ id, name, mass, rim, rarity })
const tip = (id: string, name: string, kind: TipKind, driveMod: number, decayMod: number, rarity: Rarity): Tip =>
  ({ id, name, kind, driveMod, decayMod, rarity })

// Blade budget: attack + defense + shatterRes = 16.
export const BLADES: Record<string, Blade> = Object.fromEntries([
  blade('fang', 'Fang Edge', 9, 3, 4, 'common'),
  blade('bastion', 'Bastion Hex', 3, 8, 5, 'common'),
  blade('crescent', 'Crescent Veil', 4, 5, 7, 'common'),
  blade('wing', 'Sun Wing', 6, 5, 5, 'common'),
  blade('saw', 'Storm Saw', 10, 2, 4, 'rare'),
  blade('dome', 'Iron Dome', 2, 9, 5, 'rare'),
  blade('halo', 'Halo Ring', 6, 6, 4, 'epic'),
  blade('tempest', 'Tempest Crown', 8, 4, 4, 'legendary'),
  blade('fury', 'Crimson Fury', 10, 3, 3, 'epic'),
  blade('gale', 'Gale Talon', 8, 4, 4, 'rare'),
  blade('prism', 'Bulwark Prism', 2, 10, 4, 'epic'),
  blade('eclipse', 'Eclipse Shard', 5, 4, 7, 'rare'),
  blade('spiral', 'Thunder Spiral', 9, 3, 4, 'rare'),
  blade('guard', 'Moon Guard', 3, 7, 6, 'common'),
  blade('spark', 'Spark Edge', 5, 1, 2, 'common'),
  blade('pebble', 'Pebble Shell', 2, 5, 2, 'common'),
  blade('ripple', 'Ripple Veil', 1, 3, 5, 'common'),
  blade('ember', 'Ember Wing', 4, 4, 3, 'common'),
].map(b => [b.id, b]))

export const DISCS: Record<string, Disc> = Object.fromEntries([
  disc('standard', 'Standard', 1.0, 0.5, 'common'),
  disc('heavy', 'Heavy', 1.25, 0.5, 'common'),
  disc('rim', 'Rim Weight', 1.1, 0.9, 'common'),
  disc('compact', 'Compact', 0.85, 0.3, 'rare'),
  disc('orbit', 'Orbit Ring', 1.15, 0.75, 'epic'),
  disc('titan', 'Titan Core', 1.4, 0.5, 'epic'),
  disc('feather', 'Feather Disc', 0.75, 0.35, 'rare'),
  disc('gyro', 'Gyro Rim', 1.05, 1.0, 'epic'),
].map(d => [d.id, d]))

export const TIPS: Record<string, Tip> = Object.fromEntries([
  tip('flat', 'Flat', 'flat', 1, 1, 'common'),
  tip('ball', 'Ball', 'ball', 1, 1, 'common'),
  tip('needle', 'Needle', 'needle', 1, 1, 'common'),
  tip('semi', 'Semi', 'semi', 1, 1, 'common'),
  tip('rush', 'Rush', 'flat', 1.12, 1.08, 'rare'),   // faster, burns spin faster
  tip('orb', 'Orb', 'ball', 0.9, 0.94, 'epic'),      // steadier, slower
  tip('spike', 'Spike', 'needle', 0.9, 0.88, 'rare'),
  tip('grip', 'Grip Flat', 'flat', 1.1, 1.0, 'epic'),
  tip('wide', 'Wide Ball', 'ball', 0.95, 0.97, 'rare'),
  tip('rookie-flat', 'Rookie Flat', 'flat', 0.7, 1.14, 'common'),
  tip('rookie-ball', 'Rookie Ball', 'ball', 0.9, 1.08, 'common'),
  tip('rookie-needle', 'Rookie Needle', 'needle', 0.8, 1.18, 'common'),
  tip('rookie-semi', 'Rookie Semi', 'semi', 0.85, 1.14, 'common'),
].map(t => [t.id, t]))

export const STARTER_BUILDS: Record<BeastId, TopBuild> = {
  voltfang: { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' },
  aegiron: { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' },
  nagara: { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' },
  agnyx: { bladeId: 'wing', discId: 'heavy', tipId: 'semi', beastId: 'agnyx' },
  zephyra: { bladeId: 'gale', discId: 'standard', tipId: 'needle', beastId: 'zephyra' },
  umbrax: { bladeId: 'eclipse', discId: 'gyro', tipId: 'semi', beastId: 'umbrax' },
}

export const ROOKIE_BUILDS: Record<BeastId, TopBuild> = {
  voltfang: { bladeId: 'spark', discId: 'compact', tipId: 'rookie-flat', beastId: 'voltfang' },
  aegiron: { bladeId: 'pebble', discId: 'rim', tipId: 'rookie-ball', beastId: 'aegiron' },
  nagara: { bladeId: 'ripple', discId: 'standard', tipId: 'rookie-needle', beastId: 'nagara' },
  agnyx: { bladeId: 'ember', discId: 'heavy', tipId: 'rookie-semi', beastId: 'agnyx' },
  zephyra: { bladeId: 'gale', discId: 'standard', tipId: 'needle', beastId: 'zephyra' },
  umbrax: { bladeId: 'eclipse', discId: 'gyro', tipId: 'semi', beastId: 'umbrax' },
}

const TIP_STAMINA: Record<TipKind, number> = { flat: 3, ball: 5, needle: 7, semi: 5 }
const TIP_SPEED: Record<TipKind, number> = { flat: 9, ball: 3, needle: 2, semi: 6 }
const clampStat = (v: number) => Math.max(1, Math.min(10, Math.round(v)))

export function topType(b: Blade, kind: TipKind): TopType {
  if (kind === 'needle') return 'stamina'
  if (b.attack >= b.defense + 2 && (kind === 'flat' || kind === 'semi')) return 'attack'
  if (b.defense >= b.attack + 2 && (kind === 'ball' || kind === 'semi')) return 'defense'
  return 'balance'
}

function need<T>(table: Record<string, T>, id: string, what: string): T {
  if (!Object.hasOwn(table, id)) throw new Error(`unknown ${what} id: ${id}`)
  return table[id] as T
}

export const MAX_PART_LEVEL = 5
export const SPILL: Record<keyof TopStats, keyof TopStats> = { attack: 'speed', defense: 'stamina', stamina: 'defense', speed: 'attack' }
const lvl = (v: number | undefined) => (Number.isFinite(v) ? Math.max(1, Math.min(MAX_PART_LEVEL, Math.floor(v!))) - 1 : 0)
export const bladePrimary = (b: Blade): keyof TopStats => (b.defense > b.attack ? 'defense' : 'attack')
export const discPrimary = (d: Disc): keyof TopStats => (d.mass >= 1.15 ? 'defense' : d.rim >= 0.75 ? 'stamina' : 'speed')
export const tipPrimary = (t: Tip): keyof TopStats => (t.kind === 'needle' || t.kind === 'ball' ? 'stamina' : 'speed')

export function assembleTop(build: TopBuild): TopSpec {
  const b = need(BLADES, build.bladeId, 'blade')
  const d = need(DISCS, build.discId, 'disc')
  const t = need(TIPS, build.tipId, 'tip')
  if (!BEAST_IDS.includes(build.beastId)) throw new Error(`unknown beast id: ${build.beastId}`)
  const raw: TopStats = {
    attack: b.attack + (t.kind === 'flat' ? 1 : 0),
    defense: b.defense + (d.mass - 1) * 4,
    stamina: TIP_STAMINA[t.kind] + d.rim * 3 - (t.decayMod - 1) * 10,
    speed: TIP_SPEED[t.kind] - (d.mass - 1) * 6 + (t.driveMod - 1) * 10,
  }
  const stats: TopStats = { attack: clampStat(raw.attack), defense: clampStat(raw.defense), stamina: clampStat(raw.stamina), speed: clampStat(raw.speed) }
  const boost = (k: keyof TopStats, points: number) => {
    const into = Math.min(points, 10 - stats[k])
    stats[k] += into
    const rest = points - into, s2 = SPILL[k]
    stats[s2] = Math.min(10, stats[s2] + rest)
  }
  boost(bladePrimary(b), lvl(build.levels?.blade))
  boost(discPrimary(d), lvl(build.levels?.disc))
  boost(tipPrimary(t), lvl(build.levels?.tip))
  return {
    ...build,
    type: topType(b, t.kind),
    stats,
    mass: d.mass,
    radius: 0.11,
    shatterRes: b.shatterRes,
    tip: t.kind,
    driveMod: t.driveMod,
    decayMod: t.decayMod,
    trait: build.kit?.trait === true,
    ultimate: build.kit?.ultimate === true,
  }
}
