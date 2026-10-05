import { useEffect, useRef, useState } from 'react'
import { useNav } from '../state/nav'
import { useProfile, type Invite } from '../state/profile'
import { declineInvite, fetchInvites } from '../state/sync'
import { UsernameSheet } from './UsernameSheet'

const POLL_MS = 8000
const QUIET = new Set(['splash', 'age', 'ready', 'starter', 'safety', 'calibrate', 'battle', 'live', 'ghost', 'stadium', 'awaken', 'friends', 'social', 'welcome'])
const key = (i: Invite) => `${i.from.playerId}:${i.at}`

export function GlobalLayer({ routeKey }: { routeKey: string }) {
  const profile = useProfile()
  const nav = useNav()
  const seen = useRef(new Set<string>())
  const [toast, setToast] = useState<Invite | null>(null)
  const quiet = QUIET.has(routeKey)

  useEffect(() => {
    if (quiet || !profile.loaded) return
    let stop = false
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const list = await fetchInvites()
      if (stop || !list) return
      useProfile.getState().set({ invites: list })
      const fresh = list.filter(i => !seen.current.has(key(i))).sort((a, b) => b.at - a.at)[0]
      if (fresh) {
        seen.current.add(key(fresh))
        setToast(fresh)
      } else setToast(t => (t && list.some(i => key(i) === key(t)) ? t : null))
    }
    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { stop = true; window.clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [quiet, profile.loaded])

  useEffect(() => { if (quiet) setToast(null) }, [quiet])

  const join = (i: Invite) => {
    setToast(null)
    nav.push({ k: 'friends', join: i.code })
  }
  const dismiss = (i: Invite) => {
    setToast(null)
    void declineInvite(i.from.playerId)
    useProfile.getState().set({ invites: useProfile.getState().invites.filter(x => key(x) !== key(i)) })
  }

  if (profile.signedOut) {
    return (
      <div className="banned-wall signed-out" role="alertdialog" aria-modal="true" aria-labelledby="so-title">
        <h2 id="so-title" className="slant">Signed in on another device</h2>
        <p>Your account was opened on another phone with your recovery code, so it was signed out here and this device's game data was cleared.</p>
        <button className="cta gold" onClick={() => { useProfile.getState().set({ signedOut: false }); nav.reset({ k: 'welcome', recover: true }) }}><span>Use my recovery code</span></button>
        <button className="text-btn" onClick={() => location.reload()}>Start as a new player</button>
      </div>
    )
  }
  if (profile.banned) {
    return (
      <div className="banned-wall" role="alertdialog" aria-modal="true" aria-labelledby="banned-title">
        <h2 id="banned-title" className="slant">Account suspended</h2>
        <p>{profile.banned}</p>
        <p className="fine">If you think this is a mistake, contact the Spirit Spin team.</p>
      </div>
    )
  }
  return (
    <>
      {toast && !quiet && (
        <div className="invite-toast" role="alert">
          <div className="invite-text"><strong>{toast.from.name}</strong><span>invited you to battle</span></div>
          <button className="invite-join" onClick={() => join(toast)}>Join</button>
          <button className="invite-x" onClick={() => dismiss(toast)} aria-label={`Decline invite from ${toast.from.name}`}>✕</button>
        </div>
      )}
      {routeKey === 'home' && profile.loaded && !profile.username && <UsernameSheet required onClose={() => undefined} />}
    </>
  )
}
