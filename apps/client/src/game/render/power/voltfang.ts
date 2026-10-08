import type { BeastMove, TopState } from '@spirit/core'
import { Group, type Quaternion, type Sprite, type SpriteMaterial } from 'three'
import type { Power, PowerTextures } from './PowerFx'
import { floorAt, Ribbon, sprite } from './shapes'

const TRAIL = 24, BOLT_S = 0.22, STAGGER = 0.05
const OFF_X = [0, -0.09, 0.09] as const
const OFF_Y = [0, 0.05, -0.04] as const

export class VoltfangPower implements Power {
  readonly group = new Group()
  private readonly trail: Ribbon
  private readonly bolts: Sprite[]
  private readonly boltT: Float32Array
  private on = false

  constructor(tex: PowerTextures, _cap?: number, ultimate = false) {
    this.trail = new Ribbon(tex.lightning, TRAIL, 0.11)
    this.bolts = Array.from({ length: ultimate ? 3 : 1 }, () => {
      const b = sprite(tex.bolt)
      b.center.set(0.5, 0.2)
      b.scale.set(0.32, 1.5, 1)
      return b
    })
    this.boltT = new Float32Array(this.bolts.length)
    this.group.add(this.trail.mesh, ...this.bolts)
  }

  begin(me: TopState, _foe?: TopState): void {
    this.on = true
    const h = floorAt(me.x, me.y) + 0.012
    for (const pt of this.trail.points) pt.set(me.x, h, -me.y)
  }

  cue(move: BeastMove, _x: number, _y: number, foe: TopState): void {
    if (move !== 'strike') return
    for (let i = 0; i < this.bolts.length; i++) {
      this.boltT[i] = BOLT_S + i * STAGGER
      const x = foe.x + OFF_X[i]!, y = foe.y + OFF_Y[i]!
      this.bolts[i]!.position.set(x, floorAt(x, y), -y)
    }
  }

  update(dt: number, e: number, me: TopState, _foe: TopState, still: boolean, _camQ: Quaternion): void {
    const pts = this.trail.points
    if (this.on && e >= 0) {
      for (let i = pts.length - 1; i > 0; i--) pts[i]!.copy(pts[i - 1]!)
      pts[0]!.set(me.x, floorAt(me.x, me.y) + 0.012, -me.y)
    }
    this.trail.layout(true)
    if (!still) this.trail.scroll(-dt * 3)
    this.trail.fade(this.on && e >= 0 ? 1 : 0, dt)
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i]!
      if (this.boltT[i]! > 0) this.boltT[i]! -= dt
      const t = this.boltT[i]!, live = t > 0 && t <= BOLT_S
      if (live) {
        const flick = still || Math.sin(t * 90) > -0.3 ? 1 : 0.25
        ;(b.material as SpriteMaterial).opacity = flick * Math.min(1, t / 0.08)
      }
      b.visible = live
    }
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.boltT.fill(0)
    for (const b of this.bolts) b.visible = false
    this.trail.mesh.material.opacity = 0
    this.trail.mesh.visible = false
  }

  dispose(): void {
    this.trail.dispose()
    for (const b of this.bolts) b.material.dispose()
  }
}
