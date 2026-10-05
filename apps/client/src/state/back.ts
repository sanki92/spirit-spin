import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { useNav, type Route } from './nav'

const BATTLE = new Set<Route['k']>(['battle', 'live', 'ghost'])
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

export function goBack(): 'handled' | 'exit' {
  if (modalOpen()) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    return 'handled'
  }
  const nav = useNav.getState()
  const top = nav.stack.at(-1)
  if (!top) return 'exit'
  if (BATTLE.has(top.k)) {
    useBack.setState({ confirmLeave: true })
    return 'handled'
  }
  if (nav.stack.length > 1) {
    nav.back()
    return 'handled'
  }
  if (ROOT.has(top.k)) return 'exit'
  nav.reset({ k: 'home' })
  return 'handled'
}

export function leaveBattle(): void {
  useBack.setState({ confirmLeave: false })
  useNav.getState().back()
}

export function installBackGuard(): void {
  const guard = () => history.pushState({ spirit: 'guard' }, '')
  history.replaceState({ spirit: 'base' }, '')
  guard()
  let exitTimer = 0
  addEventListener('popstate', () => {
    if (useBack.getState().exitHint) return
    if (goBack() === 'handled') return guard()
    useBack.setState({ exitHint: true })
    exitTimer = window.setTimeout(() => {
      useBack.setState({ exitHint: false })
      if (history.state?.spirit === 'base') guard()
    }, EXIT_WINDOW_MS)
  })
  addEventListener('pagehide', () => clearTimeout(exitTimer))
}
