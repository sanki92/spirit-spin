import { BOT_LEVELS, hesitates, towerFloor, type BeastId, type TopBuild } from '@spirit/core'
import { useCallback, useEffect, useMemo } from 'react'
import type { MatchResult, MatchSetup } from './game/BattleController'
import { setHaptics } from './input/haptics'
import { useRuntime } from './runtime'
import { currentRoute, useNav, type Route } from './state/nav'
import { useSave } from './state/save'
import { settleMatch } from './state/settle'
import { BattleScreen } from './ui/screens/BattleScreen'
import { Garage } from './ui/screens/Garage'
import { beastArt, Home, Tower } from './ui/screens/Home'
import { Awaken, Collection, Journal, Settings, Shop } from './ui/screens/Meta'
import { AgeGate, Calibrate, Safety, Splash, StarterSelect } from './ui/screens/Onboarding'
import { ReadyScreen } from './ui/screens/ReadyScreen'
import { Result } from './ui/screens/Result'

export function App() {
  const route = useNav(currentRoute)
  const nav = useNav()
  const rt = useRuntime()
  const settings = useSave(s => s.settings)
  useEffect(() => {
    rt.sound.muted = !settings.sound
    setHaptics(settings.haptics)
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion)
  }, [settings, rt])
  useEffect(() => {
    if (route.k !== 'splash' && route.k !== 'age' && route.k !== 'ready' && !rt.ready) nav.reset({ k: 'ready' })
  }, [route.k, rt, nav])

  const onReady = useCallback(() => {
    const s = useSave.getState()
    if (!s.starter) nav.reset({ k: 'starter' })
    else if (!s.onboarded.safety) nav.reset({ k: 'safety' })
    else nav.reset({ k: 'home' })
  }, [nav])

  switch (route.k) {
    case 'splash': return <Splash />
    case 'age': return <AgeGate />
    case 'ready': return <ReadyScreen onReady={onReady} />
    case 'starter': return <StarterSelect />
    case 'safety': return <Safety />
    case 'calibrate': return <Calibrate />
    case 'home': return <Home />
    case 'garage': return <Garage />
    case 'tower': return <Tower />
    case 'collection': return <Collection />
    case 'shop': return <Shop />
    case 'journal': return <Journal />
    case 'settings': return <Settings />
    case 'awaken': return <Awaken />
    case 'battle': return <BattleRoute route={route} />
    case 'result': return <Result result={route.result} settlement={route.settlement} opponentName={route.opponentName} />
  }
}

function BattleRoute({ route }: { route: Extract<Route, { k: 'battle' }> }) {
  const nav = useNav()
  const s = useSave.getState()
  const player = s.loadout as TopBuild
  const beast = s.beasts[player.beastId]
  const opponentBeast = route.opponent.beastId as BeastId
  const firstBattle = !s.onboarded.firstBattle
  const setup = useMemo<MatchSetup>(
    () => ({
      player,
      opponent: route.opponent,
      bot: firstBattle ? BOT_LEVELS.rookie : route.floor ? towerFloor(route.floor).brain : BOT_LEVELS.normal,
      playerHesitates: !firstBattle && !!beast && hesitates(beast),
      seed: (Date.now() ^ (route.floor ?? 0) * 2654435761) >>> 0,
      art: [beastArt(player.beastId, beast?.awakened), `beasts/${opponentBeast}`],
    }),
    [route],
  )
  const onEnd = useCallback(
    (r: MatchResult) => {
      useSave.getState().markOnboarded('firstBattle')
      const settlement = settleMatch(r, route.floor, route.boss, route.opponentName)
      nav.replace({ k: 'result', result: r, settlement, opponentName: route.opponentName })
    },
    [route, nav],
  )
  return <BattleScreen setup={setup} theme={route.floor && route.floor > 30 ? 'volcano' : route.floor && route.floor > 15 ? 'frozen-moon' : 'classic'} onEnd={onEnd} forceSwipe={s.settings.inputMode === 'swipe'} />
}
