import { BLADES, COSMETICS, DISCS, PASS, PASS_TIERS, passTier, SKUS, TIPS, type PassReward } from '@spirit/core'
import { useEffect, useState } from 'react'
import { useNav } from '../../state/nav'
import { ownsCosmetic, useSave } from '../../state/save'
import { buy, refreshEntitlements, type BuyResult } from '../purchase'
import { Bar, Img, Screen, Slash, TopBar } from '../kit'

const price = (paise: number) => `₹${Math.round(paise / 100)}`
const BUY_TEXT: Record<BuyResult, string> = { bought: 'Unlocked. Enjoy!', cancelled: 'Payment cancelled.', unavailable: 'Purchases are not open yet.', failed: 'Payment did not go through. You were not charged twice; try again.' }

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
  useEffect(() => { void refreshEntitlements() }, [])
  const pass = s.pass?.season === PASS.season ? s.pass : { season: PASS.season, baseXp: 0, free: [], premium: [] }
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

export function Profile() {
  const nav = useNav()
  const s = useSave()
  const [name, setName] = useState(s.name)
  useEffect(() => { void refreshEntitlements() }, [])
  const cos = s.cosmetics ?? { frame: 'frame-common', title: 'title-rookie', launcher: null, stadium: 'stadium-classic' }
  const owned = (id: string) => ownsCosmetic(s, id)
  const list = (kind: 'frame' | 'title' | 'launcher' | 'stadium' | 'avatar') => Object.values(COSMETICS).filter(c => c.kind === kind)
  const launcher = cos.launcher ?? (s.starter ? `launcher-${s.starter}` : null)
  const pick = (kind: 'frame' | 'title' | 'launcher' | 'stadium', id: string) => s.setCosmetic(kind, id)
  return (
    <Screen className="profile-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={nav.back} aria-label="Back">‹</button>
        <h1 className="slant">Profile</h1>
        <button className="icon-btn gear" onClick={() => nav.push({ k: 'settings' })} aria-label="Settings">⚙</button>
      </header>
      <section className="profile-card">
        <div className="framed-avatar large">
          <Img id={`characters/avatars/avatar-${s.avatar + 1}`} className="avatar-img" />
          <Img id={COSMETICS[cos.frame]?.art ?? 'ui/card-frame-common'} className="avatar-frame" />
        </div>
        <form className="name-form" onSubmit={e => { e.preventDefault(); s.setName(name); setName(useSave.getState().name) }}>
          <input value={name} onChange={e => setName(e.target.value.slice(0, 16))} aria-label="Spinner name" maxLength={16} onBlur={() => { s.setName(name); setName(useSave.getState().name) }} />
        </form>
        <span className="profile-title">{COSMETICS[cos.title]?.name}</span>
      </section>
      <Picker title="Avatar" items={list('avatar')} selected={`avatar-${s.avatar + 1}`} owned={owned} onPick={id => s.setAvatar(Number(id.split('-')[1]) - 1)} />
      <Picker title="Frame" items={list('frame')} selected={cos.frame} owned={owned} onPick={id => pick('frame', id)} />
      <Picker title="Launcher" items={list('launcher')} selected={launcher ?? ''} owned={owned} onPick={id => pick('launcher', id)} />
      <Picker title="Stadium" items={list('stadium')} selected={cos.stadium} owned={owned} onPick={id => pick('stadium', id)} />
      <section className="picker">
        <h2>Title</h2>
        <div className="title-list">
          {list('title').map(c => (
            <button key={c.id} className={`title-chip ${cos.title === c.id ? 'on' : ''}`} disabled={!owned(c.id)} onClick={() => pick('title', c.id)} aria-pressed={cos.title === c.id}>{owned(c.id) ? c.name : `Locked · ${c.name}`}</button>
          ))}
        </div>
      </section>
      <Slash tone="ghost" onClick={() => nav.push({ k: 'pass' })}>Spirit Pass rewards</Slash>
    </Screen>
  )
}

function Picker({ title, items, selected, owned, onPick }: { title: string; items: { id: string; name: string; art: string | null }[]; selected: string; owned: (id: string) => boolean; onPick: (id: string) => void }) {
  return (
    <section className="picker">
      <h2>{title}</h2>
      <div className="picker-row" role="radiogroup" aria-label={title}>
        {items.map(c => {
          const have = owned(c.id)
          return (
            <button key={c.id} role="radio" aria-checked={selected === c.id} disabled={!have} className={`picker-item ${selected === c.id ? 'on' : ''} ${have ? '' : 'locked'}`} onClick={() => onPick(c.id)}>
              {c.art && <Img id={c.art} eager />}
              <span>{have ? c.name : 'Locked'}</span>
            </button>
          )
        })}
      </div>
    </section>
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
