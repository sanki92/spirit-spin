import { BOT_LEVELS, STARTER_BUILDS } from '@spirit/core'
import { useCallback, useMemo, useState } from 'react'
import type { MatchResult, MatchSetup } from './game/BattleController'
import { BattleScreen } from './ui/screens/BattleScreen'
import { ReadyScreen } from './ui/screens/ReadyScreen'

type View = { k: 'ready' } | { k: 'battle'; n: number } | { k: 'result'; r: MatchResult }

export function App() {
  const [view, setView] = useState<View>({ k: 'ready' })
  const setup = useMemo<MatchSetup>(
    () => ({
      player: STARTER_BUILDS.voltfang,
      opponent: STARTER_BUILDS.aegiron,
      bot: BOT_LEVELS.normal,
      playerHesitates: false,
      seed: Date.now() >>> 0,
      art: ['beasts/voltfang', 'beasts/aegiron'],
    }),
    [view.k === 'battle' ? view.n : 0],
  )
  const onEnd = useCallback((r: MatchResult) => setView({ k: 'result', r }), [])
  if (view.k === 'ready') return <ReadyScreen onReady={() => setView({ k: 'battle', n: 1 })} />
  if (view.k === 'battle') return <BattleScreen setup={setup} theme="classic" onEnd={onEnd} />
  return (
    <div className="screen result-screen">
      <h1>{view.r.winner === 0 ? 'VICTORY' : 'DEFEAT'}</h1>
      <p>{view.r.match.scores.join(' – ')} · best rip {view.r.bestRpm.toLocaleString()} RPM</p>
      <button className="btn-primary big" onClick={() => setView({ k: 'battle', n: Math.random() })}>REMATCH</button>
    </div>
  )
}
