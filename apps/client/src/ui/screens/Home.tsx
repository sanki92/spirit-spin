import { BLADES, BOSSES, chapterOf, COSMETICS, DAILY_TRACK, DISCS, loginState, ROOKIE_BUILDS, TIPS, hesitates, levelForXp, towerFloor, TOWER_FLOORS, xpForLevel, type BeastId } from '@spirit/core'
import { FEATURES } from '../../features'
import { useEffect, useMemo, useState } from 'react'
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
      if (r.part) { const t = r.part.kind === 'blade' ? BLADES : r.part.kind === 'disc' ? DISCS : TIPS; return { floors: f - s.tower, label: `${t[r.part.id]?.name ?? r.part.id} ${r.part.kind}`, img: `parts/${r.part.kind}-${r.part.id}` } }
      if (r.unlocksBeastSlot) return { floors: f - s.tower, label: 'A new spirit beast', img: null }
    }
    return null
  })()
  const chapterDone = Math.max(0, Math.min(chapter.floors[1], s.tower) - chapter.floors[0] + 1)
  return (
    <Screen className="home2" bg="backgrounds/main-menu">
      <header className="h2-head">
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
        <div className="wallet"><Shards /><Coins /></div>
      </header>

      <section className="h2-hero" style={{ ['--c' as string]: info.color }}>
        <button className="h2-hero-hit" onClick={() => nav.push({ k: 'journal' })} aria-label={`${info.name}, open journal`}>
          <Img id={`${art}/card-art`} className="h2-art" fallback={<Img id={`beasts/${beastId}/card-art`} className="h2-art" />} />
        </button>
        <div className="h2-hero-info">
          <span className="h2-kind">{info.title}</span>
          <strong className="h2-name">{info.name}</strong>
          {beast && <span className="h2-trust" role="meter" aria-label="Trust" aria-valuemin={0} aria-valuemax={100} aria-valuenow={beast.trust}><i style={{ transform: `scaleX(${beast.trust / 100})` }} /></span>}
          <p className="h2-line">{line}</p>
        </div>
      </section>

      <button className="h2-story" onClick={play}>
        <span className="h2-story-face">
          <Img id={floor.boss ? `characters/bosses/${floor.boss}/confident` : `characters/bosses/${chapter.boss}/confident`} />
        </span>
        <span className="h2-story-text">
          <small>{first ? 'Your first battle · Chapter 1' : s.tower >= TOWER_FLOORS ? 'Tower cleared' : `Chapter ${chapter.id} · ${chapter.title}`}</small>
          <strong>{first ? 'Floor 1' : s.tower >= TOWER_FLOORS ? 'Rematch any floor' : floor.boss ? `Boss: ${BOSSES[floor.boss].name}` : `Floor ${next}`}</strong>
          {s.tower < TOWER_FLOORS && <i className="h2-story-bar"><i style={{ transform: `scaleX(${chapterDone / (chapter.floors[1] - chapter.floors[0] + 1)})` }} /></i>}
        </span>
        <span className="h2-story-go">Battle</span>
      </button>

      {!first && <DailyTrack />}
      {!first && nextUnlock && (
        <button className="h2-next" onClick={() => nav.push({ k: 'tower' })}>
          {nextUnlock.img && <Img id={nextUnlock.img} />}
          <span><small>{nextUnlock.floors === 1 ? 'Next floor unlocks' : `${nextUnlock.floors} floors to`}</small><strong>{nextUnlock.label}</strong></span>
          <i className="h2-next-bar"><i style={{ transform: `scaleX(${Math.max(0.08, 1 - (nextUnlock.floors - 1) / 6)})` }} /></i>
        </button>
      )}
      {!first && (
        <nav className="h2-modes" aria-label="Play with others">
          <button onClick={() => nav.push({ k: 'friends' })} aria-label="Live, battle a friend"><Img id="ui/icons/live" /><strong>Live</strong><span>With a friend</span></button>
          {FEATURES.ranked ? <button onClick={() => nav.push({ k: 'ranked' })}><Img id="ui/icons/ranked" /><strong>Ranked</strong><span>Climb the ladder</span></button>
            : <button className="soon" aria-disabled="true" aria-label="Ranked, coming soon"><Img id="ui/icons/ranked" /><strong>Ranked</strong><span>Coming soon</span></button>}
          {FEATURES.cups ? <button onClick={() => nav.push({ k: 'cups' })}><Img id="ui/icons/cups" /><strong>Cups</strong><span>Tournaments</span></button>
            : <button className="soon" aria-disabled="true" aria-label="Cups, coming soon"><Img id="ui/icons/cups" /><strong>Cups</strong><span>Coming soon</span></button>}
        </nav>
      )}

      {quests.length > 0 && (
        <section className="h2-quests panel">
          <h2 className="section-title"><Img id="ui/icons/quests" className="h2-q-icon" />Daily quests<small>{doneCount}/{quests.length} done</small></h2>
          {quests.map(q => {
            const done = q.progress >= q.target, claimed = s.quests.claimed.includes(q.id)
            return (
              <div key={q.id} className={`h2-quest ${claimed ? 'claimed' : done ? 'ready' : ''}`}>
                <span className="h2-q-text">{q.text}</span>
                <span className="h2-q-bar"><i style={{ transform: `scaleX(${Math.min(1, q.progress / q.target)})` }} /></span>
                {claimed ? <em>Done</em> : done ? (
                  <button className="h2-claim" onClick={() => s.claimQuest(q.id)}><Img id="ui/icon-coin" />{q.reward}</button>
                ) : <em>{q.progress}/{q.target}</em>}
              </div>
            )
          })}
        </section>
      )}

      <nav className="h2-dock" aria-label="Main">
        <button onClick={() => nav.push({ k: 'garage' })}><Img id="ui/icons/garage" /><span>Garage</span></button>
        <button onClick={() => nav.push({ k: 'collection' })}><Img id="ui/icons/collection" /><span>Collection</span></button>
        <button onClick={() => nav.push({ k: 'friends' })} aria-label={invites ? `Friends, ${invites} invite${invites > 1 ? 's' : ''}` : 'Friends'}><Img id="ui/icons/live" /><span>Friends</span>{invites > 0 && <b className="dock-badge" aria-hidden="true">{invites}</b>}</button>
        <button onClick={() => nav.push({ k: 'shop' })}><Img id="ui/icons/shop" /><span>Shop</span></button>
        <button onClick={() => nav.push({ k: 'pass' })}><Img id="ui/icons/pass" /><span>Pass</span></button>
        <button onClick={() => nav.push({ k: 'journal' })}><Img id="ui/icons/journal" /><span>Journal</span></button>
      </nav>
    </Screen>
  )
}

