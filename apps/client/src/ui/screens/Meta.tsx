import { awakenedForm, awakeningHints, awakeningReady, BLADES, DISCS, dropFloor, shopRotation, TECHNIQUES, TIPS, type BeastId, type Mood } from '@spirit/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useRuntime } from '../../runtime'
import { useNav, type Route } from '../../state/nav'
import { todayKey, useSave } from '../../state/save'
import { spiritMoment } from '../../state/spiritAi'
import { recover, recoveryCode } from '../../state/sync'
import { Axis, Img, Screen, Slash, TopBar } from '../kit'
import { beastArt } from './Home'
import { CosmeticShop } from './Style'
import { PartSheet } from '../PartSheet'
import { canAfford, needMore } from '../../state/shortage'

export function Journal() {
  const s = useSave()
  const owned = Object.keys(s.beasts) as BeastId[]
  const [id, setId] = useState<BeastId>(s.loadout?.beastId ?? owned[0] ?? 'voltfang')
  const b = s.beasts[id]
  if (!b) return null
  const info = BEASTS[id]
  return (
    <Screen className="journal" bg="backgrounds/journal">
      <TopBar title="Spirit Journal" />
      <div className="j2-tabs" role="tablist" aria-label="Beasts">
        {owned.map(o => <button key={o} role="tab" aria-selected={o === id} className={o === id ? 'on' : ''} style={{ ['--c' as string]: BEASTS[o].color }} onClick={() => setId(o)}><Img id={`beasts/${o}/emblem`} alt="" /><span>{BEASTS[o].name}</span></button>)}
      </div>
      <section className="j2-head" style={{ ['--c' as string]: info.color }}>
        <Img id={`${beastArt(id, b.awakened)}/expressions/${b.trust < 25 ? 'sulky' : 'neutral'}`} className="j2-face" fallback={<Img id={`beasts/${id}/expressions/neutral`} className="j2-face" />} />
        <div className="j2-id">
          <span>{info.title}{b.awakened ? ` · ${b.awakened} form` : ''}</span>
          <strong>{info.name}</strong>
          <small>{b.battles} battles together · {b.counters.wins} wins</small>
          <div className="j2-meter"><label>Trust</label><i><i style={{ transform: `scaleX(${b.trust / 100})` }} /></i><b>{b.trust}</b></div>
          <div className="j2-meter gold"><label>Respect</label><i><i style={{ transform: `scaleX(${b.respect / 100})` }} /></i><b>{b.respect}</b></div>
        </div>
      </section>
      <section className="temperament">
        <Axis left="Cautious" right="Reckless" value={b.courage} />
        <Axis left="Humble" right="Proud" value={b.pride} />
        <Axis left="Habitual" right="Curious" value={b.curiosity} />
        <Axis left="Fiery" right="Serene" value={b.calm} />
      </section>
      {!b.awakened && (
        <section className="j2-path panel">
          <h2 className="section-title">Path to awakening<small>{awakeningHints(b).filter(h => h.done).length}/{awakeningHints(b).length}</small></h2>
          <ul>{awakeningHints(b).map(h => <li key={h.text} className={h.done ? 'done' : ''}>{h.text}</li>)}</ul>
        </section>
      )}
      <section className="memories j2-mem panel">
        <h2 className="section-title">Memories</h2>
        {b.memories.length === 0 ? <p className="fine">No memories yet. Every battle leaves a mark.</p> : b.memories.slice(0, 8).map((m, i) => <p key={i}><b>{m.at}</b> {m.text}</p>)}
      </section>
    </Screen>
  )
}

const AURA: Record<BeastId, string> = { voltfang: 'vfx/hit-lightning', aegiron: 'vfx/hit-crystal', nagara: 'vfx/hit-water', agnyx: 'vfx/hit-fire', zephyra: 'vfx/hit-wind', umbrax: 'vfx/hit-shadow' }
const CHARGE_MS = 1300
const BURST_MS = 320

