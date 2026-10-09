import { BLADES, DISCS, TIPS, type BeastId, type ServerMsg, type TopBuild } from '@spirit/core'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { rt } from '../../net/rt'
import { useNav, type Route } from '../../state/nav'
import { useProfile } from '../../state/profile'
import { launcherId, useSave } from '../../state/save'
import { authHeader } from '../../state/sync'
import { log } from '../../telemetry'
import { Img, Screen, TopBar } from '../kit'
import { SkeletonList } from '../Loader'
import './live.css'

type Phase = { k: 'idle' } | { k: 'connecting' } | { k: 'hosting'; code: string } | { k: 'joining' } | { k: 'waiting'; code: string } | { k: 'error'; text: string }
interface Friend { playerId: string; name: string; friendCode: string; beast?: string | null; seen?: number | null }
interface Challenge { from: { playerId: string; name: string }; code: string; at: number }
interface Lists { friends: Friend[]; incoming: Friend[]; outgoing: Friend[]; challenges: Challenge[] }
interface Foe { name: string; build: TopBuild }

const ERRORS: Record<string, string> = {
  'no-room': 'No battle with that code. It may have ended; ask your friend for a new one.',
  full: 'That battle already has two players.',
  auth: 'Could not sign you in. Check your connection and try again.',
  'bad-message': 'The battle server is on a different version. Refresh the page and try again.',
  rate: 'Too many tries in a row. Wait a few seconds, then try again.',
  banned: 'This account is suspended and cannot join battles.',
}
const POLL_MS = 5000
const REVEAL_MS = 1300
const isBeast = (b: unknown): b is BeastId => typeof b === 'string' && b in BEASTS
const online = (f: Friend) => f.seen != null && f.seen < 30_000
const status = (f: Friend) => (f.seen == null ? 'Offline' : online(f) ? 'Online' : f.seen < 3_600_000 ? `Active ${Math.max(1, Math.round(f.seen / 60_000))}m ago` : 'Offline')
const nice = (b: BeastId) => BEASTS[b].name.charAt(0) + BEASTS[b].name.slice(1).toLowerCase()
const topName = (b: TopBuild) => [BLADES[b.bladeId]?.name, DISCS[b.discId]?.name, TIPS[b.tipId]?.name].filter(Boolean).join(' · ')

