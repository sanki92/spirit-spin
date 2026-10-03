import {
  applyBattle, applyQuestProgress, MAX_PART_LEVEL, partKey, progressBuild, SHARDS, TRAIT_COST, upgradeCost, type PartKind, COSMETICS, FREE_COSMETICS, PASS, PASS_TIERS, passTier, applyReply, dailyQuests, levelForXp, matchRewards, newBeast, STARTER_BUILDS,
  type BattleSummary, type BeastId, type BeastState, type Change, type MatchSummary, type Mood, type Quest, type Reply, type TopBuild,
} from '@spirit/core'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface Settings { inputMode: 'auto' | 'swipe'; silentSpirit: boolean; sound: boolean; haptics: boolean; reducedMotion: boolean; commentator?: boolean }
export interface Owned { blades: string[]; discs: string[]; tips: string[] }

export interface SaveData {
  version: 1
  birthYear: number | null
  name: string
  avatar: number
  xp: number
  coins: number
  starter: BeastId | null
  beasts: Partial<Record<BeastId, BeastState>>
  owned: Owned
  loadout: TopBuild | null
  tower: number
  quests: { date: string; list: Quest[]; claimed: string[] }
  settings: Settings
  onboarded: { safety: boolean; calibrated: boolean; firstBattle: boolean }
  stats: { battles: number; wins: number; bestRpm: number }
  greet: { day: string; beast: BeastId; line: string; mood: Mood } | null
  cosmetics: { frame: string; title: string; launcher: string | null; stadium: string }
  unlocks: string[]
  entitlements: string[]
  pass: { season: string; baseXp: number; free: number[]; premium: number[] }
  shards: number
  partLevels: Record<string, number>
  traits: BeastId[]
  dailyWin: string
  outros: number[]
}

export interface SaveActions {
  setBirthYear(y: number): void
  chooseStarter(id: BeastId): void
  unlockBeast(id: BeastId): void
  setLoadout(b: TopBuild): void
  addPart(kind: keyof Owned, id: string): void
  spend(coins: number): boolean
  recordMatch(m: MatchSummary & { bestRpm: number }, beast: BattleSummary | null, towerFloorCleared: number | null): { coins: number; xp: number; changes: Change[] }
  reply(r: Reply): Change[]
  setBeast(b: BeastState): void
  refreshQuests(): void
  claimQuest(id: string): number
  patchSettings(p: Partial<Settings>): void
  markOnboarded(k: keyof SaveData['onboarded']): void
  setName(name: string): void
  setAvatar(n: number): void
  setCosmetic(kind: 'frame' | 'title' | 'launcher' | 'stadium', id: string): void
  setEntitlements(items: string[]): void
  claimPass(track: 'free' | 'premium', tier: number): boolean
  ensurePass(): void
  addShards(n: number): void
  upgradePart(kind: PartKind, id: string): boolean
  buyTrait(id: BeastId): boolean
  reset(): void
}

const fresh = (): SaveData => ({
  version: 1,
  birthYear: null,
  name: 'Spinner',
  avatar: 0,
  xp: 0,
  coins: 150,
  starter: null,
  beasts: {},
  owned: { blades: [], discs: [], tips: [] },
  loadout: null,
  tower: 0,
  quests: { date: '', list: [], claimed: [] },
  settings: { inputMode: 'auto', silentSpirit: false, sound: true, haptics: true, reducedMotion: false, commentator: true },
  onboarded: { safety: false, calibrated: false, firstBattle: false },
  stats: { battles: 0, wins: 0, bestRpm: 0 },
  greet: null,
  cosmetics: { frame: 'frame-common', title: 'title-rookie', launcher: null, stadium: 'stadium-classic' },
  unlocks: [],
  entitlements: [],
  pass: { season: PASS.season, baseXp: -1, free: [], premium: [] },
  shards: 0,
  partLevels: {},
  traits: [],
  dailyWin: '',
  outros: [],
})

const addUnique = (list: string[], id: string) => (list.includes(id) ? list : [...list, id])

