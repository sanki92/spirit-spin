import { GlobalLayer } from './ui/GlobalLayer'
import { BOT_LEVELS, hesitates, towerFloor, type BeastId, type TopBuild } from '@spirit/core'
import { lazy, Suspense, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { MatchResult, MatchSetup } from './game/BattleController'
import { setHaptics } from './input/haptics'
import { useRuntime } from './runtime'
import { warmImages } from './assets/assets'
import { Loader } from './ui/Loader'
import { currentRoute, useNav, type Route } from './state/nav'
import { storyBuild, useSave } from './state/save'
import { reconcileStory, settleMatch } from './state/settle'
import type { ControllerFactory } from './ui/screens/BattleScreen'
import type { StadiumTheme } from './game/Game'
import { OnlineController } from './game/OnlineController'
import { Friends, Social } from './ui/screens/Friends'
import { History } from './ui/screens/History'
import { CupScreen, Cups, Ranked } from './ui/screens/League'
import { Pass, Profile } from './ui/screens/Style'
import { GhostController } from './game/GhostController'
import { Garage } from './ui/screens/Garage'
import { beastArt, Home } from './ui/screens/Home'
import { Tower } from './ui/screens/Tower'
import { Awaken, Collection, Journal, Settings, Shop } from './ui/screens/Meta'
import { AgeGate, Calibrate, Safety, Splash, StarterSelect } from './ui/screens/Onboarding'
import { ReadyScreen } from './ui/screens/ReadyScreen'
import { ComingSoon } from './ui/screens/Soon'
import { FEATURES } from './features'
import { Result } from './ui/screens/Result'

const BattleScreen = lazy(() => import('./ui/screens/BattleScreen').then(m => ({ default: m.BattleScreen })))
const Stadium = lazy(() => import('./ui/screens/Stadium').then(m => ({ default: m.Stadium })))
const Loading = () => <Loader full label="Loading" />
const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>

export function App() {
  const route = useNav(currentRoute)
  const nav = useNav()
  const rt = useRuntime()
  const settings = useSave(s => s.settings)
  useEffect(() => {
    rt.sound.muted = !settings.sound
    setHaptics(settings.haptics)
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion || (import.meta.env.DEV && new URLSearchParams(location.search).has('still')))
  }, [settings, rt])
  useEffect(() => {
    if (route.k !== 'splash' && route.k !== 'age' && route.k !== 'ready' && !rt.ready) nav.reset({ k: 'ready' })
    if (import.meta.env.DEV && route.k === 'splash' && new URLSearchParams(location.search).has('screen')) nav.reset({ k: 'ready' })
  }, [route.k, rt, nav])
  useEffect(() => {
    if (route.k !== 'home') return
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500))
    idle(() => void import('./ui/screens/BattleScreen'))
  }, [route.k])

  const onReady = useCallback(() => {
    const s = useSave.getState()
    if (new URLSearchParams(location.search).has('stadium')) return nav.reset({ k: 'stadium' })
    const devScreen = import.meta.env.DEV ? new URLSearchParams(location.search).get('screen') : null
    if (devScreen) {
      nav.reset({ k: 'home' })
      if (devScreen.startsWith('result')) { void import('./dev/demo').then(m => nav.push({ k: 'result', ...m.demoResult(devScreen === 'result-win') })); return }
      const r = devScreen.startsWith('{') ? JSON.parse(devScreen) as Route : ({ k: devScreen } as Route)
      if (r.k !== 'home') nav.push(r)
      return
    }
    if (!s.starter) nav.reset({ k: 'starter' })
    else if (!s.onboarded.safety) nav.reset({ k: 'safety' })
    else {
      reconcileStory()
      warmArt()
      nav.reset({ k: 'home' })
      const q = new URLSearchParams(location.search)
      const join = q.get('join'), cup = q.get('cup'), go = q.get('go')
      if (join || cup || go) history.replaceState(null, '', location.pathname)
      if (join && /^[A-Za-z0-9]{4}$/.test(join)) nav.push({ k: 'friends', join })
      else if (cup && /^[A-Za-z0-9]{6}$/.test(cup)) nav.push({ k: 'cups', join: cup })
      else if (go === 'tower' || go === 'garage') nav.push({ k: go })
      else if (go === 'friends') nav.push({ k: 'friends' })
    }
  }, [nav])

  const screen = (() => {
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
    case 'awaken': return <Awaken then={route.then} />
    case 'battle': return <Lazy><BattleRoute route={route} /></Lazy>
    case 'friends': return <Friends join={route.join} challenge={route.challenge} />
    case 'social': return <Social />
    case 'history': return <History />
    case 'live': return <Lazy><LiveRoute route={route} /></Lazy>
    case 'ranked': return FEATURES.ranked ? <Ranked /> : <RankedSoon />
    case 'pass': return <Pass />
    case 'stadium': return <Lazy><Stadium /></Lazy>
    case 'profile': return <Profile />
    case 'cups': return FEATURES.cups ? <Cups join={route.join} /> : <CupsSoon />
    case 'cup': return FEATURES.cups ? <CupScreen id={route.id} /> : <CupsSoon />
    case 'ghost': return (route.kind === 'tournament' ? FEATURES.cups : FEATURES.ranked) ? <Lazy><GhostRoute route={route} /></Lazy> : route.kind === 'tournament' ? <CupsSoon /> : <RankedSoon />
    case 'result': return <Result result={route.result} settlement={route.settlement} opponentName={route.opponentName} then={route.next} />
  }
  })()
  return <>{screen}<GlobalLayer routeKey={route.k} /></>
}

