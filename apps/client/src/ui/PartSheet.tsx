import { assembleTop, BLADES, DISCS, dropFloor, PART_PRICE, TIPS, type TopBuild, type TopStats } from '@spirit/core'
import { useEffect, useRef } from 'react'
import { BEASTS } from '../game/beasts'
import { storyBuild, useSave } from '../state/save'
import { Img } from './kit'

export type PartKind = 'blade' | 'disc' | 'tip'
const STAT: Record<keyof TopStats, string> = { attack: 'Attack', defense: 'Defense', stamina: 'Stamina', speed: 'Speed' }
const KIND: Record<PartKind, string> = { blade: 'Blade', disc: 'Disc', tip: 'Tip' }
const TYPE: Record<string, string> = { attack: 'Attack', defense: 'Defense', stamina: 'Stamina', balance: 'Balance' }

function facts(kind: PartKind, id: string): string[] {
  if (kind === 'blade') { const b = BLADES[id]!; return [`Hits ${b.attack >= 8 ? 'very hard' : b.attack >= 5 ? 'hard' : 'softly'}`, `Guards ${b.defense >= 8 ? 'like a wall' : b.defense >= 5 ? 'well' : 'lightly'}`, `Resists cracks ${b.shatterRes >= 6 ? 'very well' : b.shatterRes >= 4 ? 'well' : 'a little'}`] }
  if (kind === 'disc') { const d = DISCS[id]!; return [d.mass >= 1.2 ? 'Heavy: hard to knock away, slower' : d.mass <= 0.85 ? 'Light: quick, easy to knock away' : 'Medium weight', d.rim >= 0.8 ? 'Weight on the rim: spins longer' : 'Weight in the middle'] }
  const t = TIPS[id]!
  const shape: Record<string, string> = { flat: 'Flat: fast and aggressive', ball: 'Ball: steady, hard to push', needle: 'Needle: spins the longest', semi: 'Semi: a bit of everything' }
  return [shape[t.kind] ?? t.kind, t.driveMod > 1.02 ? 'Extra grip: faster' : t.driveMod < 0.95 ? 'Low grip: slower' : 'Normal grip', t.decayMod < 0.98 ? 'Keeps spin longer' : t.decayMod > 1.04 ? 'Loses spin faster' : 'Normal spin loss']
}

export function PartSheet({ kind, id, onClose, onBuy, price }: { kind: PartKind; id: string; onClose: () => void; onBuy?: () => void; price?: number }) {
  const s = useSave()
  const table = kind === 'blade' ? BLADES : kind === 'disc' ? DISCS : TIPS
  const part = table[id]!
  const owned = s.owned[`${kind}s`].includes(id)
  const base: TopBuild = s.loadout ?? { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: s.starter ?? 'voltfang' }
  const swapKey = kind === 'blade' ? 'bladeId' : kind === 'disc' ? 'discId' : 'tipId'
  const equipped = base[swapKey] === id
  const now = assembleTop(storyBuild(s, base))
  const next = assembleTop(storyBuild(s, { ...base, [swapKey]: id }))
  const replaces = (table[base[swapKey]] as { name: string } | undefined)?.name
  const floor = dropFloor(kind, id)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])
  const equip = () => { s.setLoadout({ bladeId: base.bladeId, discId: base.discId, tipId: base.tipId, beastId: base.beastId, [swapKey]: id } as TopBuild); onClose() }
  const cost = price ?? PART_PRICE[part.rarity]
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className={`sheet ${part.rarity}`} role="dialog" aria-modal="true" aria-label={part.name} onClick={e => e.stopPropagation()} style={{ ['--c' as string]: BEASTS[base.beastId].color }}>
        <i className="sheet-grip" aria-hidden="true" />
        <button ref={close} className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <header className="sheet-head">
          <div className={`sheet-art ${kind}`}><Img id={`parts/${kind}-${id}`} eager /></div>
          <div>
            <span className={`rarity ${part.rarity}`}>{part.rarity} {KIND[kind]}</span>
            <h2>{part.name}</h2>
            <ul className="sheet-facts">{facts(kind, id).map(f => <li key={f}>{f}</li>)}</ul>
          </div>
        </header>
        <h3 className="section-title">{equipped ? `On your ${BEASTS[base.beastId].name} now` : `On your ${BEASTS[base.beastId].name}${replaces ? `, replacing ${replaces}` : ''}`}</h3>
        <div className="sheet-compare">
          {(Object.keys(STAT) as (keyof TopStats)[]).map(k => {
            const d = next.stats[k] - now.stats[k]
            return (
              <div key={k} className="cmp-row">
                <span>{STAT[k]}</span>
                <div className="cmp-pips" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < Math.min(now.stats[k], next.stats[k]) ? 'on' : i < next.stats[k] ? 'up' : i < now.stats[k] ? 'down' : ''} />)}</div>
                <b className={d > 0 ? 'up' : d < 0 ? 'down' : ''} aria-label={`${STAT[k]} ${now.stats[k]} to ${next.stats[k]}`}>{d > 0 ? `+${d}` : d < 0 ? d : '='}</b>
              </div>
            )
          })}
          {now.type !== next.type && <p className="cmp-type">Your top becomes a <b>{TYPE[next.type]}</b> type (was {TYPE[now.type]}).</p>}
        </div>
        <div className="sheet-actions">
          {equipped ? <span className="sheet-note">Equipped</span>
            : owned ? <button className="cta cyan" onClick={equip}><span>Equip on {BEASTS[base.beastId].name}</span></button>
            : onBuy ? (
              <button className="cta gold" onClick={onBuy}><span><Img id="ui/icon-coin" className="cta-coin" />{`Buy for ${cost.toLocaleString('en-IN')}`}</span></button>
            ) : <span className="sheet-note">{floor ? (floor <= s.tower ? 'Look for it in the Shop rotation' : `Drops on Tower floor ${floor}`) : 'Look for it in the daily Shop'}</span>}
        </div>
      </section>
    </div>
  )
}
