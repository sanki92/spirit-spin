import type { BeastId } from './parts'

export type CosmeticKind = 'launcher' | 'stadium' | 'frame' | 'avatar' | 'title'
export interface Cosmetic { id: string; kind: CosmeticKind; name: string; art: string | null }

const BEAST_NAMES: Record<BeastId, string> = { voltfang: 'Voltfang', aegiron: 'Aegiron', nagara: 'Nagara', agnyx: 'Agnyx', zephyra: 'Zephyra', umbrax: 'Umbrax' }

export const COSMETICS: Record<string, Cosmetic> = Object.fromEntries(
  [
    ...(Object.keys(BEAST_NAMES) as BeastId[]).map(b => ({ id: `launcher-${b}`, kind: 'launcher' as const, name: `${BEAST_NAMES[b]} Launcher`, art: `launchers/${b}` })),
    { id: 'stadium-classic', kind: 'stadium' as const, name: 'Classic Arena', art: 'stadium/bowl-classic' },
    { id: 'stadium-volcano', kind: 'stadium' as const, name: 'Volcano Crater', art: 'stadium/bowl-volcano' },
    { id: 'stadium-frozen-moon', kind: 'stadium' as const, name: 'Frozen Moon', art: 'stadium/bowl-frozen-moon' },
    { id: 'frame-common', kind: 'frame' as const, name: 'Steel Frame', art: 'ui/card-frame-common' },
    { id: 'frame-rare', kind: 'frame' as const, name: 'Azure Frame', art: 'ui/card-frame-rare' },
    { id: 'frame-epic', kind: 'frame' as const, name: 'Amethyst Frame', art: 'ui/card-frame-epic' },
    { id: 'frame-legendary', kind: 'frame' as const, name: 'Sunforged Frame', art: 'ui/card-frame-legendary' },
    ...[1, 2, 3, 4, 5, 6].map(n => ({ id: `avatar-${n}`, kind: 'avatar' as const, name: `Spinner ${n}`, art: `characters/avatars/avatar-${n}` })),
    { id: 'title-rookie', kind: 'title' as const, name: 'Rookie Spinner', art: null },
    { id: 'title-climber', kind: 'title' as const, name: 'Tower Climber', art: null },
    { id: 'title-storm', kind: 'title' as const, name: 'Storm Caller', art: null },
    { id: 'title-champion', kind: 'title' as const, name: 'Season One Champion', art: null },
    { id: 'title-legend', kind: 'title' as const, name: 'Spirit Legend', art: null },
  ].map(c => [c.id, c]),
)

export const FREE_COSMETICS = ['stadium-classic', 'frame-common', 'avatar-1', 'avatar-2', 'avatar-3', 'title-rookie']

export type PassReward = { coins: number } | { part: { kind: 'blade' | 'disc' | 'tip'; id: string } } | { cosmetic: string }
export interface PassTier { tier: number; free: PassReward; premium: PassReward }

export const PASS = { season: 's1', name: 'Spirit Pass · Season 1', tiers: 30, xpPerTier: 120 } as const

const FREE: Record<number, PassReward> = {
  5: { part: { kind: 'tip', id: 'rush' } }, 10: { cosmetic: 'frame-rare' }, 15: { part: { kind: 'blade', id: 'saw' } }, 20: { cosmetic: 'avatar-4' },
  25: { part: { kind: 'disc', id: 'compact' } }, 30: { cosmetic: 'title-climber' },
}
const PREMIUM: Record<number, PassReward> = {
  1: { cosmetic: 'launcher-voltfang' }, 3: { cosmetic: 'launcher-aegiron' }, 6: { cosmetic: 'frame-epic' }, 9: { cosmetic: 'launcher-nagara' },
  12: { cosmetic: 'stadium-volcano' }, 15: { cosmetic: 'launcher-agnyx' }, 18: { cosmetic: 'avatar-5' }, 21: { cosmetic: 'title-storm' },
  24: { cosmetic: 'stadium-frozen-moon' }, 27: { cosmetic: 'avatar-6' }, 30: { cosmetic: 'frame-legendary' },
}

export const PASS_TIERS: PassTier[] = Array.from({ length: PASS.tiers }, (_, i) => {
  const tier = i + 1
  return { tier, free: FREE[tier] ?? { coins: 40 + tier * 5 }, premium: PREMIUM[tier] ?? { coins: 60 + tier * 6 } }
})

export const passTier = (passXp: number) => Math.max(0, Math.min(PASS.tiers, Math.floor(Math.max(0, passXp) / PASS.xpPerTier)))

export interface Sku { id: string; name: string; coins: number; grants: string[] }

export const SKUS: Record<string, Sku> = {
  'pass-s1': { id: 'pass-s1', name: 'Spirit Pass · Season 1', coins: 50000, grants: ['pass-s1'] },
  'stadium-volcano': { id: 'stadium-volcano', name: 'Volcano Crater stadium', coins: 30000, grants: ['stadium-volcano'] },
  'stadium-frozen-moon': { id: 'stadium-frozen-moon', name: 'Frozen Moon stadium', coins: 30000, grants: ['stadium-frozen-moon'] },
  'frame-legendary': { id: 'frame-legendary', name: 'Sunforged Frame', coins: 20000, grants: ['frame-legendary'] },
  ...Object.fromEntries((Object.keys(BEAST_NAMES) as BeastId[]).map(b => [`launcher-${b}`, { id: `launcher-${b}`, name: `${BEAST_NAMES[b]} Launcher`, coins: 15000, grants: [`launcher-${b}`] }])),
}
