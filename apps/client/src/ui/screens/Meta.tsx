import { awakenedForm, awakeningHints, awakeningReady, BLADES, DISCS, shopRotation, TIPS, type BeastId, type Mood } from '@spirit/core'
import { useEffect, useMemo, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useNav } from '../../state/nav'
import { todayKey, useSave } from '../../state/save'
import { spiritMoment } from '../../state/spiritAi'
import { recover, recoveryCode } from '../../state/sync'
import { Axis, Bar, Img, Screen, Slash, TopBar } from '../kit'
import { beastArt } from './Home'

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
      <div className="beast-tabs">
        {owned.map(o => <button key={o} className={o === id ? 'on' : ''} onClick={() => setId(o)}><Img id={`beasts/${o}/emblem`} alt={BEASTS[o].name} /></button>)}
      </div>
      <section className="journal-head" style={{ ['--c' as string]: info.color }}>
        <Img id={`beasts/${id}/expressions/${b.trust < 25 ? 'sulky' : 'neutral'}`} className="journal-face" />
        <div>
          <strong className="slant">{info.name}{b.awakened ? ` · ${b.awakened}` : ''}</strong>
          <span>{b.battles} battles together · {b.counters.wins} wins</span>
          <Bar label="Trust" value={b.trust} max={100} tone="cyan" />
          <Bar label="Respect" value={b.respect} max={100} tone="gold" />
        </div>
      </section>
      <section className="temperament">
        <Axis left="Cautious" right="Reckless" value={b.courage} />
        <Axis left="Humble" right="Proud" value={b.pride} />
        <Axis left="Habitual" right="Curious" value={b.curiosity} />
        <Axis left="Fiery" right="Serene" value={b.calm} />
      </section>
      {!b.awakened && (
        <section className="hints">
          <h3>Path to awakening</h3>
          {awakeningHints(b).map(h => <p key={h.text} className={h.done ? 'done' : ''}>{h.done ? '✓' : '○'} {h.text}</p>)}
        </section>
      )}
      <section className="memories">
        <h3>Memories</h3>
        {b.memories.length === 0 ? <p className="fine">No memories yet. Every battle leaves a mark.</p> : b.memories.slice(0, 8).map((m, i) => <p key={i}><b>{m.at}</b> {m.text}</p>)}
      </section>
    </Screen>
  )
}

export function Awaken() {
  const nav = useNav()
  const s = useSave()
  const id = (s.loadout?.beastId ?? 'voltfang') as BeastId
  const b = s.beasts[id]
  const form = useMemo(() => (b ? awakenedForm(b) : 'storm'), [b])
  const [done, setDone] = useState(false)
  const [line, setLine] = useState<{ text: string; mood: Mood } | null>(null)
  const ready = !!b && awakeningReady(b)
  const awaken = () => {
    if (!b) return
    const next = { ...b, awakened: form }
    s.setBeast(next)
    setDone(true)
    void spiritMoment('awaken', next, null, null).then(ai => {
      const text = ai?.line ?? 'I can feel everything we went through. Thank you, partner.'
      setLine({ text, mood: ai?.mood ?? 'joyful' })
      const cur = useSave.getState().beasts[id]
      if (cur) useSave.getState().setBeast({ ...cur, memories: [{ at: todayKey(), text: `We awakened together into the ${form} form.`, importance: 5, tags: ['awakening'] }, ...cur.memories].slice(0, 50) })
    })
  }
  useEffect(() => {
    if (!done && !ready) nav.replace({ k: 'journal' })
  }, [done, ready, nav])
  if (!b || (!done && !ready)) return null
  return (
    <Screen className="awaken center">
      <div className="awaken-stage" style={{ ['--c' as string]: BEASTS[id].color }}>
        <Img id={`beasts/${id}/awakened-${form}/summon`} className={`awaken-art ${done ? 'lit' : ''}`} fallback={<Img id={`beasts/${id}/awakened-${form}/cutin`} className={`awaken-art ${done ? 'lit' : ''}`} />} />
      </div>
      <h2 className="slant">{done ? `${form} ${BEASTS[id].name}` : `${BEASTS[id].name} is changing…`}</h2>
      <p className="body">{done ? 'Your bond shaped this form. Its Spirit Skill burns brighter.' : 'Everything you went through together is taking shape.'}</p>
      {done && (
        <div className="speech awaken-speech">
          <Img id={`beasts/${id}/awakened-${form}/expressions/${line?.mood ?? 'joyful'}`} className="speech-face" />
          <p aria-live="polite">{line ? line.text : <span className="typing">…</span>}</p>
        </div>
      )}
      {done ? <Slash tone="gold" onClick={() => nav.reset({ k: 'home' })}>Continue</Slash> : <Slash tone="gold" onClick={awaken}>Awaken</Slash>}
    </Screen>
  )
}