const RankedSoon = () => <ComingSoon title="Ranked" icon="ui/icons/ranked" text="Climb the ladder against other players' recorded battles. We're tuning it now; Live battles with friends and the Spirit Tower are open." />
const CupsSoon = () => <ComingSoon title="Cups" icon="ui/icons/cups" text="Bracket tournaments with friends are almost ready. Until then, challenge friends in Live battle or climb the Spirit Tower." />

function BattleRoute({ route }: { route: Extract<Route, { k: 'battle' }> }) {
  const nav = useNav()
  const s = useSave.getState()
  const player = storyBuild(s, s.loadout as TopBuild)
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
      coach: firstBattle,
    }),
    [route],
  )
  const onEnd = useCallback(
    (r: MatchResult) => {
      useSave.getState().markOnboarded('firstBattle')
      const settlement = settleMatch(r, route.floor, route.boss, route.opponentName, route.floor ? 'story' : 'practice', route.opponent.beastId ?? null)
      nav.replace({ k: 'result', result: r, settlement, opponentName: route.opponentName, ...(route.floor ? { next: { k: 'tower' } as const } : {}) })
    },
    [route, nav],
  )
  return <BattleScreen setup={setup} theme={towerTheme(route.floor)} onEnd={onEnd} forceSwipe={s.settings.inputMode === 'swipe'} />
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
      const settlement = settleMatch(r, null, null, route.peer.name, 'live', route.peer.build.beastId ?? null)
      nav.replace({ k: 'result', result: r, settlement, opponentName: route.peer.name })
    },
    [route, nav],
  )
  const controller = useCallback<ControllerFactory>((g, st, d) => new OnlineController(g, st, { ...d, onAbort: () => nav.replace({ k: 'friends' }) }, route.side), [route, nav])
  const names = useMemo<[string, string]>(() => [s.name || 'You', route.peer.name || 'Rival'], [route])
  return <BattleScreen setup={setup} theme={stadiumTheme()} onEnd={onEnd} forceSwipe={s.settings.inputMode === 'swipe'} controller={controller} names={names} />
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
      const settlement = settleMatch(r, null, null, issued.opponent.name, route.kind === 'tournament' ? 'cup' : 'ranked', issued.opponent.deck[0]?.beastId ?? null)
      nav.replace({ k: 'result', result: r, settlement, opponentName: issued.opponent.name, ...(route.kind === 'tournament' && route.cupId ? { next: { k: 'cup', id: route.cupId } } : { next: { k: 'ranked' } }) })
    },
    [issued, route, nav],
  )
  return <BattleScreen setup={setup} theme={stadiumTheme()} onEnd={onEnd} forceSwipe={issued.pool === 'swipe' || s.settings.inputMode === 'swipe'} controller={controller} />
}

function towerTheme(floor: number | null | undefined): StadiumTheme {
  const own = stadiumTheme()
  if (!floor || own !== 'classic') return own
  return floor > 30 ? 'volcano' : floor > 15 ? 'frozen-moon' : 'classic'
}

function stadiumTheme(): StadiumTheme {
  const id = useSave.getState().cosmetics?.stadium ?? 'stadium-classic'
  return id === 'stadium-volcano' ? 'volcano' : id === 'stadium-frozen-moon' ? 'frozen-moon' : 'classic'
}

function warmArt(): void {
  const s = useSave.getState()
  const b = s.loadout?.beastId ?? s.starter ?? 'voltfang'
  const art = s.beasts[b]?.awakened ? `beasts/${b}/awakened-${s.beasts[b]!.awakened}` : `beasts/${b}`
  const icons = ['live', 'ranked', 'cups', 'garage', 'collection', 'shop', 'pass', 'journal', 'quests', 'settings'].map(i => `ui/icons/${i}`)
  const faces = ['neutral', 'proud', 'joyful', 'sad', 'furious', 'sulky'].map(m => `${art}/expressions/${m}`)
  const battle = ['ui/banner-victory', 'ui/banner-defeat', 'ui/banner-vs', 'ui/countdown-3', 'ui/countdown-2', 'ui/countdown-1', 'ui/countdown-launch', 'ui/callout-perfect', 'ui/callout-great', 'ui/callout-good', 'ui/callout-weak', `ui/hud-plate-${b}`, `${art}/cutin`, `${art}/summon`, `launchers/${b}`, 'backgrounds/share', 'backgrounds/vs-clash', 'onboarding/guide-grip', 'onboarding/guide-ready', 'onboarding/guide-pull']
  const parts = [...s.owned.blades.map(id => `parts/blade-${id}`), ...s.owned.discs.map(id => `parts/disc-${id}`), ...s.owned.tips.map(id => `parts/tip-${id}`)]
  warmImages([`${art}/card-art`, `${art}/emblem`, 'ui/icon-coin', 'ui/icon-spirit-shard', ...icons, ...faces, ...battle, 'backgrounds/garage', 'backgrounds/tower', ...parts])
}
