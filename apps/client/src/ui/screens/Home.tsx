import { BLADES, BOSSES, chapterOf, COSMETICS, DAILY_TRACK, DISCS, loginState, ROOKIE_BUILDS, TIPS, hesitates, levelForXp, towerFloor, TOWER_FLOORS, xpForLevel, type BeastId } from '@spirit/core'
import { FEATURES } from '../../features'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BEASTS } from '../../game/beasts'
import { lineFor } from '../../game/lines'
import { useProfile } from '../../state/profile'
import { useNav } from '../../state/nav'
import { todayKey, useSave } from '../../state/save'
import { spiritMoment } from '../../state/spiritAi'
import { Coins, Img, Screen, Shards } from '../kit'

export function beastArt(id: BeastId, awakened: string | null | undefined): string {
  return awakened ? `beasts/${id}/awakened-${awakened}` : `beasts/${id}`
}

const greeting = new Set<string>()
const partLabel = (name: string, kind: string) => (name.toLowerCase().endsWith(kind) ? name : `${name} ${kind}`)

export function Home() {
  const nav = useNav()
  const s = useSave()
  const invites = useProfile(p => p.invites.length)
  useEffect(() => {
    s.refreshQuests()
    s.ensurePass()
    const id = window.setInterval(() => useSave.getState().refreshQuests(), 60_000)
    return () => window.clearInterval(id)
  }, [s.refreshQuests])
  const beastId = s.loadout?.beastId ?? s.starter ?? 'voltfang'
  const beast = s.beasts[beastId]
  const info = BEASTS[beastId]
  const lvl = levelForXp(s.xp)
  const sulky = !!beast && hesitates(beast)
  const fallbackLine = useMemo(() => lineFor(beastId, sulky ? 'hesitate' : 'greet'), [beastId, sulky])
  const today = todayKey()
  const ai = !sulky && s.greet && s.greet.day === today && s.greet.beast === beastId ? s.greet : null
  const line = ai?.line ?? fallbackLine
  useEffect(() => {
    const b = useSave.getState().beasts[beastId]
    const key = `${today}:${beastId}`
    if (!b || hesitates(b) || ai || greeting.has(key)) return
    greeting.add(key)
    void spiritMoment('greet', b, null, null).then(r => {
      if (r) useSave.setState({ greet: { day: today, beast: beastId, line: r.line, mood: r.mood } })
    })
  }, [beastId, today, ai])
  useEffect(() => {
    const st = useSave.getState()
    const b = st.loadout ?? (st.starter ? ROOKIE_BUILDS[st.starter] : null)
    if (!b) return
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1200))
    idle(() => void import('../TopViewer').then(m => m.prewarmTop(b)).catch(() => undefined))
  }, [])
  const next = Math.min(TOWER_FLOORS, s.tower + 1)
  const floor = towerFloor(next)
  const chapter = chapterOf(next)
  const art = beastArt(beastId, beast?.awakened)
  const first = !s.onboarded.firstBattle
  const quests = s.quests.list
  const doneCount = quests.filter(q => s.quests.claimed.includes(q.id)).length
  const play = () => (first ? nav.push({ k: 'battle', opponent: towerFloor(1).opponent, floor: 1, boss: null, opponentName: 'Floor 1 Spinner' }) : nav.push({ k: 'tower' }))
  const nextUnlock = (() => {
    for (let f = s.tower + 1; f <= TOWER_FLOORS && f <= s.tower + 8; f++) {
      const r = towerFloor(f).reward
      if (r.beast) return { floors: f - s.tower, label: `${r.beast[0]!.toUpperCase()}${r.beast.slice(1)} joins you`, img: `beasts/${r.beast}/emblem` }
      if (r.part) { const t = r.part.kind === 'blade' ? BLADES : r.part.kind === 'disc' ? DISCS : TIPS; return { floors: f - s.tower, label: partLabel(t[r.part.id]?.name ?? r.part.id, r.part.kind), img: `parts/${r.part.kind}-${r.part.id}` } }
      if (r.unlocksBeastSlot) return { floors: f - s.tower, label: 'A new spirit beast', img: null }
    }
    return null
  })()
  const chapterDone = Math.max(0, Math.min(chapter.floors[1], s.tower) - chapter.floors[0] + 1)
  const daily = loginState(s.login?.last ?? '', s.login?.streak ?? 0, today)
  const questReady = quests.some(q => q.progress >= q.target && !s.quests.claimed.includes(q.id))
  const hasName = useProfile(p => p.loaded && !!p.username)
  const [sheet, setSheet] = useState<'daily' | 'quests' | 'modes' | null>(null)
  const [mode, setMode] = useState<Mode>(readMode)
  const pick = (m: Mode) => { setMode(m); modeStore.set(m); setSheet(null) }
  useEffect(() => {
    if (first || !hasName || !daily.canClaim || seenDay === today || seenStore.get() === today) return
    seenDay = today
    seenStore.set(today)
    setSheet('daily')
  }, [first, hasName, daily.canClaim, today])
  const m = first ? 'story' : mode
  const card = MODES.find(x => x.k === m) ?? MODES[0]!
  const go = () => (m === 'story' ? play() : m === 'live' ? nav.push({ k: 'friends' }) : nav.push({ k: m }))
  return (
    <Screen className="home2 home3">
      <div className="h3-stage" style={{ ['--c' as string]: info.color }} aria-hidden="true">
        <Img id={`${art}/card-art`} className="h3-stage-art" fallback={<Img id={`beasts/${beastId}/card-art`} className="h3-stage-art" />} />
      </div>
      <header className="h2-head h3-head">
        <button className="h2-me" onClick={() => nav.push({ k: 'profile' })} aria-label="Open profile">
          <span className={`framed-avatar ${s.cosmetics?.frame ?? 'frame-common'}`}>
            <Img id={`characters/avatars/avatar-${s.avatar + 1}`} className="avatar-img" />
            <Img id={COSMETICS[s.cosmetics?.frame ?? 'frame-common']?.art ?? 'ui/card-frame-common'} className="avatar-frame" />
          </span>
          <span className="h2-id">
            <strong>{s.name}</strong>
            <span><b>Lv {lvl}</b> {COSMETICS[s.cosmetics?.title ?? 'title-rookie']?.name}</span>
            <i className="h2-xp"><i style={{ transform: `scaleX(${Math.min(1, (s.xp - xpForLevel(lvl)) / Math.max(1, xpForLevel(lvl + 1) - xpForLevel(lvl)))})` }} /></i>
          </span>
        </button>
        <div className="h3-corner">
          <div className="wallet"><Shards /><Coins /></div>
          <div className="h3-icons">
            <button className="h3-icon" onClick={() => nav.push({ k: 'shop' })}><Img id="ui/icons/shop" /><span>Shop</span></button>
            <button className="h3-icon" onClick={() => nav.push({ k: 'pass' })}><Img id="ui/icons/pass" /><span>Pass</span></button>
          </div>
        </div>
      </header>

      {!first && (
        <nav className="h3-rail" aria-label="Daily">
          <button className="h3-icon" onClick={() => setSheet('daily')} aria-label={daily.canClaim ? 'Daily reward ready to claim' : 'Daily rewards'}>
            <Img id="ui/icon-coin" /><span>Daily</span>{daily.canClaim && <b className="h3-dot" aria-hidden="true" />}
          </button>
          {quests.length > 0 && (
            <button className="h3-icon" onClick={() => setSheet('quests')} aria-label={`Daily quests, ${doneCount} of ${quests.length} done${questReady ? ', reward ready' : ''}`}>
              <Img id="ui/icons/quests" /><span>{doneCount}/{quests.length}</span>{questReady && <b className="h3-dot" aria-hidden="true" />}
            </button>
          )}
          <button className="h3-icon" onClick={() => nav.push({ k: 'history' })} aria-label="Battle history"><Img id="ui/icons/trophy" /><span>History</span></button>
        </nav>
      )}

      <button className="h3-hero" style={{ ['--c' as string]: info.color }} onClick={() => nav.push({ k: 'journal' })} aria-label={`${info.name}${beast ? `, trust ${beast.trust} of 100` : ''}, open journal`}>
        <span className="h2-kind">{info.title}</span>
        <strong className="h2-name">{info.name}</strong>
        {beast && <span className="h2-trust" role="meter" aria-label="Trust" aria-valuemin={0} aria-valuemax={100} aria-valuenow={beast.trust}><i style={{ transform: `scaleX(${beast.trust / 100})` }} /></span>}
        <span className="h2-line">{line}</span>
      </button>

      <div className="h3-play">
        {!first && (
          <button className="h3-mode" onClick={() => setSheet('modes')} aria-haspopup="dialog" aria-label={`Game mode: ${card.name}. Change mode`}>
            <Img id={card.icon} /><span>{card.name}</span><i aria-hidden="true">▾</i>
          </button>
        )}
        <button className={`h2-story h3-go ${m}`} onClick={go}>
          {m === 'story' ? (
            <>
              <span className="h2-story-face">
                <Img id={floor.boss ? `characters/bosses/${floor.boss}/confident` : `characters/bosses/${chapter.boss}/confident`} />
              </span>
              <span className="h2-story-text">
                <small>{first ? 'Your first battle · Chapter 1' : s.tower >= TOWER_FLOORS ? 'Tower cleared' : `Chapter ${chapter.id} · ${chapter.title}`}</small>
                <strong>{first ? 'Floor 1' : s.tower >= TOWER_FLOORS ? 'Rematch any floor' : floor.boss ? `Boss: ${BOSSES[floor.boss].name}` : `Floor ${next}`}</strong>
                {s.tower < TOWER_FLOORS && <i className="h2-story-bar"><i style={{ transform: `scaleX(${chapterDone / (chapter.floors[1] - chapter.floors[0] + 1)})` }} /></i>}
                {!first && nextUnlock && <span className="h3-next">{nextUnlock.img && <Img id={nextUnlock.img} />}<b>{nextUnlock.label}</b><em>{nextUnlock.floors === 1 ? 'next floor' : `in ${nextUnlock.floors} floors`}</em></span>}
              </span>
              <span className="h2-story-go">Battle</span>
            </>
          ) : (
            <>
              <span className="h2-story-face h3-go-icon"><Img id={card.icon} /></span>
              <span className="h2-story-text"><small>{card.name}</small><strong>{card.cta}</strong><span className="h3-next"><b>{card.sub}</b></span></span>
              <span className="h2-story-go">Play</span>
            </>
          )}
        </button>
      </div>

      <nav className="h2-dock h3-dock" aria-label="Main">
        <button onClick={() => nav.push({ k: 'garage' })}><Img id="ui/icons/garage" /><span>Garage</span></button>
        <button onClick={() => nav.push({ k: 'collection' })}><Img id="ui/icons/collection" /><span>Collection</span></button>
        <button onClick={() => nav.push({ k: 'social' })} aria-label={invites ? `Friends, ${invites} invite${invites > 1 ? 's' : ''}` : 'Friends'}><Img id="ui/icons/live" /><span>Friends</span>{invites > 0 && <b className="dock-badge" aria-hidden="true">{invites}</b>}</button>
        <button onClick={() => nav.push({ k: 'journal' })}><Img id="ui/icons/journal" /><span>Journal</span></button>
      </nav>

      {sheet === 'daily' && <DailySheet onClose={() => setSheet(null)} />}
      {sheet === 'quests' && <QuestsSheet onClose={() => setSheet(null)} />}
      {sheet === 'modes' && <ModeSheet value={m} storyLine={s.tower >= TOWER_FLOORS ? 'Tower cleared' : `Floor ${next} · Chapter ${chapter.id}`} onPick={pick} onClose={() => setSheet(null)} />}
    </Screen>
  )
}

