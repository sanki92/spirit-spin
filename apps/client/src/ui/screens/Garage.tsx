import { assembleTop, BLADES, DISCS, TIPS, type BeastId, type TopBuild } from '@spirit/core'
import { useState } from 'react'
import { BEASTS } from '../../game/beasts'
import { useSave } from '../../state/save'
import { Img, Screen, Slash, Stat, TopBar } from '../kit'
import { beastArt } from './Home'

type Slot = 'blade' | 'disc' | 'tip' | 'beast'

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

export function Garage() {
  const s = useSave()
  const [draft, setDraft] = useState<TopBuild>(s.loadout ?? { bladeId: 'fang', discId: 'standard', tipId: 'flat', beastId: s.starter ?? 'voltfang' })
  const [slot, setSlot] = useState<Slot>('blade')
  const spec = assembleTop(draft)
  const options: { id: string; label: string; img: string; rarity?: string | undefined }[] =
    slot === 'blade' ? s.owned.blades.map(id => ({ id, label: BLADES[id]?.name ?? id, img: `parts/blade-${id}`, rarity: BLADES[id]?.rarity }))
    : slot === 'disc' ? s.owned.discs.map(id => ({ id, label: DISCS[id]?.name ?? id, img: `parts/disc-${id}`, rarity: DISCS[id]?.rarity }))
    : slot === 'tip' ? s.owned.tips.map(id => ({ id, label: TIPS[id]?.name ?? id, img: `parts/tip-${id}`, rarity: TIPS[id]?.rarity }))
    : (Object.keys(s.beasts) as BeastId[]).map(id => ({ id, label: BEASTS[id].name, img: `beasts/${id}/emblem` }))
  const current = slot === 'blade' ? draft.bladeId : slot === 'disc' ? draft.discId : slot === 'tip' ? draft.tipId : draft.beastId
  const choose = (id: string) =>
    setDraft(d => (slot === 'blade' ? { ...d, bladeId: id } : slot === 'disc' ? { ...d, discId: id } : slot === 'tip' ? { ...d, tipId: id } : { ...d, beastId: id as BeastId }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.loadout)
  return (
    <Screen className="garage" bg="backgrounds/garage">
      <TopBar title="Garage" />
      <div className="garage-stage">
        <TopPreview build={draft} />
        <div className="garage-meta">
          <strong className="slant">{BEASTS[draft.beastId].name}</strong>
          <span className={`type-tag ${spec.type}`}><Img id={`ui/type-${spec.type}`} />{spec.type}</span>
          <Stat name="Attack" value={spec.stats.attack} />
          <Stat name="Defense" value={spec.stats.defense} />
          <Stat name="Stamina" value={spec.stats.stamina} />
          <Stat name="Speed" value={spec.stats.speed} />
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(['blade', 'disc', 'tip', 'beast'] as Slot[]).map(t => (
          <button key={t} role="tab" aria-selected={slot === t} className={slot === t ? 'on' : ''} onClick={() => setSlot(t)}>{t === 'beast' ? 'Spirit' : t[0]!.toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      <div className="part-grid">
        {options.map(o => (
          <button key={o.id} className={`part ${o.id === current ? 'on' : ''} ${o.rarity ?? ''}`} onClick={() => choose(o.id)}>
            <Img id={o.img} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <Slash tone={dirty ? 'gold' : 'ghost'} disabled={!dirty} onClick={() => s.setLoadout(draft)}>{dirty ? 'Equip this top' : 'Equipped'}</Slash>
    </Screen>
  )
}
