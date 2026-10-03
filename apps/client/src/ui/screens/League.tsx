import { BLADES, deckValid, DISCS, TIPS, type BeastId, type TopBuild } from '@spirit/core'
import { useEffect, useMemo, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import type { IssuedGhost } from '../../game/GhostController'
import { useRuntime } from '../../runtime'
import { useNav } from '../../state/nav'
import { useSave } from '../../state/save'
import { authHeader } from '../../state/sync'
import { log } from '../../telemetry'
import { Bar, Img, Screen, Slash, TopBar } from '../kit'
import { Loader, Skeleton, SkeletonList } from '../Loader'
import { TopPreview } from './Garage'

async function api<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...authHeader() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T }
  } catch {
    return { ok: false, status: 0, data: {} as T }
  }
}

const partName = (kind: 'blade' | 'disc' | 'tip', id: string) => (kind === 'blade' ? BLADES[id]?.name : kind === 'disc' ? DISCS[id]?.name : TIPS[id]?.name) ?? id

function autoDeck(owned: { blades: string[]; discs: string[]; tips: string[] }, beasts: BeastId[]): TopBuild[] {
  return [0, 1, 2].map(i => ({ bladeId: owned.blades[i] ?? owned.blades[0]!, discId: owned.discs[i] ?? owned.discs[0]!, tipId: owned.tips[i] ?? owned.tips[0]!, beastId: beasts[i % beasts.length]! }))
}

interface RankedInfo { rating: number; ratingSwipe: number; played: number; won: number; deck: TopBuild[] | null }

