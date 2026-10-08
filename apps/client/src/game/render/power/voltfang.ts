import type { BeastMove, TopState } from '@spirit/core'
import { Group, type Quaternion, type Sprite, type SpriteMaterial } from 'three'
import type { Power, PowerTextures } from './PowerFx'
import { floorAt, Ribbon, sprite } from './shapes'

const TRAIL = 24, BOLT_S = 0.22

export class VoltfangPower implements Power {
  readonly group = new Group()
  private readonly trail: Ribbon
  private readonly bolt: Sprite
  private boltT = 0
  private on = false

  constructor(tex: PowerTextures, _cap?: number) {
    this.trail = new Ribbon(tex.lightning, TRAIL, 0.11)
    this.bolt = sprite(tex.bolt)
    this.bolt.center.set(0.5, 0.2)
    this.bolt.scale.set(0.32, 1.5, 1)
    this.group.add(this.trail.mesh, this.bolt)
  }

  begin(me: TopState, _foe?: TopState): void {
    this.on = true
    const h = floorAt(me.x, me.y) + 0.012
    for (const pt of this.trail.points) pt.set(me.x, h, -me.y)
  }

  cue(move: BeastMove, _x: number, _y: number, foe: TopState): void {
    if (move !== 'strike') return
    this.boltT = BOLT_S
    this.bolt.position.set(foe.x, floorAt(foe.x, foe.y), -foe.y)
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
    const m = this.bolt.material as SpriteMaterial
    if (this.boltT > 0) {
      this.boltT -= dt
      const flick = still || Math.sin(this.boltT * 90) > -0.3 ? 1 : 0.25
      m.opacity = flick * Math.min(1, Math.max(0, this.boltT) / 0.08)
    }
    this.bolt.visible = this.boltT > 0
  }

  end(): void {
    this.on = false
  }

  reset(): void {
    this.on = false
    this.boltT = 0
    this.bolt.visible = false
    this.trail.mesh.material.opacity = 0
    this.trail.mesh.visible = false
  }

  dispose(): void {
    this.trail.dispose()
    this.bolt.material.dispose()
  }
}
