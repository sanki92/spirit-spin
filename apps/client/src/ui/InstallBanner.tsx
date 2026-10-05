import { useEffect, useRef, type ReactNode } from 'react'
import { canOfferInstall, useInstall, type IosBrowser } from '../state/install'

const ICON = '/icons/icon-192.png'
const safariMajor = Number(/Version\/(\d+)/.exec(typeof navigator === 'undefined' ? '' : navigator.userAgent)?.[1] ?? 0)

export function InstallBanner() {
  const offer = useInstall(canOfferInstall)
  const install = useInstall(s => s.install)
  const snooze = useInstall(s => s.snooze)
  const openGuide = useInstall(s => s.openGuide)
  if (!offer) return null
  const android = offer === 'android'
  return (
    <aside className="install-banner" aria-label="Install Spirit Spin">
      <img className="install-icon" src={ICON} alt="" width={48} height={48} />
      <span className="install-text">
        <strong>{android ? 'Install Spirit Spin' : 'Add to Home Screen'}</strong>
        <small>Full screen, faster loading, one tap to play</small>
      </span>
      <button className="install-go" onClick={() => (android ? void install() : openGuide())}>{android ? 'Install' : 'How?'}</button>
      <button className="install-x" onClick={snooze} aria-label="Hide for a week">✕</button>
    </aside>
  )
}

function steps(b: IosBrowser): ReactNode[] {
  const share = b === 'chrome' ? <>Tap <b>Share</b> at the top right, next to the address bar.</>
    : b === 'safari' && safariMajor >= 26 ? <>Tap <b>⋯</b> at the bottom right, then tap <b>Share</b>.</>
    : b === 'safari' ? <>Tap <b>Share</b> at the bottom of the screen, the square with an arrow pointing up.</>
    : <>Open your browser menu and tap <b>Share</b>.</>
  if (b === 'inapp') return [<>Tap <b>⋯</b> or the share icon at the top and choose <b>Open in Safari</b>.</>, <>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</>, <>Tap <b>Add</b>.</>]
  return [share, <>Scroll down and tap <b>Add to Home Screen</b>.</>, <>Tap <b>Add</b>{safariMajor >= 26 && b === 'safari' ? <> with <b>Open as Web App</b> switched on</> : null}. Spirit Spin lands on your Home Screen.</>]
}

export function InstallGuide() {
  const open = useInstall(s => s.guide)
  const browser = useInstall(s => s.iosBrowser)
  const close = useInstall(s => s.closeGuide)
  const snooze = useInstall(s => s.snooze)
  const done = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    done.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, close])
  if (!open || !browser) return null
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet install-guide" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={e => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <button className="sheet-close" onClick={close} aria-label="Close">✕</button>
        <img className="install-guide-icon" src={ICON} alt="" width={72} height={72} />
        <h2 id="install-title">Add Spirit Spin to your Home Screen</h2>
        <p className="install-why">It opens full screen like an app, loads faster and keeps your spot.</p>
        <ol className="install-steps">{steps(browser).map((s, i) => <li key={i}>{s}</li>)}</ol>
        <div className="shortage-acts">
          <button ref={done} className="cta cyan" onClick={close}><span>Got it</span></button>
          <button className="text-btn" onClick={snooze}>Not now</button>
        </div>
      </section>
    </div>
  )
}
