import type { BeastId } from '@spirit/core'
import { BEASTS } from '../game/beasts'
import { Img } from './kit'

const HIT: Record<string, string> = { lightning: 'vfx/hit-lightning', crystal: 'vfx/hit-crystal', water: 'vfx/hit-water', fire: 'vfx/hit-fire', wind: 'vfx/hit-wind', shadow: 'vfx/hit-shadow' }
const COPIES: Record<BeastId, number> = { voltfang: 3, aegiron: 6, nagara: 3, agnyx: 5, zephyra: 5, umbrax: 2 }

export function SpiritBurst({ beast, art }: { beast: BeastId; art: string }) {
  const b = BEASTS[beast]
  return (
    <div className={`spirit-burst burst-${beast}`} style={{ ['--c' as string]: b.color }} aria-hidden="true">
      <div className="burst-veil" />
      <Img id="vfx/impact-flash" className="burst-flash" eager />
      <Img id="vfx/shockwave" className="burst-ring" eager />
      {Array.from({ length: COPIES[beast] }, (_, i) => (
        <span key={i} className="burst-fx" style={{ ['--i' as string]: i, ['--n' as string]: COPIES[beast] }}>
          <Img id={HIT[b.element]!} eager />
        </span>
      ))}
      <Img id={`${art}/summon`} className="burst-summon" eager fallback={<Img id={`beasts/${beast}/summon`} className="burst-summon" eager />} />
      <strong className="burst-name">{b.name}</strong>
    </div>
  )
}
