/**
 * Parts catalog and top assembly. A top = Blade + Disc + Tip, with a spirit beast mounted on the disc's chip.
 * Rarity marks how hard a part is to earn, never raw power: every blade spends the same stat budget (spec §9).
 */
export type TipKind = 'flat' | 'ball' | 'needle' | 'semi'
export type TopType = 'attack' | 'defense' | 'stamina' | 'balance'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BeastId = 'voltfang' | 'aegiron' | 'nagara' | 'agnyx'
export const BEAST_IDS: readonly BeastId[] = ['voltfang', 'aegiron', 'nagara', 'agnyx']

export interface Blade { id: string; name: string; attack: number; defense: number; shatterRes: number; rarity: Rarity }
export interface Disc { id: string; name: string; mass: number; rim: number; rarity: Rarity }
export interface Tip { id: string; name: string; kind: TipKind; driveMod: number; decayMod: number; rarity: Rarity }
export interface TopBuild { bladeId: string; discId: string; tipId: string; beastId: BeastId }

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
].map(b => [b.id, b]))

export const DISCS: Record<string, Disc> = Object.fromEntries([
  disc('standard', 'Standard', 1.0, 0.5, 'common'),
  disc('heavy', 'Heavy', 1.25, 0.5, 'common'),
  disc('rim', 'Rim Weight', 1.1, 0.9, 'common'),
  disc('compact', 'Compact', 0.85, 0.3, 'rare'),
  disc('orbit', 'Orbit Ring', 1.15, 0.75, 'epic'),
].map(d => [d.id, d]))

export const TIPS: Record<string, Tip> = Object.fromEntries([
  tip('flat', 'Flat', 'flat', 1, 1, 'common'),
  tip('ball', 'Ball', 'ball', 1, 1, 'common'),
  tip('needle', 'Needle', 'needle', 1, 1, 'common'),
  tip('semi', 'Semi', 'semi', 1, 1, 'common'),
  tip('rush', 'Rush', 'flat', 1.12, 1.08, 'rare'),   // faster, burns spin faster
  tip('orb', 'Orb', 'ball', 0.9, 0.94, 'epic'),      // steadier, slower
].map(t => [t.id, t]))

export const STARTER_BUILDS: Record<BeastId, TopBuild> = {
  voltfang: { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: 'voltfang' },
  aegiron: { bladeId: 'bastion', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' },
  nagara: { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' },
  agnyx: { bladeId: 'wing', discId: 'standard', tipId: 'semi', beastId: 'agnyx' },
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
  const v = table[id]
  if (!v) throw new Error(`unknown ${what} id: ${id}`)
  return v
}

export function assembleTop(build: TopBuild): TopSpec {
  const b = need(BLADES, build.bladeId, 'blade')
  const d = need(DISCS, build.discId, 'disc')
  const t = need(TIPS, build.tipId, 'tip')
  const stats: TopStats = {
    attack: clampStat(b.attack + (t.kind === 'flat' ? 1 : 0)),
    defense: clampStat(b.defense + (d.mass - 1) * 4),
    stamina: clampStat(TIP_STAMINA[t.kind] + d.rim * 3 - (t.decayMod - 1) * 10),
    speed: clampStat(TIP_SPEED[t.kind] - (d.mass - 1) * 6 + (t.driveMod - 1) * 10),
  }
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
  }
}
