import { applyNudges, awakeningReady, levelForXp, moodAfter, xpForLevel, type BattleSummary, type BeastId, type Change, type FinishKind, type Mood } from '@spirit/core'
import { useEffect, useState } from 'react'
import { spiritMoment, type AiLine } from '../../state/spiritAi'
import type { MatchResult } from '../../game/BattleController'
import { BEASTS } from '../../game/beasts'
import { lineFor } from '../../game/lines'
import { useNav, type Route } from '../../state/nav'
import { shareCard } from '../share'
import { todayKey, useSave } from '../../state/save'
import type { Settlement } from '../../state/settle'
import { CountUp, Img, Screen } from '../kit'
import { beastArt } from './Home'
import { log } from '../../telemetry'

const pending = new WeakMap<object, Promise<AiLine | null>>()
const TRAIT_LABEL: Record<string, string> = { trust: 'Trust', respect: 'Respect', courage: 'Courage', pride: 'Pride', curiosity: 'Curiosity', calm: 'Calm' }
const FINISH: Record<FinishKind, string> = { spin: 'Spin', ringout: 'Ring out', shatter: 'Shatter', spirit: 'Spirit', draw: 'Draw' }

export function Result({ result, settlement, opponentName, then }: { result: MatchResult; settlement: Settlement; opponentName: string; then?: Route | undefined }) {
  const nav = useNav()
  const save = useSave()
  const won = result.winner === 0
  const beastId = (save.loadout?.beastId ?? 'voltfang') as BeastId
  const info = BEASTS[beastId]
  const beast = useSave(s => s.beasts[beastId])
  const [changes, setChanges] = useState<Change[]>(settlement.changes)
  const mood = beast ? moodAfter({ won, comeback: result.comeback, finishes: [], perfectRips: 0, overspins: 0, spiritCalls: 0, aggression: 0, boss: null, opponent: '' }, beast) : 'neutral'
  const fallback = () => lineFor(beastId, won && result.comeback ? 'comeback' : won ? 'win' : 'loss')
  const [line, setLine] = useState<string | null>(() => (useSave.getState().beasts[beastId] ? null : fallback()))
  const [aiMood, setAiMood] = useState<Mood | null>(null)
  const [aiWritten, setAiWritten] = useState(false)
  const summary: BattleSummary = { won, comeback: result.comeback, finishes: result.finishes, perfectRips: result.perfectRips, overspins: result.overspins, spiritCalls: result.spiritCalls, aggression: result.aggression, boss: null, opponent: opponentName }

  useEffect(() => {
    const b = useSave.getState().beasts[beastId]
    if (!b) return
    let p = pending.get(result)
    if (!p) {
      p = spiritMoment('post', b, summary, null)
      pending.set(result, p)
      void p.then(ai => {
        const cur = useSave.getState().beasts[beastId]
        if (!ai || !cur) return
        let next = cur
        const extra: Change[] = []
        if (ai.nudge.trait !== 'none' && ai.nudge.delta !== 0) {
          const r = applyNudges(next, { [ai.nudge.trait]: ai.nudge.delta }, 'Your beast noticed how you fight', todayKey())
          next = r.beast
          extra.push(...r.changes)
        }
        if (ai.memory) next = { ...next, memories: [{ at: todayKey(), text: ai.memory.text, importance: ai.memory.importance, tags: ['ai'] }, ...next.memories].slice(0, 50) }
        useSave.getState().setBeast(next)
        if (extra.length) setChanges(c => [...c, ...extra])
      })
    }
    let live = true
    void p.then(ai => {
      if (!live) return
      setLine(ai?.line ?? fallback())
      if (ai) { setAiMood(ai.mood); setAiWritten(true) }
    })
    return () => { live = false }
  }, [])

  const [sharing, setSharing] = useState(false)
  const share = async () => {
    setSharing(true)
    const b = useSave.getState().beasts[beastId]
    const how = await shareCard({
      won,
      score: `${result.match.scores[0]} – ${result.match.scores[1]} vs ${opponentName}`,
      beastArt: beastArt(beastId, b?.awakened),
      color: info.color,
      lines: [`Best rip ${result.bestRpm.toLocaleString()} RPM`, `${info.name} and me · Spirit Spin`],
    })
    log('share.card', { how })
    setSharing(false)
  }
  const next = () => {
    const b = useSave.getState().beasts[beastId]
    if (b && awakeningReady(b)) nav.replace({ k: 'awaken', ...(then ? { then } : {}) })
    else {
      nav.reset({ k: 'home' })
      if (then) nav.push(then)
    }
  }

  const st = settlement
  const lvl = levelForXp(save.xp)
  const lvlBase = xpForLevel(lvl), lvlNext = xpForLevel(lvl + 1)
  const leveled = levelForXp(save.xp - st.xp) < lvl
  const face = aiMood ?? mood
  const [me, them] = result.match.scores

  return (
    <Screen className={`result2 ${won ? 'won' : 'lost'}`} bg="backgrounds/share">
      <div className="r2-glow" style={{ ['--c' as string]: info.color }} aria-hidden="true" />
      <header className="r2-head">
        <Img id={won ? 'ui/banner-victory' : 'ui/banner-defeat'} className="r2-banner" alt={won ? 'Victory' : 'Defeat'} fallback={<h1 className="slant">{won ? 'Victory' : 'Defeat'}</h1>} />
        <div className="r2-score" role="img" aria-label={`Score ${me} to ${them}`}>
          <b className="mine">{me}</b><i>–</i><b>{them}</b>
        </div>
        <p className="r2-vs">vs {opponentName}{result.comeback && won ? ' · Comeback!' : ''}</p>
        <ol className="r2-rounds" aria-label="Rounds">
          {result.match.history.map((h, i) => (
            <li key={i} className={h.winner === 0 ? 'w' : h.winner === 1 ? 'l' : 'd'}>
              <span>R{i + 1}</span>{FINISH[h.finish]}
            </li>
          ))}
        </ol>
      </header>

      <section className="r2-rewards" aria-label="Rewards">
        <div className="r2-tile">
          <Img id="ui/icon-coin" />
          <strong>+<CountUp to={st.coins} /></strong>
          <span>Coins</span>
        </div>
        <div className="r2-tile xp">
          <em>Lv {lvl}</em>
          <strong>+<CountUp to={st.xp} /></strong>
          <span>{leveled ? 'Level up!' : 'XP'}</span>
          <div className="r2-xpbar"><i style={{ transform: `scaleX(${Math.min(1, (save.xp - lvlBase) / Math.max(1, lvlNext - lvlBase))})` }} /></div>
        </div>
        <div className={`r2-tile shards ${st.shards ? '' : 'none'}`}>
          <Img id="ui/icon-spirit-shard" />
          <strong>+<CountUp to={st.shards} /></strong>
          <span>Shards</span>
        </div>
      </section>

      {(st.streak >= 2 || st.levelUps > 0) && (
        <div className="r2-bonus">
          {st.streak >= 2 && <span>Win streak {st.streak} · +{st.streakCoins} coins</span>}
          {st.levelUps > 0 && <span className="lvl">Level up! +{st.levelUps * 10} shards</span>}
        </div>
      )}
      <p className="r2-stats">
        <span>Best rip <b>{result.bestRpm.toLocaleString()}</b> RPM</span>
        {result.perfectRips > 0 && <span><b>{result.perfectRips}</b> perfect</span>}
        {result.spiritCalls > 0 && <span><b>{result.spiritCalls}</b> spirit calls</span>}
        {result.verdict?.rating !== undefined && <span>Rating <b>{result.verdict.rating}</b> ({(result.verdict.delta ?? 0) >= 0 ? '+' : ''}{result.verdict.delta})</span>}
        {result.verdict === null && <span className="warn">Not verified, did not count</span>}
      </p>

      {!won && <p className="r2-tip"><b>Tip</b>{result.overspins > 0 ? 'Overspin cost you power. Pull a little softer and keep it straight.' : result.perfectRips === 0 ? 'A fast, straight pull toward you lands PERFECT rips.' : result.spiritCalls === 0 ? 'Tap Spirit when the gauge glows to fire your technique.' : 'Tilt to steer: dodge big hits, then strike from the side.'}</p>}

      {st.unlocked && (
        <section className="r2-unlock" style={{ ['--c' as string]: BEASTS[st.unlocked].color }}>
          <Img id={`beasts/${st.unlocked}/emblem`} />
          <div>
            <strong>{BEASTS[st.unlocked].name} joins your team</strong>
            <span>Equip it in the Garage, Spirit tab.</span>
          </div>
        </section>
      )}
      {st.part && (
        <section className="r2-unlock" style={{ ['--c' as string]: 'var(--gold)' }}>
          <span className="r2-new">New</span>
          <div>
            <strong>New part: {st.part}</strong>
            <span>It is in your Garage now.</span>
          </div>
        </section>
      )}

      <section className="r2-moment" style={{ ['--c' as string]: info.color }}>
        <Img id={`${beastArt(beastId, beast?.awakened)}/expressions/${face}`} className="r2-face" fallback={<Img id={`beasts/${beastId}/expressions/${face}`} className="r2-face" />} />
        <div className="r2-bubble">
          <strong>{info.name}</strong>
          <p aria-live="polite">{line ?? <span className="typing">…</span>}</p>
          {aiWritten && <span className="ai-tag" title="Spirit voice written by AI">AI voice</span>}
          {changes.length > 0 && (
            <ul className="r2-changes">
              {changes.slice(-3).map((c, i) => <li key={i} className={c.delta > 0 ? 'up' : 'down'}>{TRAIT_LABEL[c.trait]} {c.delta > 0 ? '+' : ''}{c.delta}</li>)}
            </ul>
          )}
        </div>
      </section>

      <div className="r2-actions">
        <button className="r2-share" onClick={() => void share()} disabled={sharing} aria-label="Share result card">{sharing ? '…' : 'Share'}</button>
        <button className="cta gold" onClick={next}><span>Continue</span></button>
      </div>
    </Screen>
  )
}
