import type { ServerMsg, TopBuild } from '@spirit/core'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { rt } from '../../net/rt'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { log } from '../../telemetry'
import { Screen, Slash, TopBar } from '../kit'

type Phase = { k: 'idle' } | { k: 'connecting' } | { k: 'hosting'; code: string } | { k: 'joining' } | { k: 'error'; text: string }

const ERRORS: Record<string, string> = {
  'no-room': 'No battle with that code. Check it with your friend.',
  full: 'That battle already has two players.',
  auth: 'Could not sign you in. Check your connection and try again.',
}

export function Friends({ join }: { join?: string | undefined }) {
  const nav = useNav()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [code, setCode] = useState(join ?? '')
  const [qr, setQr] = useState<string | null>(null)
  const auto = useRef(false)
  const build = useSave(s => s.loadout) as TopBuild
  const name = useSave(s => s.name)

  useEffect(() => rt.on((m: ServerMsg) => {
    if (m.k === 'room') setPhase(p => (p.k === 'connecting' ? { k: 'hosting', code: m.code } : p))
    if (m.k === 'peer' && rt.side !== null && rt.peer) nav.replace({ k: 'live', side: rt.side, peer: { name: rt.peer.name, build: rt.peer.build } })
    if (m.k === 'error') setPhase({ k: 'error', text: ERRORS[m.code] ?? 'Something went wrong. Try again.' })
  }), [nav])

  const link = phase.k === 'hosting' ? `${location.origin}/?join=${phase.code}` : ''
  useEffect(() => {
    if (!link) return setQr(null)
    void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#070b1f', light: '#ffffff' } }).then(setQr)
  }, [link])

  const connect = async () => {
    try {
      await rt.connect(name)
      return true
    } catch (e) {
      log('net.connect-failed', { error: String(e) })
      setPhase({ k: 'error', text: 'Could not reach the battle server. Check your connection and try again.' })
      return false
    }
  }
  const timeout = useRef(0)
  const guard = () => {
    clearTimeout(timeout.current)
    timeout.current = window.setTimeout(() => setPhase(p => (p.k === 'connecting' || p.k === 'joining' ? { k: 'error', text: 'The battle server is not answering. Check your connection and try again.' } : p)), 8000)
  }
  useEffect(() => () => clearTimeout(timeout.current), [])
  const host = async () => {
    rt.leave()
    setPhase({ k: 'connecting' })
    guard()
    if (await connect()) rt.send({ k: 'create', build })
  }
  const enter = async (c: string) => {
    rt.leave()
    setPhase({ k: 'joining' })
    guard()
    if (await connect()) rt.send({ k: 'join', code: c.toUpperCase(), build })
  }
  useEffect(() => {
    if (join && !auto.current) {
      auto.current = true
      void enter(join)
    }
  }, [join])

  const share = () => {
    if (navigator.share) void navigator.share({ title: 'Spirit Spin battle', text: `Battle me in Spirit Spin! Code ${phase.k === 'hosting' ? phase.code : ''}`, url: link }).catch(() => undefined)
    else void navigator.clipboard?.writeText(link)
  }
  const cancel = () => {
    rt.leave()
    setPhase({ k: 'idle' })
  }

  return (
    <Screen className="friends">
      <TopBar title="Live battle" />
      {phase.k === 'hosting' ? (
        <section className="host-card">
          <p>Your friend scans this or opens the link. The battle starts when they join.</p>
          {qr && <img className="qr" src={qr} alt={`QR code for battle ${phase.code}`} />}
          <div className="room-code" aria-label="Battle code">{phase.code}</div>
          <Slash onClick={share}>{'share' in navigator ? 'Send invite' : 'Copy invite link'}</Slash>
          <p className="fine waiting">Waiting for your friend…</p>
          <button className="text-btn" onClick={cancel}>Cancel</button>
        </section>
      ) : (
        <>
          <section className="setting friends-block">
            <div><strong>Host a battle</strong><span>Get a code, a link and a QR to share.</span></div>
            <Slash tone="gold" onClick={() => void host()} disabled={phase.k === 'connecting' || phase.k === 'joining'}>{phase.k === 'connecting' ? 'Opening…' : 'Create battle'}</Slash>
          </section>
          <form className="setting recover-form" onSubmit={e => { e.preventDefault(); void enter(code) }}>
            <div><strong>Join a battle</strong><span>Enter the 4-letter code from your friend.</span></div>
            <input value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase())} placeholder="ABCD" maxLength={4} autoCapitalize="characters" aria-label="Battle code" />
            <button disabled={code.length !== 4 || phase.k === 'joining'}>{phase.k === 'joining' ? 'Joining…' : 'Join'}</button>
          </form>
          {phase.k === 'error' && <p className="form-error" role="alert">{phase.text}</p>}
        </>
      )}
    </Screen>
  )
}