type Mode = 'story' | 'live' | 'stadium' | 'ranked' | 'cups'
const MODES: { k: Mode; name: string; cta: string; sub: string; icon: string; open: boolean }[] = [
  { k: 'story', name: 'Spirit Tower', cta: 'Story', sub: 'Climb floors, beat bosses, unlock beasts', icon: 'ui/icons/tower', open: true },
  { k: 'live', name: 'Live battle', cta: 'Friend battle', sub: 'Create a battle or join with a code', icon: 'ui/icons/live', open: true },
  { k: 'stadium', name: 'Stadium mode', cta: 'Big screen', sub: 'A big screen shows the battle, two phones launch', icon: 'ui/icons/trophy', open: true },
  { k: 'ranked', name: 'Ranked', cta: 'Climb the ladder', sub: "Battle other players' recorded tops", icon: 'ui/icons/ranked', open: FEATURES.ranked },
  { k: 'cups', name: 'Cups', cta: 'Tournaments', sub: 'Bracket tournaments with friends', icon: 'ui/icons/cups', open: FEATURES.cups },
]
const store = (k: string) => ({
  get: () => { try { return localStorage.getItem(k) } catch { return null } },
  set: (v: string) => { try { localStorage.setItem(k, v) } catch { return } },
})
const modeStore = store('spirit.mode'), seenStore = store('spirit.daily-seen')
let seenDay = ''
const readMode = (): Mode => { const v = modeStore.get(); return MODES.find(x => x.k === v && x.open)?.k ?? 'story' }