function DailyTrack() {
  const s = useSave()
  const st = loginState(s.login?.last ?? '', s.login?.streak ?? 0, todayKey())
  const [got, setGot] = useState<{ coins: number; shards: number } | null>(null)
  const claim = () => setGot(s.claimDaily())
  return (
    <section className="h2-daily panel" aria-label="Daily login rewards">
      <h2 className="section-title">Daily rewards<small>{st.canClaim ? `Day ${st.day} ready` : got ? 'Claimed' : 'Come back tomorrow'}</small></h2>
      <ol>
        {DAILY_TRACK.map((r, i) => {
          const d = i + 1, done = d < st.day || (!st.canClaim && d === st.day), today = st.canClaim && d === st.day
          return (
            <li key={d} className={`${done ? 'done' : ''} ${today ? 'today' : ''} ${d === 7 ? 'big' : ''}`}>
              <span>Day {d}</span>
              <Img id={r.shards && !r.coins ? 'ui/icon-spirit-shard' : 'ui/icon-coin'} />
              <b>{r.coins ? r.coins : r.shards}{r.coins && r.shards ? '+' : ''}</b>
            </li>
          )
        })}
      </ol>
      {st.canClaim && <button className="cta gold h2-daily-claim" onClick={claim}><span>Claim day {st.day}</span></button>}
      {got && <p className="h2-daily-got" role="status">+{got.coins ? `${got.coins} coins` : ''}{got.coins && got.shards ? ' and ' : ''}{got.shards ? `${got.shards} shards` : ''}</p>}
    </section>
  )
}
