import {
  assembleTop, BLADES, bladePrimary, DISCS, discPrimary, kitFor, MAX_PART_LEVEL, partKey, TECHNIQUES, TIPS, tipPrimary, TRAIT_COST, TRAIT_TRUST, upgradeCost,
  type BeastId, type PartKind, type TopBuild, type TopStats,
} from '@spirit/core'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useRuntime } from '../../runtime'
import { progress, storyBuild, useSave } from '../../state/save'
import { log } from '../../telemetry'
import { Coins, Img, Screen, Shards, Slash, TopBar } from '../kit'
import { SpiritBurst } from '../SpiritBurst'
import type { ViewFocus } from '../TopViewer'
import { beastArt } from './Home'

const TopViewer = lazy(() => import('../TopViewer'))

type Slot = 'blade' | 'disc' | 'tip' | 'beast'
const STAT_NAME: Record<keyof TopStats, string> = { attack: 'Attack', defense: 'Defense', stamina: 'Stamina', speed: 'Speed' }

export function TopPreview({ build, size = 220 }: { build: TopBuild; size?: number }) {
  const beast = useSave(s => s.beasts[build.beastId])
  return (
    <div className="top-preview" style={{ width: size, height: size }}>
      <Img id={`parts/disc-${build.discId}`} className="layer disc" eager />
      <Img id={`parts/blade-${build.bladeId}`} className="layer blade" eager />
      <Img id={`${beastArt(build.beastId, beast?.awakened)}/emblem`} className="layer chip" fallback={<Img id={`beasts/${build.beastId}/emblem`} className="layer chip" />} />
    </div>
  )
}

function StatRow({ name, value, next }: { name: string; value: number; next: number }) {
  return (
    <div className="stat">
      <span>{name}</span>
      <div className="pips10">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < value ? 'on' : i < next ? 'next' : ''} />)}</div>
    </div>
  )
}

function partInfo(kind: PartKind, id: string) {
  if (kind === 'blade') { const b = BLADES[id]!; return { name: b.name, rarity: b.rarity, primary: bladePrimary(b) } }
  if (kind === 'disc') { const d = DISCS[id]!; return { name: d.name, rarity: d.rarity, primary: discPrimary(d) } }
  const t = TIPS[id]!
  return { name: t.name, rarity: t.rarity, primary: tipPrimary(t) }
}

