import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Runtime, RuntimeContext } from './runtime'
import { useNav } from './state/nav'
import { startSync, suspendSync } from './state/sync'
import { startDevtoolsGuard } from './security/devtools'
import { rt } from './net/rt'
import { useSave } from './state/save'
import { useHud } from './state/hud'
import { installTelemetry, log } from './telemetry'
import { fitViewport } from './viewport'
import './styles.css'
import './screens.css'
import './v2.css'

installTelemetry()
fitViewport()
useNav.subscribe((s, prev) => { const r = s.stack[s.stack.length - 1]; if (r !== prev.stack[prev.stack.length - 1]) log('nav', { to: r?.k, depth: s.stack.length }) })
const runtime = new Runtime()
if (import.meta.env.DEV) {
  Object.assign(window, { __nav: useNav, __save: useSave, __rt: runtime, __hud: useHud })
  void import('./net/rt').then(m => Object.assign(window, { __net: m.rt }))
  void import('./state/sync').then(m => Object.assign(window, { __claimUsername: m.claimUsername }))
  void import('./state/profile').then(m => Object.assign(window, { __profile: m.useProfile }))
  if (new URLSearchParams(location.search).has('sim')) void import('./dev/sim').then(m => m.installSim())
}
void startSync()
if (import.meta.env.PROD) {
  startDevtoolsGuard(reason => {
    log('security.devtools', { reason })
    suspendSync(reason)
    rt.leave()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeContext.Provider value={runtime}>
      <App />
    </RuntimeContext.Provider>
  </StrictMode>,
)