export function Awaken({ then }: { then?: Route | undefined } = {}) {
  const nav = useNav()
  const rt = useRuntime()
  const s = useSave()
  const id = (s.loadout?.beastId ?? 'voltfang') as BeastId
  const b = s.beasts[id]
  const form = useMemo(() => (b ? awakenedForm(b) : 'storm'), [b])
  const [phase, setPhase] = useState<'idle' | 'charge' | 'burst' | 'done'>('idle')
  const [line, setLine] = useState<{ text: string; mood: Mood } | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const ready = !!b && awakeningReady(b)
  const started = phase !== 'idle'
  const awaken = () => {
    if (!b || started) return
    const next = { ...b, awakened: form }
    s.setBeast(next)
    rt.sound.play('spirit', { volume: 0.8 })
    void spiritMoment('awaken', next, null, null).then(ai => {
      const text = ai?.line ?? 'I can feel everything we went through. Thank you, partner.'
      setLine({ text, mood: ai?.mood ?? 'joyful' })
      const cur = useSave.getState().beasts[id]
      if (cur) useSave.getState().setBeast({ ...cur, memories: [{ at: todayKey(), text: `We awakened together into the ${form} form.`, importance: 5, tags: ['awakening'] }, ...cur.memories].slice(0, 50) })
    })
    if (s.settings.reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setPhase('done')
    setPhase('charge')
    timers.current.push(window.setTimeout(() => { setPhase('burst'); rt.sound.play('callout') }, CHARGE_MS))
    timers.current.push(window.setTimeout(() => setPhase('done'), CHARGE_MS + BURST_MS))
  }
  useEffect(() => {
    if (!started && !ready) nav.replace({ k: 'journal' })
  }, [started, ready, nav])
  if (!b || (!started && !ready)) return null
  const name = BEASTS[id].name
  return (
    <Screen className={`awaken2 aw-${phase}`}>
      <div className="aw-stage" style={{ ['--c' as string]: BEASTS[id].color }} aria-hidden="true">
        <Img id={`beasts/${id}/card-art`} className="aw-art aw-base" eager />
        <Img id={`beasts/${id}/awakened-${form}/card-art`} className="aw-art aw-new" eager fallback={<Img id={`beasts/${id}/awakened-${form}/summon`} className="aw-art aw-new" eager />} />
        <i className="aw-glow" />
        <Img id="vfx/shockwave" className="aw-ring in" eager />
        <Img id={AURA[id]} className="aw-el" eager />
        <Img id="vfx/shockwave" className="aw-ring out" eager />
        <i className="aw-flash" />
      </div>
      <div className="aw-copy">
        <h2 className="slant aw-name" style={{ ['--c' as string]: BEASTS[id].color }}>{phase === 'done' ? `${form} ${name}` : `${name} is changing…`}</h2>
        <p className="body">{phase === 'done' ? 'Your bond shaped this form. Its Spirit Skill burns brighter.' : 'Everything you went through together is taking shape.'}</p>
        {phase === 'done' && (
          <div className="speech awaken-speech">
            <Img id={`beasts/${id}/awakened-${form}/expressions/${line?.mood ?? 'joyful'}`} className="speech-face" />
            <p aria-live="polite">{line ? line.text : <span className="typing">…</span>}</p>
          </div>
        )}
        {phase === 'done' ? <Slash tone="gold" onClick={() => { nav.reset({ k: 'home' }); if (then) nav.push(then) }}>Continue</Slash> : <Slash tone="gold" disabled={started} onClick={awaken}>Awaken</Slash>}
      </div>
    </Screen>
  )
}

const BEAST_HINT: Partial<Record<BeastId, string>> = { zephyra: 'Beat Vex on Tower floor 40', umbrax: 'Beat Ren on Tower floor 50' }
const partName = (kind: 'blade' | 'disc' | 'tip', id: string) => (kind === 'blade' ? BLADES : kind === 'disc' ? DISCS : TIPS)[id]?.name ?? id

export function Collection() {
  const s = useSave()
  const [tab, setTab] = useState<'beasts' | 'blades' | 'discs' | 'tips'>('beasts')
  const [sheet, setSheet] = useState<{ kind: 'blade' | 'disc' | 'tip'; id: string } | null>(null)
  const kind = tab === 'beasts' ? null : (tab.slice(0, -1) as 'blade' | 'disc' | 'tip')
  const all = tab === 'beasts' ? (Object.keys(BEASTS) as BeastId[]) : Object.keys(tab === 'blades' ? BLADES : tab === 'discs' ? DISCS : TIPS)
  const has = (id: string) => (tab === 'beasts' ? id in s.beasts : s.owned[tab].includes(id))
  const total = Object.keys(BEASTS).length + Object.keys(BLADES).length + Object.keys(DISCS).length + Object.keys(TIPS).length
  const got = Object.keys(s.beasts).filter(id => id in BEASTS).length + s.owned.blades.filter(id => id in BLADES).length + s.owned.discs.filter(id => id in DISCS).length + s.owned.tips.filter(id => id in TIPS).length
  const partHint = (k: 'blade' | 'disc' | 'tip', id: string) => {
    const f = dropFloor(k, id)
    return f ? (f <= s.tower ? 'In the Shop rotation' : `Tower floor ${f}`) : 'Daily Shop'
  }
  return (
    <Screen className="collection2">
      <TopBar title="Collection" />
      <div className="c2-progress">
        <span><b>{got}</b> of {total} collected</span>
        <i><i style={{ transform: `scaleX(${got / total})` }} /></i>
      </div>
      <div className="p2-tabs" role="tablist">
        {(['beasts', 'blades', 'discs', 'tips'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
      </div>
      {!kind ? (
        <div className="c2-beasts">
          {all.map(id => {
            const b = id as BeastId, info = BEASTS[b], own = has(id)
            return (
              <article key={id} className={`c2-beast ${own ? '' : 'locked'}`} style={{ ['--c' as string]: info.color }}>
                <Img id={`${beastArt(b, s.beasts[b]?.awakened)}/card-art`} className="c2-art" fallback={<Img id={`beasts/${b}/card-art`} className="c2-art" />} />
                <div className="c2-beast-info">
                  <span>{info.title}</span>
                  <strong>{own ? info.name : '???'}</strong>
                  <em>{own ? TECHNIQUES[b].technique.name : BEAST_HINT[b] ?? 'Tower boss reward'}</em>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="c2-parts">
          {all.map(id => {
            const own = has(id), part = (kind === 'blade' ? BLADES : kind === 'disc' ? DISCS : TIPS)[id]!
            return (
              <button key={id} className={`c2-part ${part.rarity} ${own ? '' : 'locked'}`} onClick={() => setSheet({ kind, id })} aria-label={`${part.name}, ${own ? 'owned' : partHint(kind, id)}. Show details`}>
                <Img id={`parts/${kind}-${id}`} />
                <strong>{part.name}</strong>
                <span className={`rarity ${part.rarity}`}>{part.rarity}</span>
                {!own && <em>{partHint(kind, id)}</em>}
              </button>
            )
          })}
        </div>
      )}
      {sheet && <PartSheet kind={sheet.kind} id={sheet.id} onClose={() => setSheet(null)} />}
    </Screen>
  )
}

function useCountdown(): string {
  const left = () => {
    const d = new Date(), n = new Date(d)
    n.setHours(24, 0, 0, 0)
    const m = Math.max(0, Math.round((n.getTime() - d.getTime()) / 60000))
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }
  const [t, setT] = useState(left)
  useEffect(() => { const i = window.setInterval(() => setT(left()), 30000); return () => clearInterval(i) }, [])
  return t
}

const SHOP_KEY = 'spirit.shop-owned'

function dayOwned(day: string): ReadonlySet<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SHOP_KEY) ?? 'null') as { day?: string; ids?: string[] } | null
    if (v?.day === day && Array.isArray(v.ids)) return new Set(v.ids)
  } catch {
    return new Set()
  }
  const o = useSave.getState().owned
  const ids = [...o.blades.map(id => `blade:${id}`), ...o.discs.map(id => `disc:${id}`), ...o.tips.map(id => `tip:${id}`)]
  try { localStorage.setItem(SHOP_KEY, JSON.stringify({ day, ids })) } catch { return new Set(ids) }
  return new Set(ids)
}

export function Shop() {
  const s = useSave()
  const tower = useSave(s => s.tower)
  const refresh = useCountdown()
  const day = todayKey()
  const ownedAtOpen = useMemo(() => dayOwned(day), [day])
  const items = useMemo(() => shopRotation(day, 6, tower, ownedAtOpen), [day, tower, refresh, ownedAtOpen])
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'parts' | 'cosmetics'>('parts')
  const [sheet, setSheet] = useState<(typeof items)[number] | null>(null)
  const nav = useNav()
  const owns = (kind: 'blade' | 'disc' | 'tip', id: string) => s.owned[`${kind}s`].includes(id)
  const buy = (kind: 'blade' | 'disc' | 'tip', id: string, price: number) => {
    if (!canAfford('coins', s.coins, price, `the ${partName(kind, id)}`)) return setSheet(null)
    if (!s.spend(price)) return needMore('coins', price - s.coins, `the ${partName(kind, id)}`)
    s.addPart(`${kind}s`, id)
    setMsg(`${partName(kind, id)} is yours. Equip it in the Garage.`)
  }
  return (
    <Screen className="shop">
      <TopBar title="Shop" />
      <div className="tabs">
        <div className="tabs" role="tablist" aria-label="Shop" style={{ flex: 2 }}>
          <button role="tab" aria-selected={tab === 'parts'} className={tab === 'parts' ? 'on' : ''} onClick={() => setTab('parts')}>Parts</button>
          <button role="tab" aria-selected={tab === 'cosmetics'} className={tab === 'cosmetics' ? 'on' : ''} onClick={() => setTab('cosmetics')}>Cosmetics</button>
        </div>
        <button onClick={() => nav.push({ k: 'pass' })}>Spirit Pass ›</button>
      </div>
      {tab === 'cosmetics' ? <CosmeticShop /> : (<>
      <div className="s2-head">
        <span>Today's parts</span>
        <em>New stock in {refresh}</em>
      </div>
      <p className="s2-note">Clearing Tower floors adds their story parts to the shop.</p>
      {items.length === 0 && <p className="s2-note">You own every part on sale. Clear more Tower floors to unlock new ones.</p>}
      <div className="shop-grid">
        {items.map(it => (
          <button key={it.id} className={`shop-item ${it.rarity}`} onClick={() => setSheet(it)} aria-label={`${partName(it.kind, it.partId)}, ${it.rarity} ${it.kind}, ${owns(it.kind, it.partId) ? 'owned' : `${it.price} coins`}. Show details`}>
            <Img id={`parts/${it.kind}-${it.partId}`} className="shop-img" />
            <strong>{partName(it.kind, it.partId)}</strong>
            <span><b className={`rarity ${it.rarity}`}>{it.rarity}</b> {it.kind}</span>
            {owns(it.kind, it.partId) ? <em>Owned</em> : <i className="shop-price"><Img id="ui/icon-coin" />{it.price}</i>}
          </button>
        ))}
      </div>
      </>)}
      {sheet && <PartSheet kind={sheet.kind} id={sheet.partId} price={sheet.price} onClose={() => setSheet(null)} onBuy={() => buy(sheet.kind, sheet.partId, sheet.price)} />}
      {msg && <p className="toast pop" onAnimationEnd={() => setTimeout(() => setMsg(null), 2200)}>{msg}</p>}
    </Screen>
  )
}

export function Settings() {
  const s = useSave()
  const nav = useNav()
  const [confirmReset, setConfirmReset] = useState(false)
  const [copied, setCopied] = useState(false)
  const code = recoveryCode()
  const toggle = (k: 'silentSpirit' | 'sound' | 'haptics' | 'reducedMotion' | 'commentator', label: string, hint: string, def = true) => (
    <label className="set2-row">
      <span><strong>{label}</strong><small>{hint}</small></span>
      <input type="checkbox" role="switch" className="switch" checked={s.settings[k] ?? def} onChange={e => s.patchSettings({ [k]: e.target.checked })} />
    </label>
  )
  const copy = () => {
    if (!code) return
    void navigator.clipboard?.writeText(code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) })
  }
  return (
    <Screen className="settings2">
      <TopBar title="Settings" />
      <h2 className="section-title">Launch and controls</h2>
      <div className="set2-group panel">
        <label className="set2-row">
          <span><strong>Launch with</strong><small>Motion uses your phone rip. Swipe works anywhere.</small></span>
          <select value={s.settings.inputMode} onChange={e => s.patchSettings({ inputMode: e.target.value as 'auto' | 'swipe' })}>
            <option value="auto">Motion</option>
            <option value="swipe">Swipe</option>
          </select>
        </label>
        {toggle('silentSpirit', 'Silent Spirit Call', 'Tap the button instead of shouting.', false)}
        <button className="set2-row link" onClick={() => nav.push({ k: 'calibrate' })}><span><strong>Recalibrate launcher</strong><small>Teach the game your rip strength again.</small></span><em aria-hidden="true">›</em></button>
      </div>
      <h2 className="section-title">Sound and feel</h2>
      <div className="set2-group panel">
        {toggle('sound', 'Sound', 'Music and effects.')}
        {toggle('commentator', 'Commentator', 'The announcer calls the big moments.')}
        {toggle('haptics', 'Vibration', 'Buzz on clashes and finishes (Android).')}
        {toggle('reducedMotion', 'Reduce motion', 'Fewer shakes, flashes and replays.', false)}
      </div>
      <h2 className="section-title">Account</h2>
      <div className="set2-group panel">
        <div className="set2-row">
          <span><strong>Recovery code</strong><small>Keep it safe. It brings your progress to a new phone.</small></span>
          <button className="set2-code" disabled={!code} onClick={copy} aria-label={code ? `Recovery code ${code}. Tap to copy` : 'Offline'}>
            <code>{code ?? 'Offline'}</code><small>{copied ? 'Copied' : 'Copy'}</small>
          </button>
        </div>
        <RecoverForm />
      </div>
      {confirmReset ? (
        <div className="danger panel">
          <p>This erases all progress on this device. It cannot be undone.</p>
          <div className="danger-actions">
            <button className="ghost-btn" onClick={() => setConfirmReset(false)}>Keep my progress</button>
            <button className="danger-btn" onClick={() => { s.reset(); nav.reset({ k: 'splash' }) }}>Erase everything</button>
          </div>
        </div>
      ) : (
        <button className="text-btn set2-erase" onClick={() => setConfirmReset(true)}>Erase progress on this device</button>
      )}
      <p className="set2-version">Version {__BUILD__}</p>
    </Screen>
  )
}

function RecoverForm() {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'bad' | 'ok'>('idle')
  return (
    <form className="set2-row set2-recover" onSubmit={async e => { e.preventDefault(); setState('busy'); setState((await recover(code)) ? 'ok' : 'bad') }}>
      <span><strong>Restore progress</strong><small className={state === 'bad' ? 'bad' : ''}>{state === 'bad' ? 'That code did not match any player.' : state === 'ok' ? 'Progress restored.' : 'Enter a recovery code from another device.'}</small></span>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="ABCD-EFGH-JKLM" maxLength={14} autoCapitalize="characters" aria-label="Recovery code" />
      <button disabled={code.length < 12 || state === 'busy'}>Restore</button>
    </form>
  )
}