function untilMidnight(now = new Date()) {
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}
function useMinute() {
  const [, set] = useState(0)
  useEffect(() => { const id = window.setInterval(() => set(n => n + 1), 30_000); return () => window.clearInterval(id) }, [])
}

function Sheet({ title, sub, className = '', onClose, children }: { title: string; sub?: string; className?: string; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    close.current?.focus()
    return () => prev?.focus?.()
  }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className={`sheet h3-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <button ref={close} className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <header className="h3-sheet-head"><h2>{title}</h2>{sub && <p>{sub}</p>}</header>
        {children}
      </section>
    </div>
  )
}

function DailySheet({ onClose }: { onClose: () => void }) {
  const s = useSave()
  useMinute()
  const st = loginState(s.login?.last ?? '', s.login?.streak ?? 0, todayKey())
  const [got, setGot] = useState<{ coins: number; shards: number } | null>(null)
  return (
    <Sheet title="Daily rewards" sub={st.canClaim ? `Day ${st.day} is ready. Log in 7 days in a row for the big reward.` : `Next reward in ${untilMidnight()}`} className="h3-daily" onClose={onClose}>
      <ol className="h3-days">
        {DAILY_TRACK.map((r, i) => {
          const d = i + 1, done = d < st.day || (!st.canClaim && d === st.day), now = st.canClaim && d === st.day
          const shard = !!r.shards && !r.coins
          return (
            <li key={d} className={`${done ? 'done' : ''} ${now ? 'today' : ''} ${d === 7 ? 'big' : ''}`}>
              <span>Day {d}</span>
              <Img id={shard ? 'ui/icon-spirit-shard' : 'ui/icon-coin'} />
              <b>{r.coins || r.shards}</b>
              {r.coins && r.shards ? <small>+{r.shards} shards</small> : null}
            </li>
          )
        })}
      </ol>
      {got ? (
        <p className="h3-got" role="status">+{got.coins ? `${got.coins} coins` : ''}{got.coins && got.shards ? ' and ' : ''}{got.shards ? `${got.shards} shards` : ''}</p>
      ) : st.canClaim ? (
        <button className="cta gold h3-claim" onClick={() => setGot(s.claimDaily())}><span>Claim day {st.day}</span></button>
      ) : <p className="h3-wait">Come back tomorrow for day {st.day >= 7 ? 1 : st.day + 1}</p>}
    </Sheet>
  )
}

function QuestsSheet({ onClose }: { onClose: () => void }) {
  const s = useSave()
  useMinute()
  return (
    <Sheet title="Daily quests" sub={`New quests in ${untilMidnight()}`} className="h3-quests" onClose={onClose}>
      <ul className="h3-qlist">
        {s.quests.list.map(q => {
          const done = q.progress >= q.target, claimed = s.quests.claimed.includes(q.id)
          return (
            <li key={q.id} className={`h3-q ${claimed ? 'claimed' : done ? 'ready' : ''}`}>
              <span className="h3-q-text">{q.text}</span>
              <span className="h3-q-reward"><Img id="ui/icon-coin" />{q.reward}</span>
              <span className="h3-q-bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={Math.min(q.progress, q.target)} aria-label={q.text}><i style={{ transform: `scaleX(${Math.min(1, q.progress / q.target)})` }} /></span>
              {claimed ? <em>Claimed</em> : done ? <button className="h2-claim" onClick={() => s.claimQuest(q.id)}>Claim</button> : <em>{q.progress}/{q.target}</em>}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

function ModeSheet({ value, storyLine, onPick, onClose }: { value: Mode; storyLine: string; onPick: (m: Mode) => void; onClose: () => void }) {
  return (
    <Sheet title="Choose a mode" className="h3-modes" onClose={onClose}>
      <div className="h3-mlist" role="radiogroup" aria-label="Game mode">
        {MODES.map(x => (
          <button key={x.k} role="radio" aria-checked={value === x.k} disabled={!x.open} className={`h3-m ${value === x.k ? 'on' : ''} ${x.open ? '' : 'soon'}`} onClick={() => onPick(x.k)}>
            <Img id={x.icon} />
            <span><strong>{x.name}</strong><small>{x.k === 'story' ? storyLine : x.sub}</small></span>
            {!x.open && <em>Coming soon</em>}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