function useFriendLists(active: boolean, onNews: (text: string) => void, wantId = false) {
  const [lists, setLists] = useState<Lists | null>(null)
  const [mine, setMine] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const prev = useRef<Lists | null>(null)
  const news = useRef(onNews)
  news.current = onNews
  const load = useCallback(async () => {
    try {
      const r = await fetch('/v1/friends', { headers: authHeader() })
      if (!r.ok) throw new Error(String(r.status))
      const l = (await r.json()) as Partial<Lists>
      const next: Lists = { friends: l.friends ?? [], incoming: l.incoming ?? [], outgoing: l.outgoing ?? [], challenges: l.challenges ?? [] }
      const p = prev.current
      if (p) {
        const had = (xs: { playerId: string }[], id: string) => xs.some(x => x.playerId === id)
        for (const f of next.incoming) if (!had(p.incoming, f.playerId) && !had(p.friends, f.playerId)) news.current(`${f.name} sent you a friend request`)
        for (const f of next.friends) if (!had(p.friends, f.playerId)) news.current(`You and ${f.name} are now friends`)
      }
      prev.current = next
      setLists(next)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])
  useEffect(() => {
    if (!wantId) return
    void fetch('/v1/me', { headers: authHeader() }).then(r => r.json() as Promise<{ friendCode?: string }>).then(m => setMine(m.friendCode ?? null)).catch(() => undefined)
  }, [wantId])
  useEffect(() => {
    if (!active) return
    void load()
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [active, load])
  return { lists, mine, offline, reload: load }
}

function Avatar({ beast, name, dot }: { beast?: string | null | undefined; name: string; dot?: 'on' | 'away' | 'off' | undefined }) {
  return (
    <span className={`lb-avatar ${dot ?? ''}`} style={isBeast(beast) ? { ['--c' as string]: BEASTS[beast].color } : undefined} aria-hidden>
      {isBeast(beast) ? <Img id={`beasts/${beast}/emblem`} /> : <b>{name.slice(0, 1).toUpperCase()}</b>}
    </span>
  )
}

function Card({ beast, label, name, sub, empty }: { beast?: BeastId | undefined; label: string; name: string; sub: string; empty?: boolean }) {
  return (
    <div className={`lb-card ${empty ? 'empty' : ''}`} style={beast ? { ['--c' as string]: BEASTS[beast].color } : undefined}>
      {beast && !empty ? <Img id={`beasts/${beast}/card-art`} className="lb-card-art" /> : <span className="lb-card-ghost" aria-hidden><i /></span>}
      <div className="lb-card-text">
        <small>{label}</small>
        <strong>{name}</strong>
        <span>{sub}</span>
      </div>
    </div>
  )
}

export function Friends({ join, challenge: invite }: { join?: string | undefined; challenge?: Extract<Route, { k: 'friends' }>['challenge'] }) {
  const nav = useNav()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [code, setCode] = useState(join ?? '')
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [rival, setRival] = useState<Friend | null>(null)
  const [foe, setFoe] = useState<Foe | null>(null)
  const auto = useRef(false)
  const rivalRef = useRef<Friend | null>(null)
  const reveal = useRef(0)
  const build = useSave(s => s.loadout) as TopBuild
  const launcher = useSave(launcherId)
  const name = useSave(s => s.name)
  const busy = phase.k === 'connecting' || phase.k === 'joining'
  const lobby = phase.k === 'connecting' || phase.k === 'hosting' || phase.k === 'joining' || phase.k === 'waiting' || foe !== null
  const { lists, reload } = useFriendLists(!lobby, setToast)

  useEffect(() => rt.on((m: ServerMsg) => {
    if (m.k === 'room') {
      setPhase(p => (p.k === 'connecting' ? { k: 'hosting', code: m.code } : p.k === 'joining' ? { k: 'waiting', code: m.code } : p))
      const to = rivalRef.current
      if (to) void fetch('/v1/challenges', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ to: to.playerId, code: m.code }) }).catch(() => undefined)
    }
    if (m.k === 'peer' && rt.side !== null && rt.peer && !reveal.current) {
      const side = rt.side, peer = { name: rt.peer.name, build: rt.peer.build }
      setFoe(peer)
      reveal.current = window.setTimeout(() => nav.replace({ k: 'live', side, peer }), REVEAL_MS)
    }
    if (m.k === 'left' && reveal.current) {
      clearTimeout(reveal.current)
      reveal.current = 0
      rt.leave()
      rivalRef.current = null
      setRival(null)
      setFoe(null)
      setPhase({ k: 'error', text: 'Your opponent left before the battle started.' })
    }
    if (m.k === 'error') setPhase({ k: 'error', text: ERRORS[m.code] ?? 'The battle server refused that. Try again.' })
  }), [nav])

  const link = phase.k === 'hosting' ? `${location.origin}/?join=${phase.code}` : ''
  useEffect(() => {
    if (!link) { setQr(null); setShowQr(false); return }
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
    clearTimeout(reveal.current)
    if (useNav.getState().stack.at(-1)?.k !== 'live') rt.leave()
  }, [])
  const host = async (to: Friend | null = null) => {
    rt.leave()
    rivalRef.current = to
    setRival(to)
    setPhase({ k: 'connecting' })
    guard()
    if (await connect()) rt.send({ k: 'create', build: { ...build, launcher } })
  }
  const enter = async (c: string) => {
    rt.leave()
    rivalRef.current = null
    setRival(null)
    setPhase({ k: 'joining' })
    guard()
    if (await connect()) rt.send({ k: 'join', code: c.toUpperCase(), build: { ...build, launcher } })
  }
  useEffect(() => {
    if (auto.current || (!join && !invite)) return
    const t = window.setTimeout(() => {
      auto.current = true
      nav.replace({ k: 'friends' })
      if (join) void enter(join)
      else if (invite) void host(invite)
    }, 0)
    return () => clearTimeout(t)
  }, [join, invite])

  const share = () => {
    if (navigator.share) void navigator.share({ title: 'Spirit Spin battle', text: `Battle me in Spirit Spin! Code ${phase.k === 'hosting' ? phase.code : ''}`, url: link }).catch(() => undefined)
    else copyLink()
  }
  const copyLink = () => void navigator.clipboard?.writeText(link).then(() => setToast('Invite link copied'))
  const cancel = () => {
    rt.leave()
    clearTimeout(reveal.current)
    reveal.current = 0
    rivalRef.current = null
    setRival(null)
    setFoe(null)
    setPhase({ k: 'idle' })
  }
  const decline = (from: string) => fetch('/v1/challenges/decline', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ from }) }).catch(() => undefined)
  const accept = (c: Challenge) => {
    void decline(c.from.playerId)
    void enter(c.code)
  }

  const me = isBeast(build?.beastId) ? build.beastId : undefined
  if (lobby) {
    const roomCode = phase.k === 'hosting' || phase.k === 'waiting' ? phase.code : null
    const foeBeast = foe && isBeast(foe.build.beastId) ? foe.build.beastId : rival && isBeast(rival.beast) ? rival.beast : undefined
    return (
      <Screen className="friends lb">
        <TopBar title="Live battle" />
        <section className={`lb-lobby ${foe ? 'found' : ''}`} aria-live="polite">
          <Card beast={me} label="You" name={name || 'You'} sub={me ? `${nice(me)} · ${topName(build)}` : ''} />
          <div className="lb-vs" aria-hidden><span>VS</span></div>
          {foe ? (
            <Card beast={foeBeast} label="Opponent found!" name={foe.name} sub={foeBeast ? `${nice(foeBeast)} · ${topName(foe.build)}` : ''} />
          ) : (
            <Card beast={foeBeast} empty label={phase.k === 'joining' || phase.k === 'connecting' ? 'Connecting' : 'Waiting'} name={rival ? rival.name : phase.k === 'joining' ? 'Joining…' : 'Your friend'} sub={rival ? 'Challenge sent. Starts when they accept.' : phase.k === 'hosting' ? 'Share the code. Starts when they join.' : 'Getting your battle ready…'} />
          )}
        </section>
        {foe ? <p className="lb-starting">Battle starting…</p> : (
          <>
            {roomCode && (
              <section className="lb-codebox">
                <small>Battle code</small>
                <div className="room-code" aria-label="Battle code">{roomCode}</div>
                {phase.k === 'hosting' && (
                  <div className="lb-codebox-acts">
                    <button className="lb-btn gold" onClick={share}>{'share' in navigator ? 'Share invite' : 'Copy invite'}</button>
                    {'share' in navigator && <button className="lb-btn ghost" onClick={copyLink}>Copy link</button>}
                    <button className="lb-btn ghost" onClick={() => setShowQr(v => !v)} aria-expanded={showQr}>{showQr ? 'Hide QR' : 'Show QR'}</button>
                  </div>
                )}
                {showQr && qr && <img className="qr" src={qr} alt={`QR code for battle ${roomCode}`} />}
              </section>
            )}
            <button className="text-btn lb-cancel" onClick={cancel}>{phase.k === 'hosting' ? 'Cancel battle' : 'Leave'}</button>
          </>
        )}
        {toast && <p key={toast} className="toast pop" role="status" onAnimationEnd={() => setTimeout(() => setToast(t => (t === toast ? null : t)), 2400)}>{toast}</p>}
      </Screen>
    )
  }

  const challenge = lists?.challenges[0]
  return (
    <Screen className="friends lb">
      <TopBar title="Live battle" />
      {challenge && (
        <section className="lb-challenge" role="alert">
          <Avatar beast={lists?.friends.find(f => f.playerId === challenge.from.playerId)?.beast} name={challenge.from.name} dot="on" />
          <div><strong>{challenge.from.name} challenges you!</strong><span>Battle code {challenge.code}</span></div>
          <div className="lb-challenge-acts">
            <button className="lb-btn gold" onClick={() => accept(challenge)}>Accept</button>
            <button className="lb-btn ghost" onClick={() => { void decline(challenge.from.playerId).then(reload) }}>Not now</button>
          </div>
        </section>
      )}
      <section className="lb-me" style={me ? { ['--c' as string]: BEASTS[me].color } : undefined}>
        {me && <Img id={`beasts/${me}/card-art`} className="lb-me-art" />}
        <div className="lb-me-text">
          <small>Battling with</small>
          <strong>{me ? BEASTS[me].name : 'Your top'}</strong>
          <span>{build ? topName(build) : ''}</span>
          <button className="text-btn" onClick={() => nav.push({ k: 'garage' })}>Change top</button>
        </div>
      </section>
      <div className="lb-modes">
        <button className="lb-tile host" onClick={() => void host()}>
          <Img id="ui/icons/live" className="lb-tile-icon" />
          <strong>Create battle</strong>
          <span>Get a code to share</span>
        </button>
        <form className="lb-tile join" onSubmit={e => { e.preventDefault(); if (code.length === 4) void enter(code) }}>
          <strong>Join battle</strong>
          <div className="lb-join-row">
            <input className="lb-code" value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase())} placeholder="CODE" maxLength={4} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Battle code" />
            <button className="lb-btn cyan" disabled={code.length !== 4}>Go</button>
          </div>
        </form>
      </div>
      {phase.k === 'error' && <p className="form-error lb-error" role="alert">{phase.text}</p>}
      <button className="lb-social" onClick={() => nav.push({ k: 'social' })}>
        <Img id="ui/icons/live" className="lb-tile-icon" />
        <span><strong>Challenge a friend</strong><small>{lists && lists.friends.length ? `${lists.friends.filter(online).length} of ${lists.friends.length} friends online` : 'Add friends by ID or @username'}</small></span>
      </button>
      <button className="lb-stadium" onClick={() => nav.push({ k: 'stadium' })}>
        <strong>Stadium Mode</strong>
        <span>Big screen shows the battle, two phones launch</span>
      </button>
      {toast && <p key={toast} className="toast pop" role="status" onAnimationEnd={() => setTimeout(() => setToast(t => (t === toast ? null : t)), 2400)}>{toast}</p>}
    </Screen>
  )
}