export const useSave = create<SaveData & SaveActions>()(
  persist(
    (set, get) => ({
      ...fresh(),
      setBirthYear: y => set({ birthYear: y }),
      chooseStarter: id => {
        const b = STARTER_BUILDS[id]
        set(s => ({
          starter: id,
          beasts: { ...s.beasts, [id]: newBeast(id, true) },
          owned: { blades: addUnique(s.owned.blades, b.bladeId), discs: addUnique(s.owned.discs, b.discId), tips: addUnique(s.owned.tips, b.tipId) },
          loadout: b,
        }))
      },
      unlockBeast: id => {
        const b = STARTER_BUILDS[id]
        set(s =>
          s.beasts[id]
            ? s
            : {
                beasts: { ...s.beasts, [id]: newBeast(id, false) },
                owned: { blades: addUnique(s.owned.blades, b.bladeId), discs: addUnique(s.owned.discs, b.discId), tips: addUnique(s.owned.tips, b.tipId) },
              },
        )
      },
      setLoadout: b => set({ loadout: b }),
      addPart: (kind, id) => set(s => ({ owned: { ...s.owned, [kind]: addUnique(s.owned[kind], id) } })),
      spend: coins => {
        if (get().coins < coins) return false
        set(s => ({ coins: s.coins - coins }))
        return true
      },
      recordMatch: (m, beastSummary, cleared) => {
        const r = matchRewards(m)
        const s = get()
        let changes: Change[] = []
        const beastId = s.loadout?.beastId
        const beasts = { ...s.beasts }
        if (beastId && beastSummary && beasts[beastId]) {
          const res = applyBattle(beasts[beastId] as BeastState, beastSummary, todayKey())
          beasts[beastId] = res.beast
          changes = res.changes
        }
        set({
          coins: s.coins + r.coins,
          xp: s.xp + r.xp,
          beasts,
          tower: cleared !== null && m.won ? Math.max(s.tower, cleared) : s.tower,
          quests: { ...s.quests, list: applyQuestProgress(s.quests.list, m) },
          stats: { battles: s.stats.battles + 1, wins: s.stats.wins + (m.won ? 1 : 0), bestRpm: Math.max(s.stats.bestRpm, m.bestRpm) },
        })
        return { ...r, changes }
      },
      reply: r => {
        const s = get()
        const id = s.loadout?.beastId
        const b = id ? s.beasts[id] : undefined
        if (!id || !b) return []
        const res = applyReply(b, r, todayKey())
        set({ beasts: { ...s.beasts, [id]: res.beast } })
        return res.changes
      },
      setBeast: b => set(s => ({ beasts: { ...s.beasts, [b.id]: b } })),
      refreshQuests: () => {
        const today = todayKey()
        if (get().quests.date !== today) set({ quests: { date: today, list: dailyQuests(today), claimed: [] } })
      },
      claimQuest: id => {
        const s = get()
        const q = s.quests.list.find(x => x.id === id)
        if (!q || q.progress < q.target || s.quests.claimed.includes(id)) return 0
        set({ coins: s.coins + q.reward, shards: (s.shards ?? 0) + SHARDS.quest, quests: { ...s.quests, claimed: [...s.quests.claimed, id] } })
        return q.reward
      },
      patchSettings: p => set(s => ({ settings: { ...s.settings, ...p } })),
      markOnboarded: k => set(s => ({ onboarded: { ...s.onboarded, [k]: true } })),
      setName: name => set({ name: name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'Spinner' }),
      setAvatar: n => set(s => (ownsCosmetic(s, `avatar-${n + 1}`) ? { avatar: n } : {})),
      setCosmetic: (kind, id) => set(s => (ownsCosmetic(s, id) && COSMETICS[id]?.kind === kind ? { cosmetics: { ...(s.cosmetics ?? fresh().cosmetics), [kind]: id } } : {})),
      setEntitlements: items => set({ entitlements: items }),
      ensurePass: () => {
        const s = get()
        if (s.pass?.season !== PASS.season || s.pass.baseXp < 0) set({ pass: { season: PASS.season, baseXp: s.xp, free: [], premium: [] } })
      },
      claimPass: (track, tier) => {
        get().ensurePass()
        const s = get()
        const pass = s.pass
        const t = PASS_TIERS[tier - 1]
        if (!t || tier > passTier(s.xp - pass.baseXp) || pass[track].includes(tier)) return false
        if (track === 'premium' && !(s.entitlements ?? []).includes('pass-s1')) return false
        const reward = t[track]
        const patch: Partial<SaveData> = { pass: { ...pass, [track]: [...pass[track], tier] } }
        if ('coins' in reward) patch.coins = s.coins + reward.coins
        if ('cosmetic' in reward) patch.unlocks = [...new Set([...(s.unlocks ?? []), reward.cosmetic])]
        set(patch)
        if ('part' in reward) get().addPart(`${reward.part.kind}s` as keyof Owned, reward.part.id)
        return true
      },
      addShards: n => set(s => ({ shards: (s.shards ?? 0) + n })),
      upgradePart: (kind, id) => {
        const s = get()
        const key = partKey(kind, id)
        const lv = s.partLevels?.[key] ?? 1
        const cost = upgradeCost(lv)
        if (cost === null || lv >= MAX_PART_LEVEL || (s.shards ?? 0) < cost || !s.owned[`${kind}s`].includes(id)) return false
        set({ shards: s.shards - cost, partLevels: { ...s.partLevels, [key]: lv + 1 } })
        return true
      },
      buyTrait: id => {
        const s = get()
        if (!s.beasts[id] || (s.traits ?? []).includes(id) || (s.shards ?? 0) < TRAIT_COST) return false
        set({ shards: s.shards - TRAIT_COST, traits: [...(s.traits ?? []), id] })
        return true
      },
      reset: () => set(fresh()),
    }),
    {
      name: 'spirit.save',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: s => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as unknown as SaveData,
      migrate: (persisted, version) => (version < 2 ? { ...fresh(), ...(persisted as object) } : (persisted as SaveData)),
    },
  ),
)

export const level = () => levelForXp(useSave.getState().xp)

export const progress = (s: Pick<SaveData, 'partLevels' | 'traits'>) => ({ partLevels: s.partLevels ?? {}, traits: s.traits ?? [] })
export const storyBuild = (s: SaveData, build: TopBuild) => progressBuild(build, progress(s), s.beasts[build.beastId])

export function ownsCosmetic(s: Pick<SaveData, 'unlocks' | 'entitlements' | 'starter' | 'tower'>, id: string): boolean {
  if (FREE_COSMETICS.includes(id)) return true
  if (s.starter && id === `launcher-${s.starter}`) return true
  if (id === 'title-climber' && s.tower >= 10) return true
  return (s.unlocks ?? []).includes(id) || (s.entitlements ?? []).includes(id)
}
