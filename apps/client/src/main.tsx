import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Runtime, RuntimeContext } from './runtime'
import { useNav } from './state/nav'
import { startSync } from './state/sync'
import { installTelemetry, log } from './telemetry'
import './styles.css'
import './screens.css'

installTelemetry()
useNav.subscribe((s, prev) => { const r = s.stack[s.stack.length - 1]; if (r !== prev.stack[prev.stack.length - 1]) log('nav', { to: r?.k, depth: s.stack.length }) })
const runtime = new Runtime()
void startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeContext.Provider value={runtime}>
      <App />
    </RuntimeContext.Provider>
  </StrictMode>,
)
