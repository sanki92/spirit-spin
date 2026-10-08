import { Group, type Texture } from 'three'
import type { BeastInfo } from '../../beasts'
import type { PowerTextures } from './PowerFx'
import { floorAt, helix, Ribbon } from './shapes'

const RISE = 0.4
const GONE = 0.9
const STILL_GONE = 0.45
const HEIGHT = 0.9
const PTS = 32

export interface PillarStyle { tex: Texture; tint: number; additive: boolean }

const STYLE: Record<BeastInfo['element'], [keyof PowerTextures, number, boolean]> = {
  lightning: ['lightning', 0xffffff, true],
  fire: ['fire', 0xffffff, true],
  wind: ['wind', 0xffffff, true],
  water: ['water', 0xffffff, true],
  crystal: ['crystal', 0xffffff, true],
  shadow: ['wind', 0x9a1a7a, false],
}

export const pillarStyle = (element: BeastInfo['element'], tex: PowerTextures): PillarStyle => {
  const [k, tint, additive] = STYLE[element]
  return { tex: tex[k], tint, additive }
}

export class Eruption {
  readonly group = new Group()
  private readonly ribbons: Ribbon[]
  private t = GONE
  private phase = 0

  constructor(style: PillarStyle) {
    this.ribbons = [0, 1].map(() => new Ribbon(style.tex, PTS, 0.16, style.additive))
    for (const r of this.ribbons) {
      r.mesh.material.color.setHex(style.tint)
      this.group.add(r.mesh)
    }
  }

  fire(): void {
    this.t = 0
    this.phase = 0
  }

  update(dt: number, x: number, y: number, still: boolean): void {
    if (this.t >= GONE) return
    this.t += dt
    const t = this.t, end = still ? STILL_GONE : GONE
    if (t >= end) return this.reset()
    const k = still ? 1 : Math.min(1, t / RISE)
    const a = still ? 1 - t / STILL_GONE : t < RISE ? 1 : 1 - (t - RISE) / (GONE - RISE)
    if (!still) this.phase += dt * 16
    const h = HEIGHT * (1 - (1 - k) ** 3), base = floorAt(x, y) + 0.02
    for (let s = 0; s < 2; s++) {
      const r = this.ribbons[s]!
      r.mesh.material.opacity = a
      r.mesh.visible = a > 0.01
      helix(r.points, x, y, base, Math.max(h, 0.02), this.phase + s * Math.PI, 2.5, 0.08 + 0.05 * k, -0.6)
      r.layout(false)
      if (!still) r.scroll(-dt * 3)
    }
  }

  reset(): void {
    this.t = GONE
    for (const r of this.ribbons) { r.mesh.material.opacity = 0; r.mesh.visible = false }
  }

  dispose(): void {
    for (const r of this.ribbons) r.dispose()
  }
}
