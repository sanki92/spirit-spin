import {
  applyBattle, applyQuestProgress, applyReply, dailyQuests, levelForXp, matchRewards, newBeast, STARTER_BUILDS,
  type BattleSummary, type BeastId, type BeastState, type Change, type MatchSummary, type Quest, type Reply, type TopBuild,
} from '@spirit/core'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface Settings { inputMode: 'auto' | 'swipe'; silentSpirit: boolean; sound: boolean; haptics: boolean; reducedMotion: boolean }
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
  settings: { inputMode: 'auto', silentSpirit: false, sound: true, haptics: true, reducedMotion: false },
  onboarded: { safety: false, calibrated: false, firstBattle: false },
  stats: { battles: 0, wins: 0, bestRpm: 0 },
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
        set({ coins: s.coins + q.reward, quests: { ...s.quests, claimed: [...s.quests.claimed, id] } })
        return q.reward
      },
      patchSettings: p => set(s => ({ settings: { ...s.settings, ...p } })),
      markOnboarded: k => set(s => ({ onboarded: { ...s.onboarded, [k]: true } })),
      reset: () => set(fresh()),
    }),
    {
      name: 'spirit.save',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: s => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as unknown as SaveData,
      migrate: (persisted, version) => (version < 1 ? { ...fresh(), ...(persisted as object) } : (persisted as SaveData)),
    },
  ),
)

export const level = () => levelForXp(useSave.getState().xp)
