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
import { CrashGuard, installCrashReporting } from './crash'
import { captureInstallEvents } from './state/install'
import { installBackNav } from './state/back'
import { keepUpdated } from './update'
import { installClickSound } from './ui/clickSound'
import { installNoUndoTyping } from './input/typingUndo'
import './styles.css'
import './screens.css'
import './v2.css'

installTelemetry()
installCrashReporting()
captureInstallEvents()
installBackNav()
if ('standalone' in navigator) installNoUndoTyping(document)
keepUpdated()
fitViewport()
let navAt = performance.now()
useNav.subscribe((s, prev) => { const r = s.stack[s.stack.length - 1], was = prev.stack[prev.stack.length - 1]; if (r !== was) { const now = performance.now(); log('nav', { from: was?.k, to: r?.k, depth: s.stack.length, stayMs: Math.round(now - navAt) }); navAt = now } })
const runtime = new Runtime()
installClickSound(runtime.sound)
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
      <CrashGuard>
        <App />
      </CrashGuard>
    </RuntimeContext.Provider>
  </StrictMode>,
)
