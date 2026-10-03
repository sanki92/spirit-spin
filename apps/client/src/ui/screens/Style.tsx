import { BLADES, COSMETICS, DISCS, levelForXp, PASS, PASS_TIERS, passTier, SKUS, TIPS, xpForLevel, type PassReward } from '@spirit/core'
import { BEASTS } from '../../game/beasts'
import { useEffect, useState } from 'react'
import { useNav } from '../../state/nav'
import { ownsCosmetic, useSave } from '../../state/save'
import { buy, refreshEntitlements, type BuyResult } from '../purchase'
import { Bar, Img, Screen, Slash, TopBar } from '../kit'

const price = (paise: number) => `₹${Math.round(paise / 100)}`
const BUY_TEXT: Record<BuyResult, string> = {
  bought: 'Unlocked. Enjoy!',
  cancelled: 'Payment cancelled. You were not charged.',
  unavailable: 'Purchases are not open yet.',
  failed: 'We could not confirm the payment. If you were charged, it unlocks automatically within a few minutes.',
  pending: 'Payment received. It unlocks as soon as you are back online.',
}

function rewardArt(r: PassReward): { img: string | null; label: string } {
  if ('coins' in r) return { img: 'ui/icon-coin', label: `${r.coins} coins` }
  if ('part' in r) {
    const name = r.part.kind === 'blade' ? BLADES[r.part.id]?.name : r.part.kind === 'disc' ? DISCS[r.part.id]?.name : TIPS[r.part.id]?.name
    return { img: `parts/${r.part.kind}-${r.part.id}`, label: name ?? r.part.id }
  }
  const c = COSMETICS[r.cosmetic]
  return { img: c?.art ?? null, label: c?.name ?? r.cosmetic }
}

export function Pass() {
  const s = useSave()
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { s.ensurePass(); void refreshEntitlements() }, [])
  const pass = s.pass?.season === PASS.season && s.pass.baseXp >= 0 ? s.pass : { season: PASS.season, baseXp: s.xp, free: [], premium: [] }
  const xp = Math.max(0, s.xp - pass.baseXp)
  const tier = passTier(xp)
  const premium = (s.entitlements ?? []).includes('pass-s1')
  const unlock = async () => {
    setBusy(true)
    const r = await buy('pass-s1')
    setBusy(false)
    setNote(BUY_TEXT[r])
  }
  return (
    <Screen className="pass" bg="backgrounds/journal">
      <TopBar title="Spirit Pass" />
      <section className="pass-head">
        <Img id="ui/icons/pass" className="pass-icon" />
        <span className="rank-label">{PASS.name}</span>
        <strong className="pass-tier">Tier {tier}<small>/{PASS.tiers}</small></strong>
        {tier < PASS.tiers && <Bar value={xp % PASS.xpPerTier} max={PASS.xpPerTier} tone="gold" />}
        <span className="fine">{tier < PASS.tiers ? `${PASS.xpPerTier - (xp % PASS.xpPerTier)} XP to the next tier. Every battle earns XP.` : 'Season complete. Legendary.'}</span>
      </section>
      {!premium && (
        <section className="setting premium-card">
          <div><strong>Premium track</strong><span>Launchers, stadiums, frames and avatars. Cosmetic only; every gameplay reward is on the free track.</span></div>
          <Slash tone="gold" onClick={() => void unlock()} disabled={busy}>{busy ? 'Opening…' : `Unlock ${price(SKUS['pass-s1']!.paise)}`}</Slash>
        </section>
      )}
      {note && <p className="fine" role="status">{note}</p>}
      <div className="pass-cols" aria-hidden><span>Free</span><span /><span>Premium</span></div>
      <ol className="pass-track">
        {PASS_TIERS.map(t => {
          const reached = t.tier <= tier
          const cell = (track: 'free' | 'premium') => {
            const r = t[track], art = rewardArt(r), claimed = pass[track].includes(t.tier)
            const locked = track === 'premium' && !premium
            return (
              <div className={`pass-cell ${claimed ? 'claimed' : ''} ${locked ? 'locked' : ''}`}>
                {art.img ? <Img id={art.img} className="pass-art" /> : <span className="pass-title-art">“</span>}
                <span className="pass-label">{art.label}</span>
                {claimed ? <em>Claimed</em> : reached && !locked ? <button className="claim" onClick={() => s.claimPass(track, t.tier)}>Claim</button> : <em>{locked ? 'Premium' : `Tier ${t.tier}`}</em>}
              </div>
            )
          }
          return (
            <li key={t.tier} className={`pass-row ${reached ? 'reached' : ''}`}>
              {cell('free')}
              <span className="pass-num">{t.tier}</span>
              {cell('premium')}
            </li>
          )
        })}
      </ol>
    </Screen>
  )
}

