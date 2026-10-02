import { BOT_LEVELS, hesitates, towerFloor, type BeastId, type TopBuild } from '@spirit/core'
import { useCallback, useEffect, useMemo } from 'react'
import type { MatchResult, MatchSetup } from './game/BattleController'
import { setHaptics } from './input/haptics'
import { useRuntime } from './runtime'
import { currentRoute, useNav, type Route } from './state/nav'
import { useSave } from './state/save'
import { settleMatch } from './state/settle'
import { BattleScreen, type ControllerFactory } from './ui/screens/BattleScreen'
import { OnlineController } from './game/OnlineController'
import { Friends } from './ui/screens/Friends'
import { CupScreen, Cups, Ranked } from './ui/screens/League'
import { GhostController } from './game/GhostController'
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
    else {
      nav.reset({ k: 'home' })
      const q = new URLSearchParams(location.search)
      const join = q.get('join'), cup = q.get('cup')
      if (join || cup) history.replaceState(null, '', location.pathname)
      if (join && /^[A-Za-z0-9]{4}$/.test(join)) nav.push({ k: 'friends', join })
      else if (cup && /^[A-Za-z0-9]{6}$/.test(cup)) nav.push({ k: 'cups', join: cup })
    }
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
    case 'friends': return <Friends join={route.join} />
    case 'live': return <LiveRoute route={route} />
    case 'ranked': return <Ranked />
    case 'cups': return <Cups join={route.join} />
    case 'cup': return <CupScreen id={route.id} />
    case 'ghost': return <GhostRoute route={route} />
    case 'result': return <Result result={route.result} settlement={route.settlement} opponentName={route.opponentName} then={route.next} />
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

function LiveRoute({ route }: { route: Extract<Route, { k: 'live' }> }) {
  const nav = useNav()
  const s = useSave.getState()
  const player = s.loadout as TopBuild
  const beast = s.beasts[player.beastId]
  const setup = useMemo<MatchSetup>(
    () => ({ player, opponent: route.peer.build, bot: BOT_LEVELS.normal, playerHesitates: false, seed: 0, art: [beastArt(player.beastId, beast?.awakened), `beasts/${route.peer.build.beastId}`] }),
    [route],
  )
  const onEnd = useCallback(
    (r: MatchResult) => {
      const settlement = settleMatch(r, null, null, route.peer.name)
      nav.replace({ k: 'result', result: r, settlement, opponentName: route.peer.name })
    },
    [route, nav],
  )
  const controller = useCallback<ControllerFactory>((g, st, d) => new OnlineController(g, st, d, route.side), [route])
  return <BattleScreen setup={setup} theme="classic" onEnd={onEnd} forceSwipe={s.settings.inputMode === 'swipe'} controller={controller} />
}

function GhostRoute({ route }: { route: Extract<Route, { k: 'ghost' }> }) {
  const nav = useNav()
  const s = useSave.getState()
  const { issued } = route
  const setup = useMemo<MatchSetup>(
    () => ({ player: issued.deck[0]!, opponent: issued.opponent.deck[0]!, bot: issued.opponent.brain, playerHesitates: false, seed: issued.seed, art: [`beasts/${issued.deck[0]!.beastId}`, `beasts/${issued.opponent.deck[0]!.beastId}`] }),
    [issued],
  )
  const controller = useCallback<ControllerFactory>((g, st, d) => new GhostController(g, st, d, issued, b => `beasts/${b.beastId}`), [issued])
  const onEnd = useCallback(
    (r: MatchResult) => {
      const settlement = settleMatch(r, null, null, issued.opponent.name)
      nav.replace({ k: 'result', result: r, settlement, opponentName: issued.opponent.name, ...(route.kind === 'tournament' && route.cupId ? { next: { k: 'cup', id: route.cupId } } : { next: { k: 'ranked' } }) })
    },
    [issued, route, nav],
  )
  return <BattleScreen setup={setup} theme={route.kind === 'ranked' ? 'frozen-moon' : 'volcano'} onEnd={onEnd} forceSwipe={issued.pool === 'swipe' || s.settings.inputMode === 'swipe'} controller={controller} />
}