export function Social() {
  const nav = useNav()
  const [toast, setToast] = useState<string | null>(null)
  const { lists, mine, offline, reload } = useFriendLists(true, setToast, true)
  const username = useProfile(p => p.username)
  const challenge = lists?.challenges[0]
  const decline = (from: string) => fetch('/v1/challenges/decline', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify({ from }) }).catch(() => undefined)
  const shareId = () => {
    if (!mine) return
    const text = `Add me on Spirit Spin! ID ${mine}${username ? ` or @${username}` : ''}`
    if (typeof navigator.share === 'function') void navigator.share({ title: 'Spirit Spin', text }).catch(() => undefined)
    else void navigator.clipboard?.writeText(text).then(() => setToast('Copied your ID'))
  }
  return (
    <Screen className="friends lb social">
      <TopBar title="Friends" />
      {challenge && (
        <section className="lb-challenge" role="alert">
          <Avatar beast={lists?.friends.find(f => f.playerId === challenge.from.playerId)?.beast} name={challenge.from.name} dot="on" />
          <div><strong>{challenge.from.name} challenges you!</strong><span>Battle code {challenge.code}</span></div>
          <div className="lb-challenge-acts">
            <button className="lb-btn gold" onClick={() => { void decline(challenge.from.playerId); nav.push({ k: 'friends', join: challenge.code }) }}>Accept</button>
            <button className="lb-btn ghost" onClick={() => { void decline(challenge.from.playerId).then(reload) }}>Not now</button>
          </div>
        </section>
      )}
      <section className="sc-id">
        <div><small>Your ID</small><b>{mine ?? '······'}</b>{username && <span>@{username}</span>}</div>
        <button className="lb-btn gold" onClick={shareId} disabled={!mine}>{typeof navigator.share === 'function' ? 'Share' : 'Copy'}</button>
      </section>
      <FriendsPanel lists={lists} offline={offline} onChallenge={f => nav.push({ k: 'friends', challenge: f })} reload={reload} notify={setToast} />
      {toast && <p key={toast} className="toast pop" role="status" onAnimationEnd={() => setTimeout(() => setToast(t => (t === toast ? null : t)), 2400)}>{toast}</p>}
    </Screen>
  )
}

