import { BLADES, BOSSES, CHAPTERS, DISCS, TIPS, towerFloor, TOWER_FLOORS, type BossId, type Chapter } from '@spirit/core'
import { useEffect, useMemo, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useRuntime } from '../../runtime'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { Img, Screen, Slash, TopBar } from '../kit'

const face = (b: BossId, mood: string) => `characters/bosses/${b}/${mood}`
const full = (b: BossId) => (b === 'kaze' ? 'characters/rival-full' : `characters/bosses/${b}-full`)
const partName = (kind: string, id: string) => (kind === 'blade' ? BLADES : kind === 'disc' ? DISCS : TIPS)[id]?.name ?? id

function BossTalk({ chapter, mode, onDone, onCancel }: { chapter: Chapter; mode: 'intro' | 'outro'; onDone: () => void; onCancel?: () => void }) {
  const lines = mode === 'intro' ? chapter.intro : chapter.outro
  const [i, setI] = useState(0)
  const rt = useRuntime()
  const last = i >= lines.length - 1
  const b = BOSSES[chapter.boss]
  const mood = mode === 'intro' ? (i === lines.length - 1 ? 'shout' : 'confident') : i === 0 ? 'defeated' : 'respect'
  const next = () => { rt.sound.play('ui', { volume: 0.5 }); if (!last) setI(i + 1) }
  return (
    <div className={`boss-talk ${mode}`} role="dialog" aria-modal="true" aria-label={`${b.name} speaks`} onClick={last ? undefined : next}>
      <Img id={full(chapter.boss)} className="boss-talk-art" eager />
      <div className="boss-talk-box">
        <div className="boss-talk-head">
          <Img id={face(chapter.boss, mood)} className="boss-talk-face" eager fallback={<Img id={full(chapter.boss)} className="boss-talk-face" />} />
          <div><strong>{b.name}</strong><span>{b.title}</span></div>
        </div>
        <p key={i} className="boss-talk-line" aria-live="polite">{lines[i]}</p>
        {last ? (
          <div className="boss-talk-actions">
            {mode === 'intro' && onCancel && <button className="ghost-btn" onClick={onCancel}>Not yet</button>}
            <Slash tone="gold" onClick={onDone}>{mode === 'intro' ? 'Battle!' : 'Continue'}</Slash>
          </div>
        ) : <span className="boss-talk-hint">Tap to continue</span>}
      </div>
    </div>
  )
}

export function Tower() {
  const nav = useNav()
  const s = useSave()
  const cleared = s.tower
  const current = Math.min(TOWER_FLOORS, cleared + 1)
  const [talk, setTalk] = useState<{ chapter: Chapter; mode: 'intro' | 'outro'; floor?: number } | null>(() => {
    const ch = CHAPTERS.find(c => c.floors[1] === cleared)
    return ch && !(s.outros ?? []).includes(ch.id) ? { chapter: ch, mode: 'outro' } : null
  })
  const chapters = useMemo(() => [...CHAPTERS].reverse(), [])
  useEffect(() => { document.getElementById(`floor-${current}`)?.scrollIntoView({ block: 'center' }) }, [current])

  const battle = (n: number) => {
    const f = towerFloor(n)
    nav.push({ k: 'battle', opponent: f.opponent, floor: n, boss: f.boss, opponentName: f.boss ? BOSSES[f.boss].name : `Floor ${n} Spinner` })
  }
  const start = (n: number) => {
    const f = towerFloor(n)
    const ch = CHAPTERS.find(c => c.floors[1] === n)
    if (f.boss && ch) setTalk({ chapter: ch, mode: 'intro', floor: n })
    else battle(n)
  }
  const doneTalk = () => {
    if (!talk) return
    if (talk.mode === 'outro') useSave.setState(st => ({ outros: [...new Set([...(st.outros ?? []), talk.chapter.id])] }))
    const floor = talk.floor
    setTalk(null)
    if (talk.mode === 'intro' && floor) battle(floor)
  }

  return (
    <Screen className="tower" bg="backgrounds/tower">
      <TopBar title="Spirit Tower" />
      {chapters.map(ch => {
        const [lo, hi] = ch.floors
        const open = cleared + 1 >= lo
        const done = Math.max(0, Math.min(hi, cleared) - lo + 1)
        const total = hi - lo + 1
        return (
          <section key={ch.id} className={`chapter ${open ? 'open' : 'locked'} ${done === total ? 'complete' : ''}`}>
            <header className="chapter-head">
              <Img id={face(ch.boss, done === total ? 'respect' : 'confident')} className="chapter-face" fallback={<Img id={full(ch.boss)} className="chapter-face" />} />
              <div className="chapter-title">
                <span>Chapter {ch.id} · {done}/{total}</span>
                <strong>{ch.title}</strong>
                {open ? <div className="chapter-bar"><i style={{ transform: `scaleX(${done / total})` }} /></div> : <em>Beat {BOSSES[CHAPTERS[ch.id - 2]?.boss ?? ch.boss].name} to open</em>}
              </div>
            </header>
            <ul className="chapter-unlocks" aria-label="Chapter rewards">
              {ch.unlocks.map(u => <li key={u}>{u}</li>)}
            </ul>
            {open && (
              <ol className="floors">
                {Array.from({ length: total }, (_, k) => towerFloor(hi - k)).map(f => {
                  const state = f.floor <= cleared ? 'cleared' : f.floor === current ? 'current' : 'locked'
                  const r = f.reward
                  return (
                    <li key={f.floor} id={`floor-${f.floor}`} className={`floor ${state} ${f.boss ? 'boss' : ''}`}>
                      {f.boss ? <Img id={face(f.boss, 'confident')} className="floor-face" fallback={<Img id={full(f.boss)} className="floor-face" />} /> : <span className="floor-num">{f.floor}</span>}
                      <div className="floor-info">
                        <strong>{f.boss ? BOSSES[f.boss].name : `Floor ${f.floor}`}</strong>
                        <span className="floor-rewards">
                          <i><Img id="ui/icon-coin" />{r.coins}</i>
                          <i><Img id="ui/icon-spirit-shard" />{r.shards}</i>
                          {r.part && <i className="reward-part"><Img id={`parts/${r.part.kind}-${r.part.id}`} />{partName(r.part.kind, r.part.id)}</i>}
                          {r.beast && <i className="reward-beast"><Img id={`beasts/${r.beast}/emblem`} />{BEASTS[r.beast].name}</i>}
                          {r.unlocksBeastSlot && <i className="reward-beast">New beast</i>}
                        </span>
                      </div>
                      {state !== 'locked' && <button className="go" onClick={() => start(f.floor)}>{state === 'cleared' ? 'Replay' : 'Battle'}</button>}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )
      })}
      {talk && <BossTalk chapter={talk.chapter} mode={talk.mode} onDone={doneTalk} onCancel={() => setTalk(null)} />}
    </Screen>
  )
}
