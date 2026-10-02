import { BOSSES, hesitates, levelForXp, towerFloor, TOWER_FLOORS, xpForLevel, type BeastId } from '@spirit/core'
import { useEffect, useMemo } from 'react'
import { BEASTS } from '../../game/beasts'
import { lineFor } from '../../game/lines'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { Bar, Coins, Img, Screen, Slash } from '../kit'

export function beastArt(id: BeastId, awakened: string | null | undefined): string {
  return awakened ? `beasts/${id}/awakened-${awakened}` : `beasts/${id}`
}

export function Home() {
  const nav = useNav()
  const s = useSave()
  useEffect(() => s.refreshQuests(), [s.refreshQuests])
  const beastId = s.loadout?.beastId ?? s.starter ?? 'voltfang'
  const beast = s.beasts[beastId]
  const info = BEASTS[beastId]
  const lvl = levelForXp(s.xp)
  const line = useMemo(() => lineFor(beastId, beast && hesitates(beast) ? 'hesitate' : 'greet'), [beastId, beast])
  const next = Math.min(TOWER_FLOORS, s.tower + 1)
  const floor = towerFloor(next)
  const art = beastArt(beastId, beast?.awakened)
  return (
    <Screen className="home" bg="backgrounds/main-menu">
      <header className="home-head">
        <button className="profile" onClick={() => nav.push({ k: 'settings' })} aria-label="Settings">
          <Img id={`characters/avatars/avatar-${s.avatar + 1}`} className="avatar" />
          <div>
            <strong>{s.name}</strong>
            <span>Level {lvl}</span>
            <Bar value={s.xp - xpForLevel(lvl)} max={xpForLevel(lvl + 1) - xpForLevel(lvl)} tone="gold" />
          </div>
        </button>
        <Coins />
      </header>

      <section className="hero" style={{ ['--c' as string]: info.color }} onClick={() => nav.push({ k: 'journal' })}>
        <Img id={`${art}/card-art`} className="hero-art" fallback={<Img id={`beasts/${beastId}/card-art`} className="hero-art" />} />
        <div className="speech">
          <Img id={`beasts/${beastId}/expressions/${beast && hesitates(beast) ? 'sulky' : 'neutral'}`} className="speech-face" />
          <p>{line}</p>
        </div>
        <div className="hero-name slant">{info.name}</div>
      </section>

      <Slash tone="gold" className="play" onClick={() => (s.onboarded.firstBattle ? nav.push({ k: 'tower' }) : nav.push({ k: 'battle', opponent: BOSSES.kaze.build, floor: null, boss: null, opponentName: 'Kaze' }))}>
        {!s.onboarded.firstBattle ? 'First battle · Kaze challenges you' : s.tower >= TOWER_FLOORS ? 'Tower cleared · Rematch' : `Tower floor ${next}${floor.boss ? ` · Boss ${BOSSES[floor.boss].name}` : ''}`}
      </Slash>

      <section className="quests">
        {s.quests.list.map(q => {
          const done = q.progress >= q.target, claimed = s.quests.claimed.includes(q.id)
          return (
            <div key={q.id} className={`quest ${done ? 'done' : ''}`}>
              <span>{q.text}</span>
              <Bar value={q.progress} max={q.target} tone={done ? 'gold' : 'cyan'} />
              {done && !claimed ? <button className="claim" onClick={() => s.claimQuest(q.id)}>+{q.reward}</button> : <em>{claimed ? 'Claimed' : `${q.progress}/${q.target}`}</em>}
            </div>
          )
        })}
      </section>

      <nav className="dock">
        <button onClick={() => nav.push({ k: 'garage' })}><Img id="parts/blade-fang" /><span>Garage</span></button>
        <button onClick={() => nav.push({ k: 'collection' })}><Img id="ui/card-frame-epic" /><span>Collection</span></button>
        <button onClick={() => nav.push({ k: 'shop' })}><Img id="ui/icon-coin" /><span>Shop</span></button>
        <button onClick={() => nav.push({ k: 'journal' })}><Img id={`beasts/${beastId}/emblem`} /><span>Journal</span></button>
      </nav>
    </Screen>
  )
}

export function Tower() {
  const nav = useNav()
  const cleared = useSave(s => s.tower)
  const floors = useMemo(() => Array.from({ length: TOWER_FLOORS }, (_, i) => towerFloor(TOWER_FLOORS - i)), [])
  const current = Math.min(TOWER_FLOORS, cleared + 1)
  useEffect(() => {
    document.getElementById(`floor-${current}`)?.scrollIntoView({ block: 'center' })
  }, [current])
  const start = (n: number) => {
    const f = towerFloor(n)
    nav.push({ k: 'battle', opponent: f.opponent, floor: n, boss: f.boss, opponentName: f.boss ? BOSSES[f.boss].name : `Floor ${n} Spinner` })
  }
  return (
    <Screen className="tower" bg="backgrounds/tower">
      <header className="topbar">
        <button className="icon-btn" onClick={nav.back} aria-label="Back">‹</button>
        <h1 className="slant">Spirit Tower</h1>
        <Coins />
      </header>
      <ol className="floors">
        {floors.map(f => {
          const state = f.floor <= cleared ? 'cleared' : f.floor === current ? 'current' : 'locked'
          return (
            <li key={f.floor} id={`floor-${f.floor}`} className={`floor ${state} ${f.boss ? 'boss' : ''}`}>
              {f.boss ? <Img id={`characters/bosses/${f.boss}/confident`} className="floor-face" fallback={<Img id="characters/rival-full" className="floor-face" />} /> : <span className="floor-num">{f.floor}</span>}
              <div className="floor-info">
                <strong>{f.boss ? `${BOSSES[f.boss].name} · ${BOSSES[f.boss].title}` : `Floor ${f.floor}`}</strong>
                <span>+{f.reward.coins} coins{f.reward.part ? ` · ${f.reward.part.id} ${f.reward.part.kind}` : ''}{f.reward.unlocksBeastSlot ? ' · new beast' : ''}</span>
              </div>
              {state !== 'locked' && <button className="go" onClick={() => start(f.floor)}>{state === 'cleared' ? 'Replay' : 'Battle'}</button>}
            </li>
          )
        })}
      </ol>
    </Screen>
  )
}
