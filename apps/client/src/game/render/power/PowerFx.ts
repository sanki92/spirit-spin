import { TUNING, type BattleEvent, type BeastId, type BeastMove, type TopState } from '@spirit/core'
import { Group, type Quaternion, type Texture } from 'three'

export interface PowerTextures {
  crystal: Texture; rocks: Texture; lightning: Texture; bolt: Texture; water: Texture; whirlpool: Texture; splash: Texture
  fire: Texture; feather: Texture; fireRing: Texture; wind: Texture; debris: Texture; shadowPool: Texture; claw: Texture; slash: Texture; crack: Texture
}

export interface Power {
  readonly group: Group
  begin(me: TopState, foe: TopState): void
  cue(move: BeastMove, x: number, y: number, foe: TopState): void
  update(dt: number, e: number, me: TopState, foe: TopState, still: boolean, camQ: Quaternion): void
  end(): void
  reset(): void
  dispose(): void
}

export type PowerFactory = (tex: PowerTextures, cap: number) => Power

const quiet: PowerFactory = () => ({ group: new Group(), begin() {}, cue() {}, update() {}, end() {}, reset() {}, dispose() {} })

export class PowerFx {
  readonly group = new Group()
  private sides: [Power, Power] | null = null
  private on: [boolean, boolean] = [false, false]

  constructor(private readonly tex: PowerTextures, private readonly cap: number, private readonly registry: Partial<Record<BeastId, PowerFactory>>) {}

  setBeasts(ids: readonly [BeastId, BeastId]): void {
    if (this.sides) for (const p of this.sides) { this.group.remove(p.group); p.dispose() }
    this.sides = [this.make(ids[0]), this.make(ids[1])]
    this.on = [false, false]
    for (const p of this.sides) this.group.add(p.group)
  }

  onEvent(e: BattleEvent, tops: readonly [TopState, TopState] | null): void {
    if (!this.sides || !tops || e.k !== 'beast') return
    this.sides[e.side].cue(e.move, e.x, e.y, tops[(1 - e.side) as 0 | 1])
  }

  update(dt: number, tops: readonly [TopState, TopState], still: boolean, camQ: Quaternion): void {
    if (!this.sides) return
    for (let i = 0; i < 2; i++) {
      const me = tops[i as 0 | 1], foe = tops[(1 - i) as 0 | 1], p = this.sides[i as 0 | 1]
      const e = me.spiritTicks > 0 && me.summonTicks === 0 ? TUNING.takeoverTicks - 1 - me.spiritTicks : -1
      if (e >= 0 && !this.on[i]) { this.on[i] = true; p.begin(me, foe) }
      if (e < 0 && this.on[i]) { this.on[i] = false; p.end() }
      p.update(dt, e, me, foe, still, camQ)
    }
  }

  reset(): void {
    this.on = [false, false]
    if (this.sides) for (const p of this.sides) p.reset()
  }

  private make(id: BeastId): Power {
    return (this.registry[id] ?? quiet)(this.tex, this.cap)
  }
}
