import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { useNav, type Route } from './nav'

const BATTLE = new Set<Route['k']>(['battle', 'live', 'ghost', 'training'])
const ROOT = new Set<Route['k']>(['home', 'splash', 'age', 'ready', 'starter', 'safety', 'calibrate', 'welcome'])
const EXIT_WINDOW_MS = 2000

export const useBack = create<{ confirmLeave: boolean; exitHint: boolean }>(() => ({ confirmLeave: false, exitHint: false }))

export const PeekContext = createContext(false)
export const usePeek = () => useContext(PeekContext)

export const modalOpen = () => !!document.querySelector('[aria-modal="true"]')

export function canSwipeBack(): boolean {
  const { stack } = useNav.getState()
  const top = stack.at(-1), prev = stack.at(-2)
  return !!top && !!prev && !BATTLE.has(top.k) && !BATTLE.has(prev.k) && top.k !== 'result' && prev.k !== 'result' && !ROOT.has(top.k) && !modalOpen()
}

export function leaveBattle(): void {
  useBack.setState({ confirmLeave: false })
  useNav.getState().back()
}

type Watcher = { destroy(): void; addEventListener(type: 'close', f: () => void): void }
const CloseWatcherCtor = (globalThis as { CloseWatcher?: new () => Watcher }).CloseWatcher

function watch(onClose: () => void): () => void {
  if (!CloseWatcherCtor) return () => undefined
  const w = new CloseWatcherCtor()
  let alive = true
  w.addEventListener('close', () => { if (alive) { alive = false; onClose() } })
  return () => { if (alive) { alive = false; w.destroy() } }
}

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
const topKey = () => useNav.getState().stack.at(-1)?.k
const atHome = () => useNav.getState().stack.length === 1 && topKey() === 'home'

export function installBackNav(): void {
  let depth = 0
  let busy = false
  history.replaceState({ spirit: 0 }, '')

  const sync = () => {
    if (busy) return
    const want = useNav.getState().stack.length - 1
    if (depth > want) { busy = true; history.go(want - depth); return }
    while (depth < want) history.pushState({ spirit: ++depth }, '')
  }

  addEventListener('popstate', e => {
    const s = (e.state as { spirit?: unknown } | null)?.spirit
    const d = typeof s === 'number' ? s : 0
    if (busy) { busy = false; depth = d; return sync() }
    if (d >= depth) { depth = d; return sync() }
    const steps = depth - d
    depth = d
    if (modalOpen()) { escape(); return sync() }
    if (BATTLE.has(topKey() ?? 'home')) { useBack.setState({ confirmLeave: true }); return sync() }
    for (let i = 0; i < steps && useNav.getState().stack.length > 1; i++) useNav.getState().back()
    sync()
  })
  useNav.subscribe(sync)

  let modalStop: (() => void) | null = null
  new MutationObserver(() => {
    const open = modalOpen()
    if (open && !modalStop) modalStop = watch(() => { modalStop = null; escape() })
    else if (!open && modalStop) { modalStop(); modalStop = null }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })

  let battleStop: (() => void) | null = null
  let homeStop: (() => void) | null = null
  let hintTimer = 0
  const arm = () => {
    const battle = BATTLE.has(topKey() ?? 'home') && !useBack.getState().confirmLeave
    if (battle && !battleStop) battleStop = watch(() => { battleStop = null; useBack.setState({ confirmLeave: true }) })
    if (!battle && battleStop) { battleStop(); battleStop = null }
    const home = atHome() && !useBack.getState().exitHint
    if (home && !homeStop) homeStop = watch(() => {
      homeStop = null
      useBack.setState({ exitHint: true })
      clearTimeout(hintTimer)
      hintTimer = window.setTimeout(() => useBack.setState({ exitHint: false }), EXIT_WINDOW_MS)
    })
    if (!atHome() && homeStop) { homeStop(); homeStop = null }
  }
  useNav.subscribe(arm)
  useBack.subscribe((s, p) => { if (s.confirmLeave !== p.confirmLeave) window.setTimeout(arm, 0) })
  addEventListener('pointerdown', arm, { capture: true })
}
