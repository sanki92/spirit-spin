import { applyNudges, awakeningReady, moodAfter, type BattleSummary, type BeastId, type Change, type Mood, type Reply } from '@spirit/core'
import { useEffect, useState } from 'react'
import { spiritMoment, type AiLine } from '../../state/spiritAi'
import type { MatchResult } from '../../game/BattleController'
import { BEASTS } from '../../game/beasts'
import { lineFor, LINES, REPLIES_LOSS, REPLIES_WIN, REPLY_LABEL } from '../../game/lines'
import { useNav } from '../../state/nav'
import { todayKey, useSave } from '../../state/save'
import type { Settlement } from '../../state/settle'
import { Img, Screen, Slash } from '../kit'

const TRAIT_LABEL: Record<string, string> = { trust: 'Trust', respect: 'Respect', courage: 'Courage', pride: 'Pride', curiosity: 'Curiosity', calm: 'Calm' }

export function Result({ result, settlement, opponentName }: { result: MatchResult; settlement: Settlement; opponentName: string }) {
  const nav = useNav()
  const save = useSave()
  const won = result.winner === 0
  const beastId = (save.loadout?.beastId ?? 'voltfang') as BeastId
  const recorded = { current: settlement }
  const beast = useSave(s => s.beasts[beastId])
  const [reply, setReply] = useState<Reply | null>(null)
  const [changes, setChanges] = useState<Change[]>(settlement.changes)
  const mood = beast ? moodAfter({ won, comeback: result.comeback, finishes: [], perfectRips: 0, overspins: 0, spiritCalls: 0, aggression: 0, boss: null, opponent: '' }, beast) : 'neutral'
  const [line, setLine] = useState(() => lineFor(beastId, won && result.comeback ? 'comeback' : won ? 'win' : 'loss'))
  const [aiMood, setAiMood] = useState<Mood | null>(null)
  const [replyLine, setReplyLine] = useState<string | null>(null)
  const summary: BattleSummary = { won, comeback: result.comeback, finishes: result.finishes, perfectRips: result.perfectRips, overspins: result.overspins, spiritCalls: result.spiritCalls, aggression: result.aggression, boss: null, opponent: opponentName }
  const applyAi = (ai: AiLine) => {
    const b = useSave.getState().beasts[beastId]
    if (!b) return
    let next = b
    const extra: Change[] = []
    if (ai.nudge.trait !== 'none' && ai.nudge.delta !== 0) {
      const r = applyNudges(next, { [ai.nudge.trait]: ai.nudge.delta }, 'Your beast noticed how you fight', todayKey())
      next = r.beast
      extra.push(...r.changes)
    }
    if (ai.memory) next = { ...next, memories: [{ at: todayKey(), text: ai.memory.text, importance: ai.memory.importance, tags: ['ai'] }, ...next.memories].slice(0, 50) }
    useSave.getState().setBeast(next)
    if (extra.length) setChanges(c => [...c, ...extra])
  }
  useEffect(() => {
    const b = useSave.getState().beasts[beastId]
    if (!b) return
    let live = true
    void spiritMoment('post', b, summary, null).then(ai => {
      if (!live || !ai) return
      setLine(ai.line)
      setAiMood(ai.mood)
      applyAi(ai)
    })
    return () => { live = false }
  }, [])
  const choices = won ? REPLIES_WIN : REPLIES_LOSS
  const answer = (r: Reply) => {
    setReply(r)
    setChanges(c => [...c, ...save.reply(r)])
    const b = useSave.getState().beasts[beastId]
    if (b) void spiritMoment('reply', b, summary, r).then(ai => { if (ai) { setReplyLine(ai.line); setAiMood(ai.mood); applyAi(ai) } })
  }
  const next = () => {
    const b = useSave.getState().beasts[beastId]
    if (b && awakeningReady(b)) nav.replace({ k: 'awaken' })
    else nav.reset({ k: 'home' })
  }
  return (
    <Screen className="result" bg="backgrounds/share">
      <Img id={won ? 'ui/banner-victory' : 'ui/banner-defeat'} className="result-banner pop" fallback={<h1 className="slant">{won ? 'Victory' : 'Defeat'}</h1>} />
      <p className="score">{result.match.scores[0]} – {result.match.scores[1]} vs {opponentName}</p>
      <div className="rewards">
        <span>+{recorded.current.coins} coins</span>
        <span>+{recorded.current.xp} XP</span>
        <span>Best rip {result.bestRpm.toLocaleString()} RPM</span>
        {recorded.current.part && <span className="gold">New part: {recorded.current.part}</span>}
      </div>
      {recorded.current.unlocked && (
        <div className="unlock pop" style={{ ['--c' as string]: BEASTS[recorded.current.unlocked].color }}>
          <Img id={`beasts/${recorded.current.unlocked}/emblem`} className="unlock-emblem" />
          <strong>{BEASTS[recorded.current.unlocked].name} wants to join you</strong>
        </div>
      )}
      <section className="moment" style={{ ['--c' as string]: BEASTS[beastId].color }}>
        <Img id={`beasts/${beastId}/expressions/${aiMood ?? (reply ? (won ? 'joyful' : 'neutral') : mood)}`} className="moment-face" />
        <div className="moment-talk">
          <p className="moment-line" aria-live="polite">{reply ? (replyLine ?? LINES[beastId].reply[reply]) : line}<span className="ai-tag" title="Spirit voice written by AI">✦</span></p>
          {!reply && (
            <div className="replies">
              {choices.map(c => <button key={c} onClick={() => answer(c)}>{REPLY_LABEL[c]}</button>)}
            </div>
          )}
        </div>
      </section>
      {changes.length > 0 && (
        <ul className="changes">
          {changes.slice(-4).map((c, i) => <li key={i}><b>{TRAIT_LABEL[c.trait]} {c.delta > 0 ? '+' : ''}{c.delta}</b> {c.reason}</li>)}
        </ul>
      )}
      <Slash tone={reply ? 'gold' : 'ghost'} onClick={next}>{reply ? 'Continue' : 'Skip'}</Slash>
    </Screen>
  )
}