export function Collection() {
  const s = useSave()
  const [tab, setTab] = useState<'beasts' | 'blades' | 'discs' | 'tips'>('beasts')
  const all = tab === 'beasts' ? (Object.keys(BEASTS) as BeastId[]) : tab === 'blades' ? Object.keys(BLADES) : tab === 'discs' ? Object.keys(DISCS) : Object.keys(TIPS)
  const has = (id: string) => (tab === 'beasts' ? id in s.beasts : s.owned[tab].includes(id))
  const rarity = (id: string) => (tab === 'blades' ? BLADES[id]?.rarity : tab === 'discs' ? DISCS[id]?.rarity : tab === 'tips' ? TIPS[id]?.rarity : 'epic') ?? 'common'
  const img = (id: string) => (tab === 'beasts' ? `${beastArt(id as BeastId, s.beasts[id as BeastId]?.awakened)}/card-art` : `parts/${tab.slice(0, -1)}-${id}`)
  return (
    <Screen className="collection">
      <TopBar title="Collection" />
      <div className="tabs" role="tablist">
        {(['beasts', 'blades', 'discs', 'tips'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className={`card-grid ${tab}`}>
        {all.map(id => (
          <div key={id} className={`card ${has(id) ? '' : 'locked'}`}>
            <div className="card-inner">
              <Img id={img(id)} className="card-img" fallback={<Img id={`beasts/${id}/card-art`} className="card-img" />} />
              <Img id={`ui/card-frame-${rarity(id)}`} className="card-frame" />
            </div>
            <span>{tab === 'beasts' ? BEASTS[id as BeastId].name : (tab === 'blades' ? BLADES[id]?.name : tab === 'discs' ? DISCS[id]?.name : TIPS[id]?.name)}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

export function Shop() {
  const s = useSave()
  const items = useMemo(() => shopRotation(todayKey()), [])
  const [msg, setMsg] = useState<string | null>(null)
  const owns = (kind: 'blade' | 'disc' | 'tip', id: string) => s.owned[`${kind}s`].includes(id)
  const buy = (kind: 'blade' | 'disc' | 'tip', id: string, price: number) => {
    if (!s.spend(price)) return setMsg('Not enough coins yet. Win Tower battles and finish quests to earn more.')
    s.addPart(`${kind}s`, id)
    setMsg(`Bought ${id}. Equip it in the Garage.`)
  }
  return (
    <Screen className="shop">
      <TopBar title="Shop" />
      <p className="fine">New parts every day. Rarity changes the look and feel, never the power budget.</p>
      <div className="shop-grid">
        {items.map(it => (
          <div key={it.id} className={`shop-item ${it.rarity}`}>
            <Img id={`parts/${it.kind}-${it.partId}`} className="shop-img" />
            <strong>{(it.kind === 'blade' ? BLADES[it.partId]?.name : it.kind === 'disc' ? DISCS[it.partId]?.name : TIPS[it.partId]?.name) ?? it.partId}</strong>
            <span>{it.kind} · {it.rarity}</span>
            {owns(it.kind, it.partId) ? <em>Owned</em> : <button onClick={() => buy(it.kind, it.partId, it.price)}><Img id="ui/icon-coin" />{it.price}</button>}
          </div>
        ))}
      </div>
      {msg && <p className="toast pop" onAnimationEnd={() => setTimeout(() => setMsg(null), 2200)}>{msg}</p>}
    </Screen>
  )
}

export function Settings() {
  const s = useSave()
  const nav = useNav()
  const [confirmReset, setConfirmReset] = useState(false)
  const toggle = (k: 'silentSpirit' | 'sound' | 'haptics' | 'reducedMotion', label: string, hint: string) => (
    <label className="setting">
      <div><strong>{label}</strong><span>{hint}</span></div>
      <input type="checkbox" checked={s.settings[k]} onChange={e => s.patchSettings({ [k]: e.target.checked })} />
    </label>
  )
  return (
    <Screen className="settings">
      <TopBar title="Settings" />
      <label className="setting">
        <div><strong>Launch with</strong><span>Motion rips your phone; swipe works anywhere.</span></div>
        <select value={s.settings.inputMode} onChange={e => s.patchSettings({ inputMode: e.target.value as 'auto' | 'swipe' })}>
          <option value="auto">Motion when available</option>
          <option value="swipe">Always swipe</option>
        </select>
      </label>
      {toggle('silentSpirit', 'Silent Spirit Call', 'Hold the button instead of shouting.')}
      {toggle('sound', 'Sound', 'Music and effects.')}
      {toggle('haptics', 'Vibration', 'Android only.')}
      {toggle('reducedMotion', 'Reduce motion', 'Fewer screen shakes and flashes.')}
      <div className="setting recovery">
        <div><strong>Your recovery code</strong><span>Write it down. It restores your progress on a new phone.</span></div>
        <code>{recoveryCode() ?? 'Offline'}</code>
      </div>
      <RecoverForm />
      <Slash tone="ghost" onClick={() => nav.push({ k: 'calibrate' })}>Recalibrate launcher</Slash>
      {confirmReset ? (
        <div className="danger">
          <p>This erases all progress on this device. It cannot be undone.</p>
          <Slash tone="ghost" onClick={() => setConfirmReset(false)}>Keep my progress</Slash>
          <button className="danger-btn" onClick={() => { s.reset(); nav.reset({ k: 'splash' }) }}>Erase everything</button>
        </div>
      ) : (
        <button className="text-btn" onClick={() => setConfirmReset(true)}>Erase progress…</button>
      )}
    </Screen>
  )
}

function RecoverForm() {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'bad' | 'ok'>('idle')
  return (
    <form className="setting recover-form" onSubmit={async e => { e.preventDefault(); setState('busy'); setState((await recover(code)) ? 'ok' : 'bad') }}>
      <div><strong>Restore progress</strong><span>{state === 'bad' ? 'That code did not match any player.' : state === 'ok' ? 'Progress restored.' : 'Enter a recovery code from another device.'}</span></div>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="ABCD-EFGH-JKLM" maxLength={14} autoCapitalize="characters" aria-label="Recovery code" />
      <button disabled={code.length < 12 || state === 'busy'}>Restore</button>
    </form>
  )
}
