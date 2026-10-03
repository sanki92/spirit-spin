import { BOSSES, chapterOf, COSMETICS, STARTER_BUILDS, hesitates, levelForXp, towerFloor, TOWER_FLOORS, xpForLevel, type BeastId } from '@spirit/core'
import { useEffect, useMemo } from 'react'
import { BEASTS } from '../../game/beasts'
import { lineFor } from '../../game/lines'
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
  useEffect(() => { s.refreshQuests(); s.ensurePass() }, [s.refreshQuests])
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
    const b = st.loadout ?? (st.starter ? STARTER_BUILDS[st.starter] : null)
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
  const chapterDone = Math.max(0, Math.min(chapter.floors[1], s.tower) - chapter.floors[0] + 1)
  return (
    <Screen className="home2" bg="backgrounds/main-menu">
      <header className="h2-head">
        <button className="h2-me" onClick={() => nav.push({ k: 'profile' })} aria-label="Open profile">
          <span className="framed-avatar">
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

      {!first && (
        <nav className="h2-modes" aria-label="Play with others">
          <button onClick={() => nav.push({ k: 'friends' })} aria-label="Live, battle a friend"><Img id="ui/icons/live" /><strong>Live</strong><span>With a friend</span></button>
          <button onClick={() => nav.push({ k: 'ranked' })}><Img id="ui/icons/ranked" /><strong>Ranked</strong><span>Climb the ladder</span></button>
          <button onClick={() => nav.push({ k: 'cups' })}><Img id="ui/icons/cups" /><strong>Cups</strong><span>Tournaments</span></button>
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
        <button onClick={() => nav.push({ k: 'shop' })}><Img id="ui/icons/shop" /><span>Shop</span></button>
        <button onClick={() => nav.push({ k: 'pass' })}><Img id="ui/icons/pass" /><span>Pass</span></button>
        <button onClick={() => nav.push({ k: 'journal' })}><Img id="ui/icons/journal" /><span>Journal</span></button>
      </nav>
    </Screen>
  )
}
