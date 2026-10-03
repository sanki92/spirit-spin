import type { ServerMsg, TopBuild } from '@spirit/core'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { rt } from '../../net/rt'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { authHeader } from '../../state/sync'
import { log } from '../../telemetry'
import { Screen, Slash, TopBar } from '../kit'

type Phase = { k: 'idle' } | { k: 'connecting' } | { k: 'hosting'; code: string } | { k: 'joining' } | { k: 'waiting'; code: string } | { k: 'error'; text: string }

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
    if (m.k === 'room') setPhase(p => (p.k === 'connecting' ? { k: 'hosting', code: m.code } : p.k === 'joining' ? { k: 'waiting', code: m.code } : p))
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
  useEffect(() => () => {
    clearTimeout(timeout.current)
    if (useNav.getState().stack.at(-1)?.k !== 'live') rt.leave()
  }, [])
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
      {phase.k === 'waiting' ? (
        <section className="host-card">
          <div className="room-code" aria-label="Battle code">{phase.code}</div>
          <p>You're in! Waiting for the other player to join…</p>
          <p className="fine waiting">Keep this screen open. The battle starts by itself.</p>
          <button className="text-btn" onClick={cancel}>Leave</button>
        </section>
      ) : phase.k === 'hosting' ? (
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
          <section className="setting stadium-card">
            <div><strong>Stadium Mode</strong><span>Play on a TV or laptop: the big screen shows the stadium, two phones are the launchers.</span></div>
            <button className="text-btn" onClick={() => nav.push({ k: 'stadium' })}>Use this device as the stadium</button>
          </section>
          <FriendList onChallenge={() => void host()} />
        </>
      )}
    </Screen>
  )
}

interface Friend { playerId: string; name: string; friendCode: string }

function FriendList({ onChallenge }: { onChallenge: () => void }) {
  const [mine, setMine] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [incoming, setIncoming] = useState<Friend[]>([])
  const [outgoing, setOutgoing] = useState<Friend[]>([])
  const [offline, setOffline] = useState(false)
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const load = async () => {
    try {
      const [me, list] = await Promise.all([
        fetch('/v1/me', { headers: authHeader() }).then(r => r.json() as Promise<{ friendCode?: string }>),
        fetch('/v1/friends', { headers: authHeader() }).then(r => r.json() as Promise<{ friends?: Friend[]; incoming?: Friend[]; outgoing?: Friend[] }>),
      ])
      setMine(me.friendCode ?? null)
      setFriends(list.friends ?? [])
      setIncoming(list.incoming ?? [])
      setOutgoing(list.outgoing ?? [])
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }
  useEffect(() => { void load() }, [])
  const add = async (c = code) => {
    setNote(null)
    const r = await fetch('/v1/friends', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ code: c }) }).catch(() => null)
    if (!r) return setNote('No connection. Try again in a moment.')
    if (r.status === 404) return setNote('No player has that friend code.')
    if (r.status === 400) return setNote('That is your own code.')
    if (!r.ok) return setNote('Could not add that friend. Try again.')
    setCode('')
    setNote('Request sent. You become friends when they add you back.')
    log('friends.add', {})
    void load()
  }
  const copy = () => {
    if (!mine) return
    void navigator.clipboard?.writeText(mine).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  if (offline) return <p className="fine">Friends need a connection. Check your network and come back.</p>
  return (
    <>
      <section className="setting my-code">
        <div><strong>Your friend code</strong><span>Friends add you with this code.</span></div>
        <button className="code-chip" onClick={copy} aria-label="Copy your friend code">{mine ?? '······'}<em>{copied ? 'Copied' : 'Copy'}</em></button>
      </section>
      <form className="setting recover-form" onSubmit={e => { e.preventDefault(); void add(code) }}>
        <div><strong>Add a friend</strong><span>{note ?? 'Enter their 6-character friend code.'}</span></div>
        <input value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} placeholder="ABC234" maxLength={6} autoCapitalize="characters" aria-label="Friend code" />
        <button disabled={code.length !== 6}>Add</button>
      </form>
      {incoming.length > 0 && (
        <section className="friend-list" aria-label="Friend requests">
          <h2>Requests</h2>
          {incoming.map(f => (
            <div key={f.playerId} className="friend">
              <span className="friend-initial" aria-hidden>{f.name.slice(0, 1).toUpperCase()}</span>
              <div><strong>{f.name}</strong><span>Wants to be friends</span></div>
              <button className="go" onClick={() => void add(f.friendCode)}>Add back</button>
            </div>
          ))}
        </section>
      )}
      <section className="friend-list" aria-label="Friends">
        <h2>Friends</h2>
        {friends === null ? <p className="fine">Loading…</p> : friends.length + outgoing.length === 0 ? (
          <p className="fine">No friends yet. Swap friend codes with someone; once you have both added each other, they show up here.</p>
        ) : [...friends.map(f => ({ ...f, pending: false })), ...outgoing.map(f => ({ ...f, pending: true }))].map(f => (
          <div key={f.playerId} className="friend">
            <span className="friend-initial" aria-hidden>{f.name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{f.name}</strong><span>{f.pending ? 'Requested' : f.friendCode}</span></div>
            {!f.pending && <button className="go" onClick={onChallenge}>Challenge</button>}
          </div>
        ))}
      </section>
    </>
  )
}