export function Ranked() {
  const nav = useNav()
  const rt = useRuntime()
  const s = useSave()
  const beasts = Object.keys(s.beasts) as BeastId[]
  const pool: 'motion' | 'swipe' = rt.sensors && s.settings.inputMode !== 'swipe' ? 'motion' : 'swipe'
  const [info, setInfo] = useState<RankedInfo | null>(null)
  const [offline, setOffline] = useState(false)
  const [deck, setDeck] = useState<TopBuild[]>(() => autoDeck(s.owned, beasts))
  const [slot, setSlot] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = s.owned.blades.length < 3 || s.owned.discs.length < 3 || s.owned.tips.length < 3

  useEffect(() => {
    void api<RankedInfo>('GET', '/v1/ranked').then(r => {
      if (!r.ok) return setOffline(true)
      setInfo(r.data)
      if (r.data.deck?.length === 3 && r.data.deck.every(b => s.owned.blades.includes(b.bladeId) && s.owned.discs.includes(b.discId) && s.owned.tips.includes(b.tipId))) setDeck(r.data.deck)
    })
  }, [])

  const valid = deckValid(deck)
  const used = useMemo(() => {
    const count = new Map<string, number>()
    for (const b of deck) for (const k of [`b:${b.bladeId}`, `d:${b.discId}`, `t:${b.tipId}`]) count.set(k, (count.get(k) ?? 0) + 1)
    return count
  }, [deck])
  const clash = (k: string) => (used.get(k) ?? 0) > 1
  const set = (patch: Partial<TopBuild>) => setDeck(d => d.map((b, i) => (i === slot ? { ...b, ...patch } : b)))

  const find = async () => {
    setBusy(true)
    setError(null)
    const r = await api<IssuedGhost>('POST', '/v1/ranked/start', { deck, pool })
    setBusy(false)
    if (!r.ok) return setError(r.status === 0 ? 'No connection. Ranked needs the internet.' : 'Could not start a ranked match. Try again.')
    log('ranked.start', { pool, opponent: r.data.opponent.name, rating: r.data.opponent.rating })
    nav.push({ k: 'ghost', issued: r.data, kind: 'ranked' })
  }

  const rating = info ? (pool === 'motion' ? info.rating : info.ratingSwipe) : null
  return (
    <Screen className="ranked" bg="backgrounds/arena">
      <TopBar title="Ranked" />
      <section className="rank-card">
        <Img id="ui/icons/ranked" className="rank-icon" />
        <span className="rank-label">{pool === 'motion' ? 'Motion league' : 'Swipe league'}</span>
        <strong className="rank-rating">{rating ?? '—'}</strong>
        <span className="rank-record">{info ? `${info.won} wins · ${info.played - info.won} losses` : offline ? 'Offline' : <Skeleton kind="line" w={120} />}</span>
      </section>
      {locked ? (
        <section className="setting locked-card">
          <div>
            <strong>Ranked opens with a full deck</strong>
            <span>You need 3 blades, 3 discs and 3 tips so no part repeats. Win them in the Spirit Tower or buy them in the Shop.</span>
          </div>
          <div className="lock-bars">
            <span>Blades {Math.min(3, s.owned.blades.length)}/3</span><Bar value={Math.min(3, s.owned.blades.length)} max={3} />
            <span>Discs {Math.min(3, s.owned.discs.length)}/3</span><Bar value={Math.min(3, s.owned.discs.length)} max={3} />
            <span>Tips {Math.min(3, s.owned.tips.length)}/3</span><Bar value={Math.min(3, s.owned.tips.length)} max={3} />
          </div>
          <div className="lock-actions">
            <Slash tone="gold" onClick={() => nav.push({ k: 'tower' })}>Spirit Tower</Slash>
            <Slash tone="ghost" onClick={() => nav.push({ k: 'shop' })}>Shop</Slash>
          </div>
        </section>
      ) : (
        <>
          <section className="deck" aria-label="Ranked deck, played in order">
            {deck.map((b, i) => (
              <button key={i} className={`deck-slot ${slot === i ? 'on' : ''}`} onClick={() => setSlot(i)} aria-pressed={slot === i} aria-label={`Top ${i + 1}: ${BEASTS[b.beastId].name}`}>
                <span className="deck-order">{i + 1}</span>
                <TopPreview build={b} size={84} />
                <span className="deck-beast">{BEASTS[b.beastId].name}</span>
              </button>
            ))}
          </section>
          <section className="deck-editor">
            <PartRow label="Blade" ids={s.owned.blades} value={deck[slot]!.bladeId} name={id => partName('blade', id)} img={id => `parts/blade-${id}`} bad={id => id === deck[slot]!.bladeId && clash(`b:${id}`)} onPick={id => set({ bladeId: id })} />
            <PartRow label="Disc" ids={s.owned.discs} value={deck[slot]!.discId} name={id => partName('disc', id)} img={id => `parts/disc-${id}`} bad={id => id === deck[slot]!.discId && clash(`d:${id}`)} onPick={id => set({ discId: id })} />
            <PartRow label="Tip" ids={s.owned.tips} value={deck[slot]!.tipId} name={id => partName('tip', id)} img={id => `parts/tip-${id}`} bad={id => id === deck[slot]!.tipId && clash(`t:${id}`)} onPick={id => set({ tipId: id })} />
            <PartRow label="Spirit" ids={beasts} value={deck[slot]!.beastId} name={id => BEASTS[id as BeastId].name} img={id => `beasts/${id}/emblem`} bad={() => false} onPick={id => set({ beastId: id as BeastId })} />
          </section>
          <p className={`fine ${valid ? '' : 'warn'}`} role="status">{valid ? 'Tops play in order: 1, 2, 3, then repeat. Spirit effects are equal for everyone.' : 'Each blade, disc and tip can be used once per deck.'}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Slash tone="gold" onClick={() => void find()} disabled={!valid || busy || offline}>{busy ? 'Finding a rival…' : 'Find a rival'}</Slash>
        </>
      )}
    </Screen>
  )
}

