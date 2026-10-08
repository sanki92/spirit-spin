import type { BeastId, BeastKit, TopBuild } from './parts'
import type { BeastState } from './spirit'
import type { BossId } from './tower'

export const UPGRADE_COST = [20, 40, 80, 160] as const
export const TRAIT_COST = 50
export const TRAIT_TRUST = 30
export const SHARDS = { quest: 10, dailyWin: 15, duplicate: 25 } as const

export const upgradeCost = (level: number) => UPGRADE_COST[level - 1] ?? null

export interface Ability { name: string; text: string }
export interface BeastKitInfo { technique: Ability; trait: Ability; ultimate: Ability }

export const TECHNIQUES: Record<BeastId, BeastKitInfo> = {
  voltfang: {
    technique: { name: 'Thunder Fang Rush', text: 'Your wolf takes over and dashes at the rival three times. Every hit knocks them back a little harder, cracks them much faster, and locks them in place for a moment.' },
    trait: { name: 'Static Charge', text: 'Clashes fill your Spirit gauge 20% faster.' },
    ultimate: { name: 'Storm Fang', text: 'Each lock lasts three times as long.' },
  },
  aegiron: {
    technique: { name: 'Bastion Slam', text: 'Your golem plants the top in the center behind a crystal shield, then slams the ground and blasts the rival toward the wall.' },
    trait: { name: 'Bedrock', text: 'Much harder to knock out of the stadium.' },
    ultimate: { name: 'Mirror Bastion', text: 'The blast hits 25% harder and the shield throws rivals back harder.' },
  },
  nagara: {
    technique: { name: 'Tidal Coil', text: 'Your serpent circles the rival in a tightening spiral, draining their spin into yours, then throws them outward.' },
    trait: { name: 'Ebb', text: 'Your spin fades 8% slower.' },
    ultimate: { name: 'Eclipse Coil', text: 'The coil drains 25% more spin.' },
  },
  agnyx: {
    technique: { name: 'Phoenix Dive', text: 'Your phoenix rises, then dives onto the rival, stealing spin and leaving them burning.' },
    trait: { name: 'Embers', text: 'When your spin drops low, your hits get 25% stronger.' },
    ultimate: { name: 'Rebirth Flame', text: 'The dive steals twice as much spin.' },
  },
  zephyra: {
    technique: { name: 'Cyclone Pull', text: 'Your storm spirit takes the center and drags the rival in with a vortex, then flings them toward the edge.' },
    trait: { name: 'Tailwind', text: 'Your top speed is 8% higher.' },
    ultimate: { name: 'Eye of the Storm', text: 'The final fling is 25% stronger.' },
  },
  umbrax: {
    technique: { name: 'Shadow Pounce', text: 'Your lion melts into shadow, appears behind the rival and strikes twice.' },
    trait: { name: 'Ambush', text: 'Your first clash each round hits 25% harder.' },
    ultimate: { name: 'Twin Shadows', text: 'Three strikes instead of two.' },
  },
}

export interface Chapter {
  id: number
  title: string
  floors: [number, number]
  boss: BossId
  intro: string[]
  outro: string[]
  unlocks: string[]
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1, title: 'The Cocky Rival', floors: [1, 10], boss: 'kaze',
    intro: ["So you're the new spinner everyone's whispering about?", "My Agnyx doesn't lose to rookies. Let it rip!"],
    outro: ["...Okay. That launch was real.", "Keep climbing. I'll catch up. I always do."],
    unlocks: ['A second spirit beast', 'Moon Guard blade', 'Rush tip, Feather and Compact discs'],
  },
  {
    id: 2, title: 'Moonlit Patience', floors: [11, 20], boss: 'mira',
    intro: ['Rushing is a habit. Habits are easy to read.', 'Show me you can wait.'],
    outro: ['You found the stillness inside the storm.', 'The moon remembers patient spinners.'],
    unlocks: ['A third spirit beast', 'Storm Saw and Thunder Spiral blades', 'Wide Ball and Orb tips'],
  },
  {
    id: 3, title: 'The Wall', floors: [21, 30], boss: 'brick',
    intro: ['Nobody has knocked me out of a stadium. Ever.', 'Hit me. Go on.'],
    outro: ["Huh. I moved.", 'Nobody has made me move in years. Respect.'],
    unlocks: ['The fourth starter beast', 'Gale Talon and Iron Dome blades', 'Spike tip, Orbit Ring disc'],
  },
  {
    id: 4, title: 'Glitch in the Arena', floors: [31, 40], boss: 'vex',
    intro: ['I caught a storm griffin in my top. Wild, untamed, PERFECT.', "Zephyra obeys me now. Watch her pull you apart."],
    outro: ['No... she is turning toward YOU.', "Fine. Take the storm. She never liked my cage anyway."],
    unlocks: ['Zephyra, the storm griffin', 'Eclipse Shard, Bulwark Prism and Halo Ring blades', 'Gyro Rim disc'],
  },
  {
    id: 5, title: 'Reigning Champion', floors: [41, 50], boss: 'ren',
    intro: ['Every champion before you stopped here.', 'Umbrax and I have never been seen coming.'],
    outro: ['The shadow chose you mid-battle. That has never happened.', 'The title is yours. So is Umbrax. Guard them both.'],
    unlocks: ['Umbrax, the shadow panther', 'Crimson Fury and Tempest Crown blades', 'Grip Flat tip, Titan Core disc'],
  },
]

export const chapterOf = (floor: number) => CHAPTERS.find(c => floor >= c.floors[0] && floor <= c.floors[1]) ?? CHAPTERS[CHAPTERS.length - 1]!

export type PartKind = 'blade' | 'disc' | 'tip'
export const partKey = (kind: PartKind, id: string) => `${kind}:${id}`
export interface Progress { partLevels: Record<string, number>; traits: BeastId[] }

export function kitFor(id: BeastId, p: Progress, beast: Pick<BeastState, 'trust' | 'awakened'> | undefined): BeastKit {
  return { trait: p.traits.includes(id) || (beast?.trust ?? 0) >= TRAIT_TRUST, ultimate: !!beast?.awakened }
}

export function progressBuild(build: TopBuild, p: Progress, beast: Pick<BeastState, 'trust' | 'awakened'> | undefined): TopBuild {
  const lv = (k: PartKind, id: string) => p.partLevels[partKey(k, id)] ?? 1
  return { ...build, levels: { blade: lv('blade', build.bladeId), disc: lv('disc', build.discId), tip: lv('tip', build.tipId) }, kit: kitFor(build.beastId, p, beast) }
}

export interface DailyReward { coins?: number; shards?: number }
export const DAILY_TRACK: DailyReward[] = [{ coins: 60 }, { shards: 10 }, { coins: 90 }, { shards: 15 }, { coins: 130 }, { shards: 25 }, { coins: 200, shards: 60 }]
export const LEVEL_UP_SHARDS = 10
export const winStreakBonus = (streak: number) => Math.min(0.5, Math.max(0, streak - 1) * 0.1)

const dayBefore = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function loginState(last: string, streak: number, today: string): { day: number; canClaim: boolean } {
  if (last === today) return { day: Math.max(1, streak), canClaim: false }
  const continues = last !== '' && last === dayBefore(today) && streak < DAILY_TRACK.length
  return { day: continues ? streak + 1 : 1, canClaim: true }
}