export function Garage() {
  const s = useSave()
  const rt = useRuntime()
  const [draft, setDraft] = useState<TopBuild>(s.loadout ?? { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: s.starter ?? 'voltfang' })
  const [slot, setSlot] = useState<Slot>('blade')
  const [burst, setBurst] = useState(0)
  const [ready3d, setReady3d] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef(0)
  useEffect(() => () => clearTimeout(flashTimer.current), [])
  const toTop = () => document.querySelector('.page.garage')?.scrollTo({ top: 0, behavior: s.settings.reducedMotion ? 'auto' : 'smooth' })
  const say = (m: string) => { setFlash(m); clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlash(null), 2200) }

  const p = progress(s)
  const spec = assembleTop(storyBuild(s, draft))
  const beast = s.beasts[draft.beastId]
  const art = beastArt(draft.beastId, beast?.awakened)
  const kind: PartKind | null = slot === 'beast' ? null : slot
  const currentId = slot === 'blade' ? draft.bladeId : slot === 'disc' ? draft.discId : slot === 'tip' ? draft.tipId : draft.beastId
  const level = kind ? p.partLevels[partKey(kind, currentId)] ?? 1 : 1
  const cost = kind ? upgradeCost(level) : null
  const info = kind ? partInfo(kind, currentId) : null
  const nextSpec = kind && cost !== null ? assembleTop(storyBuild({ ...s, partLevels: { ...p.partLevels, [partKey(kind, currentId)]: level + 1 } }, draft)) : spec

  const gains = (Object.keys(STAT_NAME) as (keyof TopStats)[]).map(k => [k, nextSpec.stats[k] - spec.stats[k]] as const).filter(([, d]) => d > 0)
  const spilled = !!info && gains.length > 0 && !gains.some(([k]) => k === info.primary)
  const options: { id: string; label: string; img: string; rarity?: string | undefined; lv?: number }[] =
    slot === 'beast'
      ? (Object.keys(s.beasts) as BeastId[]).map(id => ({ id, label: BEASTS[id].name, img: `${beastArt(id, s.beasts[id]?.awakened)}/emblem` }))
      : (s.owned[`${slot}s`] ?? []).filter(id => (slot === 'blade' ? BLADES : slot === 'disc' ? DISCS : TIPS)[id]).map(id => {
          const i = partInfo(slot, id)
          return { id, label: i.name, img: `parts/${slot}-${id}`, rarity: i.rarity, lv: p.partLevels[partKey(slot, id)] ?? 1 }
        })

  const choose = (id: string) => {
    if (id === currentId) return
    rt.sound.play('ui', { volume: 0.5 })
    toTop()
    if (slot === 'beast') { setBurst(n => n + 1); rt.sound.play('spirit', { volume: 0.7 }) }
    setDraft(d => (slot === 'blade' ? { ...d, bladeId: id } : slot === 'disc' ? { ...d, discId: id } : slot === 'tip' ? { ...d, tipId: id } : { ...d, beastId: id as BeastId }))
  }
  const upgrade = () => {
    if (!kind || cost === null) return
    if (!s.upgradePart(kind, currentId)) return say(`You need ${cost - (s.shards ?? 0)} more Spirit Shards`)
    rt.sound.play('callout')
    log('garage.upgrade', { kind, id: currentId, level: level + 1 })
    say(`${info!.name} is now level ${level + 1}`)
    toTop()
  }
  const buyTrait = () => {
    if (!s.buyTrait(draft.beastId)) return say(`You need ${TRAIT_COST - (s.shards ?? 0)} more Spirit Shards`)
    rt.sound.play('callout')
    log('garage.trait', { beast: draft.beastId })
    say(`${TECHNIQUES[draft.beastId].trait.name} unlocked`)
    toTop()
  }

  const saved = !!s.loadout && (['bladeId', 'discId', 'tipId', 'beastId'] as const).every(k => draft[k] === s.loadout![k])
  const kit = kitFor(draft.beastId, p, beast)
  const tech = TECHNIQUES[draft.beastId]
  const focus: ViewFocus = slot

  const grid = (
    <div className="part-grid">
      {options.map(o => (
        <button key={o.id} className={`part ${o.id === currentId ? 'on' : ''} ${o.rarity ?? ''}`} onClick={() => choose(o.id)} aria-pressed={o.id === currentId}>
          <Img id={o.img} />
          <span>{o.label}</span>
          {o.lv !== undefined && o.lv > 1 && <i className="lv">Lv {o.lv}</i>}
        </button>
      ))}
    </div>
  )

  return (
    <Screen className="garage" bg="backgrounds/garage">
      <TopBar title="Garage" right={<div className="wallet"><Shards /><Coins /></div>} />
      <div className="garage-stage" style={{ ['--c' as string]: BEASTS[draft.beastId].color }}>
        <div className="viewer-wrap">
          <div className={`viewer-2d ${ready3d ? 'gone' : ''}`} aria-hidden="true"><TopPreview build={draft} size={240} /></div>
          <Suspense fallback={null}>
            <TopViewer blade={draft.bladeId} disc={draft.discId} tip={draft.tipId} emblem={`${art}/emblem-disc`} color={BEASTS[draft.beastId].color} focus={focus} still={s.settings.reducedMotion} onReady={() => setReady3d(true)} />
          </Suspense>
          {burst > 0 && <SpiritBurst key={burst} beast={draft.beastId} art={art} />}
          <span className="viewer-hint">Drag to turn</span>
        </div>
        <div className="garage-meta">
          <div className="garage-title">
            <strong className="slant">{BEASTS[draft.beastId].name}</strong>
            <span className={`type-tag ${spec.type}`}><Img id={`ui/type-${spec.type}`} />{spec.type}</span>
          </div>
          {(Object.keys(STAT_NAME) as (keyof TopStats)[]).map(k => <StatRow key={k} name={STAT_NAME[k]} value={spec.stats[k]} next={nextSpec.stats[k]} />)}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(['blade', 'disc', 'tip', 'beast'] as Slot[]).map(t => (
          <button key={t} role="tab" aria-selected={slot === t} className={slot === t ? 'on' : ''} onClick={() => setSlot(t)}>{t === 'beast' ? 'Spirit' : t[0]!.toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {slot === 'beast' && grid}
      {kind && info && (
        <section className={`part-detail ${info.rarity}`}>
          <div>
            <strong>{info.name}</strong>
            <span className="part-sub"><em className={`rarity ${info.rarity}`}>{info.rarity}</em> · Level {level} of {MAX_PART_LEVEL}</span>
            <span className="part-gain">{cost === null ? 'Fully upgraded' : gains.length ? `Next level: ${gains.map(([k, d]) => `+${d} ${STAT_NAME[k]}`).join(', ')}${spilled ? ` (${STAT_NAME[info.primary]} is maxed)` : ''}` : 'Every stat this part can raise is maxed'}</span>
          </div>
          {cost === null ? <span className="maxed">Max level</span> : (
            <button className="upgrade-btn" onClick={upgrade} disabled={(s.shards ?? 0) < cost || gains.length === 0} aria-label={`Upgrade ${info.name} for ${cost} Spirit Shards`}>
              <span>Upgrade</span>
              <b><Img id="ui/icon-spirit-shard" />{cost}</b>
            </button>
          )}
        </section>
      )}

      {slot === 'beast' && (
        <section className="abilities" style={{ ['--c' as string]: BEASTS[draft.beastId].color }}>
          <div className="ability on">
            <b>Technique</b><strong>{tech.technique.name}</strong>
            <p>{tech.technique.text} Fires when you make the Spirit Call.</p>
          </div>
          <div className={`ability ${kit.trait ? 'on' : 'locked'}`}>
            <b>Trait</b><strong>{tech.trait.name}</strong>
            <p>{tech.trait.text}</p>
            {!kit.trait && (
              <div className="ability-lock">
                <span>Unlocks at Trust {TRAIT_TRUST} (now {beast?.trust ?? 0})</span>
                <button className="upgrade-btn" onClick={buyTrait} disabled={(s.shards ?? 0) < TRAIT_COST}><span>Unlock now</span><b><Img id="ui/icon-spirit-shard" />{TRAIT_COST}</b></button>
              </div>
            )}
          </div>
          <div className={`ability ${kit.ultimate ? 'on' : 'locked'}`}>
            <b>Ultimate</b><strong>{tech.ultimate.name}</strong>
            <p>{tech.ultimate.text}</p>
            {!kit.ultimate && <div className="ability-lock"><span>Awaken {BEASTS[draft.beastId].name} through your bond to unlock</span></div>}
          </div>
          <p className="fair-note">Upgrades, traits and ultimates power up Story and Tower battles. Online, ranked and cup battles use base strength so every fight is fair.</p>
        </section>
      )}

      {slot !== 'beast' && grid}
      {flash && <div className="toast" role="status">{flash}</div>}
      <div className="garage-cta">
        <Slash tone={saved ? 'ghost' : 'gold'} disabled={!!saved} onClick={() => { s.setLoadout({ bladeId: draft.bladeId, discId: draft.discId, tipId: draft.tipId, beastId: draft.beastId }); toTop();rt.sound.play('launch', { volume: 0.4 }); say('Equipped. Ready to battle') }}>{saved ? 'Equipped' : 'Equip this top'}</Slash>
      </div>
    </Screen>
  )
}