function PartRow({ label, ids, value, name, img, bad, onPick }: { label: string; ids: string[]; value: string; name: (id: string) => string; img: (id: string) => string; bad: (id: string) => boolean; onPick: (id: string) => void }) {
  return (
    <div className="part-row" role="radiogroup" aria-label={label}>
      <span className="part-row-label">{label}</span>
      <div className="part-row-items">
        {ids.map(id => (
          <button key={id} role="radio" aria-checked={id === value} className={`part-chip ${id === value ? 'on' : ''} ${bad(id) ? 'bad' : ''}`} onClick={() => onPick(id)}>
            <Img id={img(id)} eager />
            <span>{name(id)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface CupSummary { id: string; name: string; status: string; round: number; roundsTotal: number; code: string }
interface Entry { playerId: string; name: string; points: number; wins: number; losses: number }
interface CupPairing { id: string; round: number; a: string; b: string | null; winner: string | null; scores: [number, number] | null; resolvedBy: string | null }
interface Cup { id: string; code: string; name: string; status: 'lobby' | 'running' | 'done'; format: string; ownerId: string; round: number; roundsTotal: number; roundDeadline: string | null; entries: Entry[]; pairings: CupPairing[] }

const STATUS: Record<string, string> = { lobby: 'Waiting for players', running: 'In progress', done: 'Finished' }

export function Cups({ join }: { join?: string | undefined }) {
  const nav = useNav()
  const [list, setList] = useState<CupSummary[] | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState(join ?? '')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void api<{ tournaments?: CupSummary[] }>('GET', '/v1/tournaments').then(r => (r.ok ? setList(r.data.tournaments ?? []) : setError('Tournaments need a connection.'))) }, [])
  const create = async () => {
    const r = await api<Cup>('POST', '/v1/tournaments', { name: name.trim() || 'Spirit Cup' })
    if (!r.ok) return setError('Could not create the tournament. Try again.')
    nav.push({ k: 'cup', id: r.data.id })
  }
  const enter = async (c: string) => {
    const r = await api<Cup & { error?: string }>('POST', '/v1/tournaments/join', { code: c })
    if (r.status === 404) return setError('No tournament has that code.')
    if (r.status === 409) return setError(r.data.error === 'full' ? 'That tournament is full (16 players).' : 'That tournament has already started.')
    if (!r.ok) return setError('Could not join. Try again.')
    nav.push({ k: 'cup', id: r.data.id })
  }
  useEffect(() => { if (join && /^[A-Za-z0-9]{6}$/.test(join)) void enter(join) }, [join])
  return (
    <Screen className="cups">
      <TopBar title="Tournaments" />
      <form className="setting recover-form" onSubmit={e => { e.preventDefault(); void create() }}>
        <div><strong>Host a tournament</strong><span>4–16 friends. Each round lasts a day; absent players send their ghost.</span></div>
        <input value={name} onChange={e => setName(e.target.value.slice(0, 40))} placeholder="Friday Cup" aria-label="Tournament name" />
        <button>Create</button>
      </form>
      <form className="setting recover-form" onSubmit={e => { e.preventDefault(); void enter(code) }}>
        <div><strong>Join a tournament</strong><span>Enter the 6-character code from the host.</span></div>
        <input value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} placeholder="CUP234" maxLength={6} autoCapitalize="characters" aria-label="Tournament code" />
        <button disabled={code.length !== 6}>Join</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="friend-list">
        <h2>Your tournaments</h2>
        {list === null ? <SkeletonList rows={3} /> : list.length === 0 ? <div className="empty-state"><Img id="ui/icons/cups" /><p>No tournaments yet. Host one above and send the code to your friends.</p></div> : list.map(c => (
          <button key={c.id} className="friend cup-row" onClick={() => nav.push({ k: 'cup', id: c.id })}>
            <span className="friend-initial" aria-hidden>{c.name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{c.name}</strong><span>{c.status === 'running' ? `Round ${c.round} of ${c.roundsTotal}` : STATUS[c.status]}</span></div>
            <span className={`status-chip ${c.status}`}>{c.status === 'done' ? 'Final' : c.status === 'running' ? 'Live' : 'Lobby'}</span>
          </button>
        ))}
      </section>
    </Screen>
  )
}

const until = (iso: string | null) => {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'ending now'
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h ? `ends in ${h}h ${m}m` : `ends in ${m}m`
}

export function CupScreen({ id }: { id: string }) {
  const nav = useNav()
  const rt = useRuntime()
  const s = useSave()
  const [cup, setCup] = useState<Cup | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const c = await api<Cup>('GET', `/v1/tournaments/${id}`)
    if (!c.ok) return setError(c.status === 0 ? 'Tournaments need a connection.' : 'This tournament is not available.')
    setCup(c.data)
    setError(null)
  }
  useEffect(() => { void api<{ playerId?: string }>('GET', '/v1/me').then(m => setMe(m.data.playerId ?? null)) }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => clearInterval(t)
  }, [id])
  if (!cup) return <Screen className="cup"><TopBar title="Tournament" />{error ? <p className="form-error" role="alert">{error}</p> : <Loader label="Loading tournament" tips={false} />}</Screen>

  const nameOf = (pid: string | null) => cup.entries.find(e => e.playerId === pid)?.name ?? 'Bye'
  const mine = cup.pairings.find(p => p.round === cup.round && (p.a === me || p.b === me))
  const opponent = mine ? (mine.a === me ? mine.b : mine.a) : null
  const link = `${location.origin}/?cup=${cup.code}`
  const share = () => (navigator.share ? void navigator.share({ title: cup.name, text: `Join my Spirit Spin tournament "${cup.name}" with code ${cup.code}`, url: link }).catch(() => undefined) : void navigator.clipboard?.writeText(link))
  const start = async () => {
    setBusy(true)
    const r = await api<Cup & { error?: string }>('POST', `/v1/tournaments/${cup.id}/start`)
    setBusy(false)
    if (!r.ok) return setError(r.data.error ?? 'Could not start.')
    setCup(r.data)
  }
  const play = async () => {
    if (!mine) return
    setBusy(true)
    const pool: 'motion' | 'swipe' = rt.sensors && s.settings.inputMode !== 'swipe' ? 'motion' : 'swipe'
    const r = await api<IssuedGhost & { error?: string }>('POST', `/v1/tournaments/${cup.id}/pairings/${mine.id}/play`, { pool })
    setBusy(false)
    if (!r.ok) {
      void load()
      return setError(r.data.error === 'already decided' ? 'This match was already decided.' : r.data.error === 'already played' ? 'You already used your attempt for this match.' : r.data.error ?? 'Could not start the match. Try again.')
    }
    nav.push({ k: 'ghost', issued: r.data, kind: 'tournament', cupId: cup.id })
  }

  return (
    <Screen className="cup">
      <TopBar title={cup.name} />
      <section className="cup-head">
        <span className={`status-chip ${cup.status}`}>{cup.status === 'running' ? `Round ${cup.round} of ${cup.roundsTotal}` : STATUS[cup.status]}</span>
        {cup.status === 'running' && <span className="fine">{until(cup.roundDeadline)}</span>}
        {cup.status === 'lobby' && (
          <button className="code-chip" onClick={share} aria-label="Share tournament code">{cup.code}<em>Share invite</em></button>
        )}
      </section>

      {cup.status === 'lobby' && (
        <section className="setting lobby-card">
          <div><strong>{cup.entries.length} of 16 players</strong><span>{cup.entries.length < 4 ? `Needs ${4 - cup.entries.length} more to start.` : cup.ownerId === me ? 'Ready when you are.' : 'Waiting for the host to start.'}</span></div>
          {cup.ownerId === me && <Slash tone="gold" onClick={() => void start()} disabled={cup.entries.length < 4 || busy}>Start</Slash>}
        </section>
      )}

      {cup.status === 'running' && mine && (
        <section className="match-card">
          {mine.b === null ? <p><strong>Bye this round.</strong> You get 3 points.</p> : mine.winner ? (
            <p><strong>{mine.winner === me ? 'You won' : 'You lost'}</strong> against {nameOf(opponent)} {mine.scores ? `${mine.a === me ? mine.scores[0] : mine.scores[1]}–${mine.a === me ? mine.scores[1] : mine.scores[0]}` : ''}</p>
          ) : (
            <>
              <p>Your match: <strong>{nameOf(opponent)}</strong></p>
              <Slash tone="gold" onClick={() => void play()} disabled={busy}>{busy ? 'Summoning…' : `Battle ${nameOf(opponent)}'s ghost`}</Slash>
              <span className="fine">Their ghost uses their real launches and fighting style.</span>
            </>
          )}
        </section>
      )}

      {cup.status === 'done' && <section className="champion"><span>Champion</span><strong className="slant">{cup.entries[0]?.name}</strong></section>}

      <section className="standings" aria-label="Standings">
        <h2>Standings</h2>
        <ol>
          {cup.entries.map((e, i) => (
            <li key={e.playerId} className={e.playerId === me ? 'me' : ''}>
              <span className="pos">{i + 1}</span><span className="who">{e.name}</span><span className="wl">{e.wins}–{e.losses}</span><strong className="pts">{e.points}</strong>
            </li>
          ))}
        </ol>
      </section>

      {cup.pairings.length > 0 && (
        <section className="rounds">
          <h2>Rounds</h2>
          {[...new Set(cup.pairings.map(p => p.round))].reverse().map(r => (
            <div key={r} className="round-block">
              <span className="round-title">Round {r}</span>
              {cup.pairings.filter(p => p.round === r).map(p => (
                <div key={p.id} className="pairing">
                  <span className={p.winner === p.a ? 'won' : ''}>{nameOf(p.a)}</span>
                  <em>{p.b === null ? 'bye' : p.scores ? `${p.scores[0]}–${p.scores[1]}` : 'vs'}</em>
                  <span className={p.winner && p.winner === p.b ? 'won' : ''}>{p.b === null ? '' : nameOf(p.b)}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Screen>
  )
}