type Kind = 'avatar' | 'frame' | 'title' | 'launcher' | 'stadium'
const KINDS: { k: Kind; label: string }[] = [{ k: 'avatar', label: 'Avatar' }, { k: 'frame', label: 'Frame' }, { k: 'title', label: 'Title' }, { k: 'launcher', label: 'Launcher' }, { k: 'stadium', label: 'Stadium' }]

function unlockHint(id: string): string {
  if (id === 'title-climber') return 'Reach Tower floor 10'
  for (const t of PASS_TIERS) {
    if ('cosmetic' in t.free && t.free.cosmetic === id) return `Pass tier ${t.tier}`
    if ('cosmetic' in t.premium && t.premium.cosmetic === id) return `Premium pass tier ${t.tier}`
  }
  if (Object.values(SKUS).some(k => k.grants.includes(id))) return 'In the Shop'
  if (id.startsWith('launcher-')) return 'Pick this beast as your starter'
  return 'Coming soon'
}

export function Profile() {
  const nav = useNav()
  const s = useSave()
  const [name, setName] = useState(s.name)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Kind>('avatar')
  useEffect(() => { void refreshEntitlements() }, [])
  const cos = s.cosmetics ?? { frame: 'frame-common', title: 'title-rookie', launcher: null, stadium: 'stadium-classic' }
  const owned = (id: string) => ownsCosmetic(s, id)
  const launcher = cos.launcher ?? (s.starter ? `launcher-${s.starter}` : null)
  const selected: Record<Kind, string> = { avatar: `avatar-${s.avatar + 1}`, frame: cos.frame, title: cos.title, launcher: launcher ?? '', stadium: cos.stadium }
  const items = Object.values(COSMETICS).filter(c => c.kind === tab)
  const pick = (id: string) => (tab === 'avatar' ? s.setAvatar(Number(id.split('-')[1]) - 1) : s.setCosmetic(tab, id))
  const beastId = s.loadout?.beastId ?? s.starter ?? 'voltfang'
  const lvl = levelForXp(s.xp)
  const st = s.stats
  const rate = st.battles ? Math.round((st.wins / st.battles) * 100) : 0
  const commit = () => { s.setName(name); setName(useSave.getState().name); setEditing(false) }
  const tier = passTier(s.xp - Math.max(0, s.pass?.baseXp ?? 0))
  return (
    <Screen className="profile2">
      <TopBar title="Profile" right={<button className="icon-btn icon-img" onClick={() => nav.push({ k: 'settings' })} aria-label="Settings"><Img id="ui/icons/settings" /></button>} />
      <section className="p2-card" style={{ ['--c' as string]: BEASTS[beastId].color }}>
        <Img id={`beasts/${beastId}/card-art`} className="p2-bg" />
        <div className="framed-avatar p2-avatar">
          <Img id={`characters/avatars/avatar-${s.avatar + 1}`} className="avatar-img" />
          <Img id={COSMETICS[cos.frame]?.art ?? 'ui/card-frame-common'} className="avatar-frame" />
        </div>
        <div className="p2-id">
          {editing ? (
            <form onSubmit={e => { e.preventDefault(); commit() }}>
              <input autoFocus value={name} onChange={e => setName(e.target.value.slice(0, 16))} onBlur={commit} aria-label="Spinner name" maxLength={16} />
            </form>
          ) : (
            <button className="p2-name" onClick={() => setEditing(true)} aria-label={`Name ${s.name}. Tap to change`}>{s.name}<span aria-hidden="true">Edit</span></button>
          )}
          <span className="p2-title">{COSMETICS[cos.title]?.name}</span>
          <span className="p2-level"><b>Level {lvl}</b><i><i style={{ transform: `scaleX(${Math.min(1, (s.xp - xpForLevel(lvl)) / Math.max(1, xpForLevel(lvl + 1) - xpForLevel(lvl)))})` }} /></i></span>
        </div>
      </section>
      <dl className="p2-stats">
        <div><dt>Battles</dt><dd>{st.battles}</dd></div>
        <div><dt>Wins</dt><dd>{st.wins}</dd></div>
        <div><dt>Win rate</dt><dd>{rate}%</dd></div>
        <div><dt>Best rip</dt><dd>{st.bestRpm.toLocaleString()}</dd></div>
        <div><dt>Tower</dt><dd>{s.tower}<small>/50</small></dd></div>
        <div><dt>Beasts</dt><dd>{Object.keys(s.beasts).length}<small>/6</small></dd></div>
      </dl>
      <h2 className="section-title">Your style</h2>
      <div className="p2-tabs" role="tablist" aria-label="Style">
        {KINDS.map(k => <button key={k.k} role="tab" aria-selected={tab === k.k} className={tab === k.k ? 'on' : ''} onClick={() => setTab(k.k)}>{k.label}</button>)}
      </div>
      <div className={`p2-grid k-${tab}`} role="radiogroup" aria-label={KINDS.find(k => k.k === tab)!.label}>
        {items.map(c => {
          const have = owned(c.id), on = selected[tab] === c.id
          return (
            <button key={c.id} role="radio" aria-checked={on} disabled={!have} className={`p2-item ${on ? 'on' : ''} ${have ? '' : 'locked'}`} onClick={() => pick(c.id)}>
              {c.art ? <Img id={c.art} /> : <span className="p2-title-art">{c.name}</span>}
              <strong>{c.name}</strong>
              <small>{on ? 'Equipped' : have ? 'Tap to equip' : unlockHint(c.id)}</small>
            </button>
          )
        })}
      </div>
      <button className="p2-pass" onClick={() => nav.push({ k: 'pass' })} aria-label="Open Spirit Pass rewards">
        <Img id="ui/icons/pass" />
        <span><strong>Spirit Pass</strong><small>Tier {tier} of {PASS.tiers} · every battle earns XP</small></span>
        <em>Open</em>
      </button>
    </Screen>
  )
}

export function CosmeticShop() {
  const s = useSave()
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  useEffect(() => { void refreshEntitlements().then(r => setProvider(r?.provider ?? 'offline')) }, [])
  const items = Object.values(SKUS).filter(k => k.id !== 'pass-s1')
  const purchase = async (sku: string) => {
    setBusy(sku)
    const r = await buy(sku)
    setBusy(null)
    setNote(BUY_TEXT[r])
  }
  return (
    <>
      {provider === 'none' && <p className="fine">Purchases open soon. Everything here is cosmetic.</p>}
      {note && <p className="fine" role="status">{note}</p>}
      <div className="shop-grid">
        {items.map(k => {
          const c = COSMETICS[k.grants[0]!]
          const have = ownsCosmetic(s, k.grants[0]!)
          return (
            <div key={k.id} className="shop-item">
              {c?.art && <Img id={c.art} className="shop-img" />}
              <strong>{k.name}</strong>
              <span>{c?.kind ?? 'Cosmetic'}</span>
              {have ? <em>Owned</em> : <button className="price" disabled={busy !== null || provider === 'none'} onClick={() => void purchase(k.id)}>{busy === k.id ? '…' : price(k.paise)}</button>}
            </div>
          )
        })}
      </div>
    </>
  )
}
