import type { BotBrain } from './bot'
import type { BeastId, TopBuild } from './parts'

export type BossId = 'kaze' | 'mira' | 'brick' | 'vex' | 'ren'

export interface Boss { id: BossId; name: string; title: string; build: TopBuild; brain: BotBrain }

export const BOSSES: Record<BossId, Boss> = {
  kaze: { id: 'kaze', name: 'Kaze', title: 'The Cocky Rival', build: { bladeId: 'wing', discId: 'standard', tipId: 'semi', beastId: 'agnyx' }, brain: { skill: 0.42, aggression: 0.75, reaction: 40 } },
  mira: { id: 'mira', name: 'Mira', title: 'Moonlit Patience', build: { bladeId: 'crescent', discId: 'rim', tipId: 'needle', beastId: 'nagara' }, brain: { skill: 0.58, aggression: 0.25, reaction: 28 } },
  brick: { id: 'brick', name: 'Brick', title: 'The Wall', build: { bladeId: 'dome', discId: 'heavy', tipId: 'ball', beastId: 'aegiron' }, brain: { skill: 0.7, aggression: 0.3, reaction: 22 } },
  vex: { id: 'vex', name: 'Vex', title: 'Glitch in the Arena', build: { bladeId: 'gale', discId: 'compact', tipId: 'rush', beastId: 'zephyra', kit: { trait: true } }, brain: { skill: 0.82, aggression: 0.9, reaction: 14 } },
  ren: { id: 'ren', name: 'Ren', title: 'Reigning Champion', build: { bladeId: 'tempest', discId: 'orbit', tipId: 'semi', beastId: 'umbrax', kit: { trait: true, ultimate: true } }, brain: { skill: 0.95, aggression: 0.7, reaction: 8 } },
}

const BOSS_AT: Record<number, BossId> = { 10: 'kaze', 20: 'mira', 30: 'brick', 40: 'vex', 50: 'ren' }
const ROTATION: { blade: string; disc: string; tip: string; beast: BeastId }[] = [
  { blade: 'fang', disc: 'standard', tip: 'flat', beast: 'voltfang' },
  { blade: 'bastion', disc: 'heavy', tip: 'ball', beast: 'aegiron' },
  { blade: 'crescent', disc: 'rim', tip: 'needle', beast: 'nagara' },
  { blade: 'wing', disc: 'standard', tip: 'semi', beast: 'agnyx' },
  { blade: 'saw', disc: 'compact', tip: 'rush', beast: 'voltfang' },
  { blade: 'dome', disc: 'heavy', tip: 'orb', beast: 'aegiron' },
  { blade: 'halo', disc: 'orbit', tip: 'semi', beast: 'agnyx' },
  { blade: 'spiral', disc: 'standard', tip: 'grip', beast: 'voltfang' },
  { blade: 'guard', disc: 'titan', tip: 'wide', beast: 'aegiron' },
  { blade: 'gale', disc: 'standard', tip: 'semi', beast: 'zephyra' },
  { blade: 'eclipse', disc: 'gyro', tip: 'spike', beast: 'umbrax' },
]
const PART_DROPS: Record<number, { kind: 'blade' | 'disc' | 'tip'; id: string }> = {
  3: { kind: 'blade', id: 'guard' }, 5: { kind: 'tip', id: 'rush' }, 7: { kind: 'disc', id: 'feather' }, 10: { kind: 'disc', id: 'compact' },
  13: { kind: 'blade', id: 'spiral' }, 15: { kind: 'blade', id: 'saw' }, 17: { kind: 'tip', id: 'wide' }, 20: { kind: 'tip', id: 'orb' },
23: { kind: 'blade', id: 'gale' }, 25: { kind: 'blade', id: 'dome' }, 27: { kind: 'tip', id: 'spike' },
  30: { kind: 'disc', id: 'orbit' }, 33: { kind: 'blade', id: 'eclipse' }, 35: { kind: 'disc', id: 'gyro' }, 37: { kind: 'blade', id: 'prism' },
  40: { kind: 'blade', id: 'halo' }, 43: { kind: 'tip', id: 'grip' }, 45: { kind: 'disc', id: 'titan' }, 47: { kind: 'blade', id: 'fury' },
  50: { kind: 'blade', id: 'tempest' },
}
const BEAST_AT: Record<number, BeastId> = { 40: 'zephyra', 50: 'umbrax' }

export const TOWER_FLOORS = 50

export interface TowerFloor {
  floor: number
  opponent: TopBuild
  brain: BotBrain
  boss: BossId | null
  reward: { coins: number; shards: number; part: { kind: 'blade' | 'disc' | 'tip'; id: string } | null; unlocksBeastSlot: boolean; beast: BeastId | null }
}

export function towerFloor(n: number): TowerFloor {
  if (!Number.isInteger(n) || n < 1 || n > TOWER_FLOORS) throw new Error(`tower floor out of range: ${n}`)
  const bossId = BOSS_AT[n] ?? null
  const reward = { coins: 40 + n * 4 + (bossId ? 200 : 0), shards: 5 + Math.floor(n / 5) + (bossId ? 60 : 0), part: PART_DROPS[n] ?? null, unlocksBeastSlot: n === 10 || n === 20 || n === 30, beast: BEAST_AT[n] ?? null }
  if (bossId) {
    const b = BOSSES[bossId]
    return { floor: n, opponent: b.build, brain: b.brain, boss: bossId, reward }
  }
  const pool = ROTATION.slice(0, Math.min(ROTATION.length, 4 + Math.floor(n / 12)))
  const r = pool[(n * 7) % pool.length] as (typeof ROTATION)[number]
  const k = (n - 1) / (TOWER_FLOORS - 1)
  const brain: BotBrain = { skill: 0.15 + 0.78 * k ** 0.85, aggression: 0.35 + ((n * 37) % 50) / 100, reaction: Math.round(90 - 78 * k) }
  return { floor: n, opponent: { bladeId: r.blade, discId: r.disc, tipId: r.tip, beastId: r.beast, ...(n > 25 ? { kit: { trait: true } } : {}) }, brain, boss: null, reward }
}