function FriendsPanel({ lists, offline, onChallenge, reload, notify }: { lists: Lists | null; offline: boolean; onChallenge: (f: Friend) => void; reload: () => Promise<void>; notify: (t: string) => void }) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const post = (body: { code: string } | { username: string }) => fetch('/v1/friends', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify(body) }).catch(() => null)
  const add = async (c: string) => {
    setNote(null)
    setPending(c)
    const raw = c.trim().replace(/^@/, '')
    const asId = !c.trim().startsWith('@') && /^[A-Za-z0-9]{6}$/.test(raw)
    let r = await post(asId ? { code: raw.toUpperCase() } : { username: raw })
    if (asId && r?.status === 404) r = await post({ username: raw })
    setPending(null)
    if (!r) return setNote('No connection. Try again in a moment.')
    if (r.status === 404) return setNote('No player has that ID or username.')
    if (r.status === 400) return setNote("That's you!")
    if (!r.ok) return setNote('Could not add that friend. Try again.')
    setCode('')
    log('friends.add', {})
    await reload()
  }
  const remove = async (f: Friend, text: string) => {
    setPending(f.playerId)
    const r = await fetch(`/v1/friends/${f.playerId}`, { method: 'DELETE', headers: authHeader() }).catch(() => null)
    setPending(null)
    if (r?.ok) notify(text)
    await reload()
  }
  const friends = [...(lists?.friends ?? [])].sort((a, b) => (a.seen ?? Infinity) - (b.seen ?? Infinity))
  const live = friends.filter(online).length
  const empty = lists && friends.length + lists.incoming.length + lists.outgoing.length === 0
  return (
    <section className="lb-friends" aria-label="Friends">
      <header className="lb-friends-head">
        <h2>Your friends</h2>
        {lists && friends.length > 0 && <span className="lb-online"><i />{live} online</span>}
      </header>
      <div className="lb-addbox">
        <form className="lb-add" onSubmit={e => { e.preventDefault(); if (code.replace(/^@/, '').length >= 3) void add(code) }}>
          <input value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9_@]/gi, '').slice(0, 17))} placeholder="Their ID or @username" maxLength={17} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Friend ID or username" />
          <button className="lb-btn cyan" disabled={code.replace(/^@/, '').length < 3 || pending !== null}>{pending === code ? 'Adding…' : 'Add'}</button>
        </form>
        {note && <p className="form-error" role="alert">{note}</p>}
      </div>
      {offline ? <p className="fine">Friends need a connection. We'll keep trying.</p> : !lists ? <SkeletonList rows={2} /> : (
        <>
          {lists.incoming.map(f => (
            <div key={f.playerId} className="lb-row request">
              <Avatar beast={f.beast} name={f.name} />
              <div><strong>{f.name}</strong><span>Wants to be friends</span></div>
              <button className="lb-btn cyan" onClick={() => void add(f.friendCode)} disabled={pending !== null}>Accept</button>
              <button className="lb-x" onClick={() => void remove(f, `Declined ${f.name}`)} disabled={pending !== null} aria-label={`Decline ${f.name}`}>×</button>
            </div>
          ))}
          {friends.map(f => {
            const on = online(f)
            return (
              <div key={f.playerId} className={`lb-row ${on ? 'on' : ''}`}>
                <Avatar beast={f.beast} name={f.name} dot={on ? 'on' : f.seen != null && f.seen < 3_600_000 ? 'away' : 'off'} />
                <div><strong>{f.name}</strong><span>{status(f)}{isBeast(f.beast) ? ` · ${nice(f.beast)}` : ''}</span></div>
                <button className={`lb-btn ${on ? 'gold' : 'ghost'}`} onClick={() => onChallenge(f)}>{on ? 'Battle' : 'Invite'}</button>
              </div>
            )
          })}
          {lists.outgoing.map(f => (
            <div key={f.playerId} className="lb-row out">
              <Avatar beast={f.beast} name={f.name} />
              <div><strong>{f.name}</strong><span>Request sent</span></div>
              <button className="lb-x" onClick={() => void remove(f, `Cancelled request to ${f.name}`)} disabled={pending !== null} aria-label={`Cancel request to ${f.name}`}>×</button>
            </div>
          ))}
          {empty && <p className="lb-empty">Add a friend by their ID or @username. Once you've both added each other, you can battle them from here.</p>}
        </>
      )}
    </section>
  )
}
